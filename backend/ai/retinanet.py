"""Sample video frames and detect COCO 'person' boxes with RetinaNet."""

from __future__ import annotations

from contextlib import nullcontext
from dataclasses import dataclass
import os
from pathlib import Path
from time import perf_counter
from typing import Any

from .clothing_colors import estimate_clothing_colors


MODEL_NAME = "retinanet_resnet50_fpn_v2"
MODEL_VERSION = "COCO_V1"


@dataclass(frozen=True)
class DetectionOptions:
    score_threshold: float = 0.4
    sample_seconds: float = 0.5
    max_frames: int = 120
    max_image_side: int = 1280
    inference_batch_size: int = 0
    use_amp: bool = False

    def __post_init__(self) -> None:
        if not 0 < self.score_threshold <= 1:
            raise ValueError("score_threshold must be in (0, 1]")
        if (
            self.sample_seconds <= 0
            or self.max_frames < 0
            or self.max_image_side < 320
            or self.inference_batch_size < 0
        ):
            raise ValueError(
                "sample_seconds must be positive, max_frames must be 0 (full video) or greater, max_image_side >= 320, "
                "and inference_batch_size must be 0 (auto) or greater"
            )


def load_detector(device: str = "cpu") -> tuple[Any, Any, int, Any]:
    import torch
    from torchvision.models.detection import (
        RetinaNet_ResNet50_FPN_V2_Weights,
        retinanet_resnet50_fpn_v2,
    )

    if device not in {"cpu", "cuda", "auto"}:
        raise ValueError("device must be cpu, cuda, or auto")
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available")
    if device == "cpu":
        torch.set_num_threads(2)
    weights = RetinaNet_ResNet50_FPN_V2_Weights.COCO_V1
    person_label = weights.meta["categories"].index("person")
    model = retinanet_resnet50_fpn_v2(weights=weights).eval().to(device)
    return model, weights.transforms(), person_label, torch


def detect_video(
    video_path: Path,
    options: DetectionOptions = DetectionOptions(),
    detector: tuple[Any, Any, int, Any] | None = None,
) -> dict[str, Any]:
    import cv2
    from PIL import Image

    model, transform, person_label, torch = detector or load_detector()
    native_predict = hasattr(model, "predict_images")
    model_device = model.device if native_predict else next(model.parameters()).device
    batch_size = 1 if native_predict else options.inference_batch_size or (2 if model_device.type == "cuda" else 1)
    amp_enabled = options.use_amp and model_device.type == "cuda" and not native_predict
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Unable to open uploaded video")

    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if not 0 < fps < 240:
        fps = 25.0
    frame_step = max(1, round(fps * options.sample_seconds))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    reported_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    frames: list[dict[str, Any]] = []
    pending_samples: list[dict[str, Any]] = []
    frame_index = 0
    reached_end = False
    if model_device.type == "cuda":
        torch.cuda.synchronize(model_device)
    processing_started = perf_counter()

    def infer_pending_samples() -> None:
        if not pending_samples:
            return
        model_inputs = [sample["tensor"] if native_predict else sample["tensor"].to(model_device) for sample in pending_samples]
        amp_context = (
            torch.autocast(device_type="cuda", dtype=torch.float16)
            if amp_enabled
            else nullcontext()
        )
        with torch.inference_mode(), amp_context:
            predictions = model.predict_images(model_inputs, options.score_threshold) if native_predict else model(model_inputs)

        for sample, prediction in zip(pending_samples, predictions):
            original_width = sample["original_width"]
            original_height = sample["original_height"]
            resized_width = sample["resized_width"]
            resized_height = sample["resized_height"]
            boxes = []
            for label, score, box in zip(
                prediction["labels"].tolist(),
                prediction["scores"].tolist(),
                prediction["boxes"].tolist(),
            ):
                if label != person_label or score < options.score_threshold:
                    continue
                boxes.append({
                    "score": round(float(score), 4),
                    "clothing_colors": estimate_clothing_colors(sample["bgr_frame"], box),
                    "xyxy": [
                        round(
                            float(value)
                            * (
                                original_width / resized_width
                                if index % 2 == 0
                                else original_height / resized_height
                            ),
                            2,
                        )
                        for index, value in enumerate(box)
                    ],
                })
            frames.append({
                "frame_index": sample["frame_index"],
                "time_seconds": round(sample["frame_index"] / fps, 3),
                "detections": boxes,
            })
        pending_samples.clear()

    try:
        while options.max_frames == 0 or len(frames) + len(pending_samples) < options.max_frames:
            ok, frame = capture.read()
            if not ok:
                reached_end = True
                break
            if frame_index % frame_step == 0:
                original_height, original_width = frame.shape[:2]
                scale = min(1.0, options.max_image_side / max(original_width, original_height))
                if scale < 1.0:
                    frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
                resized_height, resized_width = frame.shape[:2]
                image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                pending_samples.append({
                    "tensor": transform(image),
                    "bgr_frame": frame,
                    "original_width": original_width,
                    "original_height": original_height,
                    "resized_width": resized_width,
                    "resized_height": resized_height,
                    "frame_index": frame_index,
                })
                if len(pending_samples) >= batch_size:
                    infer_pending_samples()
            frame_index += 1
        infer_pending_samples()
        # Some codecs do not report frame count. Probe once when the sample cap is
        # reached so an exactly-at-the-end video is not marked as truncated.
        if not reached_end and reported_frame_count <= 0:
            reached_end = not capture.read()[0]
    finally:
        capture.release()

    if model_device.type == "cuda":
        torch.cuda.synchronize(model_device)
    processing_seconds = max(perf_counter() - processing_started, 0.0)

    if frame_index == 0:
        raise ValueError("Uploaded video has no readable frames")

    return {
        "schema_version": 1,
        "model": getattr(model, "model_name", MODEL_NAME),
        "weights": getattr(model, "weights_version", MODEL_VERSION),
        "code_revision": os.environ.get("NCKH_CODE_REVISION"),
        "torch_version": torch.__version__,
        "device": str(model_device),
        "score_threshold": options.score_threshold,
        "sample_seconds": options.sample_seconds,
        "max_image_side": options.max_image_side,
        "inference_batch_size": batch_size,
        "amp_enabled": amp_enabled,
        "inference_precision": getattr(model, "inference_precision", "mixed" if amp_enabled else "fp32"),
        "processing_seconds": round(processing_seconds, 3),
        "sampled_frames_per_second": round(len(frames) / processing_seconds, 3) if processing_seconds else 0.0,
        "width": width,
        "height": height,
        "fps": round(fps, 3),
        "frames_read": frame_index,
        "frames_sampled": len(frames),
        "max_frames": options.max_frames,
        "last_sample_time_seconds": frames[-1]["time_seconds"] if frames else None,
        "video_duration_seconds": round(reported_frame_count / fps, 3) if reported_frame_count > 0 else None,
        "truncated": not reached_end and (reported_frame_count <= 0 or frame_index < reported_frame_count),
        "frames_with_people": sum(bool(frame["detections"]) for frame in frames),
        "person_boxes": sum(len(frame["detections"]) for frame in frames),
        "frames": frames,
    }

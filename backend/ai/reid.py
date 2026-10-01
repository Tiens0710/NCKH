"""OSNet embeddings for person crops and query images.

Weights are trained for person Re-ID (MSMT17), not ImageNet classification.
The model is only loaded in the Kaggle worker, never in the web process.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

MODEL_NAME = "osnet_ain_x1_0"
WEIGHTS_FILE = "osnet_ain_x1_0_msmt17_256x128_amsgrad_ep50_lr0.0015_coslr_b64_fb10_softmax_labsmth_flip_jitter.pth"
MODEL_VERSION = "osnet_ain_x1_0_msmt17_ep50"


def load_extractor(device: str = "auto") -> Any:
    import torch
    from huggingface_hub import hf_hub_download
    from torchreid.utils import FeatureExtractor

    resolved_device = "cuda" if device == "auto" and torch.cuda.is_available() else device
    if resolved_device == "auto":
        resolved_device = "cpu"
    weights_path = hf_hub_download(repo_id="kaiyangzhou/osnet", filename=WEIGHTS_FILE)
    return FeatureExtractor(model_name=MODEL_NAME, model_path=weights_path, device=resolved_device)


def embed_images(extractor: Any, paths: list[Path]) -> list[list[float]]:
    """L2-normalize 512-D features; reject malformed outputs instead of storing them."""
    if not paths:
        return []
    features = extractor([str(path) for path in paths])
    rows = features.detach().cpu().tolist()
    normalized: list[list[float]] = []
    for row in rows:
        if len(row) != 512 or not all(math.isfinite(float(value)) for value in row):
            raise ValueError("OSNet returned an invalid feature vector")
        norm = math.sqrt(sum(float(value) ** 2 for value in row))
        if norm <= 0:
            raise ValueError("OSNet returned an empty feature vector")
        normalized.append([round(float(value) / norm, 7) for value in row])
    return normalized


def crop_track_representatives(video_path: Path, tracks: list[dict[str, Any]], output_dir: Path) -> list[tuple[dict[str, Any], Path]]:
    """Seek to each track's clearest detection and save a padded person crop."""
    import cv2

    output_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot reopen video for Re-ID crops")
    saved: list[tuple[dict[str, Any], Path]] = []
    try:
        for track in tracks:
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(track["best_frame"]))
            ok, image = capture.read()
            if not ok:
                continue
            height, width = image.shape[:2]
            x1, y1, x2, y2 = [float(value) for value in track["best_box"]]
            pad_x, pad_y = (x2 - x1) * 0.04, (y2 - y1) * 0.04
            left, top = max(0, int(x1 - pad_x)), max(0, int(y1 - pad_y))
            right, bottom = min(width, int(x2 + pad_x)), min(height, int(y2 + pad_y))
            if right - left < 16 or bottom - top < 32:
                continue
            path = output_dir / f"track-{track['local_track_id']}.jpg"
            if cv2.imwrite(str(path), image[top:bottom, left:right]):
                saved.append((track, path))
    finally:
        capture.release()
    return saved

import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

from backend.ai.retinanet import DetectionOptions, detect_video


class FakeCapture:
    def __init__(self, frame_count: int, fps: float = 10.0, report_frame_count: bool = True) -> None:
        self.frames = [np.zeros((100, 200, 3), dtype=np.uint8) for _ in range(frame_count)]
        self.fps = fps
        self.report_frame_count = report_frame_count
        self.position = 0
        self.released = False

    def isOpened(self) -> bool:
        return True

    def get(self, property_id: int) -> float:
        import cv2

        if property_id == cv2.CAP_PROP_FPS:
            return self.fps
        if property_id == cv2.CAP_PROP_FRAME_WIDTH:
            return 200
        if property_id == cv2.CAP_PROP_FRAME_HEIGHT:
            return 100
        if property_id == cv2.CAP_PROP_FRAME_COUNT:
            return len(self.frames) if self.report_frame_count else 0
        return 0.0

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self.position >= len(self.frames):
            return False, None
        frame = self.frames[self.position]
        self.position += 1
        return True, frame

    def release(self) -> None:
        self.released = True


class FakeDetector:
    def __init__(self) -> None:
        self.parameter = torch.nn.Parameter(torch.zeros(()))
        self.batch_sizes: list[int] = []

    def parameters(self):
        return iter((self.parameter,))

    def __call__(self, images: list[torch.Tensor]) -> list[dict[str, torch.Tensor]]:
        self.batch_sizes.append(len(images))
        return [
            {
                "labels": torch.tensor([1]),
                "scores": torch.tensor([0.9]),
                "boxes": torch.tensor([[10.0, 20.0, 30.0, 40.0]]),
            }
            for _ in images
        ]


class RetinaNetBatchingTests(unittest.TestCase):
    def run_with_fake_video(
        self, options: DetectionOptions, frame_count: int = 21, report_frame_count: bool = True
    ) -> tuple[dict, FakeDetector, FakeCapture]:
        capture = FakeCapture(frame_count=frame_count, report_frame_count=report_frame_count)
        detector = FakeDetector()
        detector_bundle = (
            detector,
            lambda _image: torch.zeros((3, 100, 200), dtype=torch.float32),
            1,
            torch,
        )
        with patch("cv2.VideoCapture", return_value=capture):
            result = detect_video(Path("sample.mp4"), options, detector_bundle)
        return result, detector, capture

    def test_batches_sampled_frames_and_preserves_frame_coordinates(self) -> None:
        options = DetectionOptions(sample_seconds=0.5, inference_batch_size=2)
        result, detector, capture = self.run_with_fake_video(options)

        self.assertEqual(detector.batch_sizes, [2, 2, 1])
        self.assertEqual([frame["frame_index"] for frame in result["frames"]], [0, 5, 10, 15, 20])
        self.assertEqual(result["frames_sampled"], 5)
        self.assertEqual(result["person_boxes"], 5)
        self.assertEqual(result["frames"][0]["detections"][0]["xyxy"], [10.0, 20.0, 30.0, 40.0])
        self.assertEqual(result["inference_batch_size"], 2)
        self.assertFalse(result["truncated"])
        self.assertEqual(result["video_duration_seconds"], 2.1)
        self.assertFalse(result["amp_enabled"])
        self.assertGreater(result["processing_seconds"], 0)
        self.assertTrue(capture.released)

    def test_auto_batch_and_amp_fall_back_safely_on_cpu(self) -> None:
        options = DetectionOptions(sample_seconds=0.5, use_amp=True)
        result, detector, _capture = self.run_with_fake_video(options)

        self.assertEqual(detector.batch_sizes, [1, 1, 1, 1, 1])
        self.assertEqual(result["inference_batch_size"], 1)
        self.assertFalse(result["amp_enabled"])

    def test_rejects_negative_batch_size(self) -> None:
        with self.assertRaises(ValueError):
            DetectionOptions(inference_batch_size=-1)

    def test_reports_when_frame_limit_skips_rest_of_video(self) -> None:
        result, _detector, _capture = self.run_with_fake_video(
            DetectionOptions(sample_seconds=0.5, max_frames=2)
        )
        self.assertTrue(result["truncated"])
        self.assertEqual(result["frames_sampled"], 2)
        self.assertEqual(result["last_sample_time_seconds"], 0.5)

    def test_zero_frame_limit_processes_full_video(self) -> None:
        result, _detector, _capture = self.run_with_fake_video(
            DetectionOptions(sample_seconds=0.5, max_frames=0)
        )
        self.assertFalse(result["truncated"])
        self.assertEqual(result["frames_sampled"], 5)

    def test_unknown_frame_count_uses_probe_at_limit(self) -> None:
        options = DetectionOptions(sample_seconds=0.5, max_frames=2)
        truncated, _, _ = self.run_with_fake_video(options, report_frame_count=False)
        complete, _, _ = self.run_with_fake_video(options, frame_count=6, report_frame_count=False)
        self.assertTrue(truncated["truncated"])
        self.assertFalse(complete["truncated"])
        self.assertIsNone(complete["video_duration_seconds"])


if __name__ == "__main__":
    unittest.main()

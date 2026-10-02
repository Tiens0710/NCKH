"""Run a short, local RetinaNet clothing-colour demo; no database required."""

import argparse
import json
from pathlib import Path

import cv2

from .retinanet import DetectionOptions, detect_video, load_detector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, default=Path("test_data/clothing-color-demo"))
    args = parser.parse_args()
    result = detect_video(args.video, DetectionOptions(sample_seconds=1, max_frames=8), load_detector("auto"))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "detections.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    capture = cv2.VideoCapture(str(args.video))
    try:
        for sample in result["frames"]:
            if not sample["detections"]:
                continue
            capture.set(cv2.CAP_PROP_POS_FRAMES, sample["frame_index"])
            ok, frame = capture.read()
            if not ok:
                continue
            for detection in sample["detections"]:
                x1, y1, x2, y2 = map(int, detection["xyxy"])
                colors = detection["clothing_colors"]
                label = f"top: {colors['upper']['name']} | bottom: {colors['lower']['name']} (estimated)"
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 0), 2)
                cv2.putText(frame, label, (max(0, min(x1, frame.shape[1] - 410)), max(18, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 0), 1)
            cv2.imwrite(str(args.output / f"frame-{sample['frame_index']}.jpg"), frame)
    finally:
        capture.release()
    print(json.dumps({"frames": result["frames_sampled"], "person_boxes": result["person_boxes"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Conservative bounding-box association across sampled frames.

This is sparse-frame tracking, not continuous multi-object tracking. Tracks
expire after a short gap so an unrelated person cannot inherit an old ID.
"""

from __future__ import annotations

from typing import Any


def iou(a: list[float], b: list[float]) -> float:
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - intersection
    return intersection / union if union else 0.0


def assign_tracks(
    frames: list[dict[str, Any]], *, min_iou: float = 0.25, max_gap_seconds: float = 1.5
) -> list[dict[str, Any]]:
    """Annotate detections in place and return track summaries.

    Greedy IoU matching is intentionally restricted to nearby sampled frames.
    It cannot establish identity after occlusion or a camera transition.
    """
    active: dict[int, dict[str, Any]] = {}
    tracks: dict[int, dict[str, Any]] = {}
    next_id = 1
    for frame in frames:
        now = float(frame["time_seconds"])
        active = {
            track_id: state for track_id, state in active.items()
            if now - state["last_time"] <= max_gap_seconds
        }
        candidates = []
        for index, detection in enumerate(frame.get("detections", [])):
            box = detection.get("xyxy")
            if not isinstance(box, list) or len(box) != 4:
                continue
            for track_id, state in active.items():
                overlap = iou(box, state["box"])
                if overlap >= min_iou:
                    candidates.append((overlap, track_id, index))
        assigned_tracks: set[int] = set()
        assigned_detections: set[int] = set()
        for _, track_id, index in sorted(candidates, reverse=True):
            if track_id in assigned_tracks or index in assigned_detections:
                continue
            assigned_tracks.add(track_id)
            assigned_detections.add(index)
            detection = frame["detections"][index]
            detection["track_id"] = track_id
            active[track_id] = {"box": detection["xyxy"], "last_time": now}
            track = tracks[track_id]
            track["ended_seconds"] = now
            track["sample_count"] += 1
            if detection["score"] > track["best_score"]:
                track.update(best_score=detection["score"], best_frame=frame["frame_index"], best_box=detection["xyxy"])
        for index, detection in enumerate(frame.get("detections", [])):
            if index in assigned_detections or not isinstance(detection.get("xyxy"), list):
                continue
            track_id = next_id
            next_id += 1
            detection["track_id"] = track_id
            active[track_id] = {"box": detection["xyxy"], "last_time": now}
            tracks[track_id] = {
                "local_track_id": track_id,
                "started_seconds": now,
                "ended_seconds": now,
                "sample_count": 1,
                "best_score": detection["score"],
                "best_frame": frame["frame_index"],
                "best_box": detection["xyxy"],
            }
    return list(tracks.values())

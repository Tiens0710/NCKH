"""Process pending Supabase video rows with RetinaNet.

Run locally with: python -m backend.ai.worker --once
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from supabase import Client, create_client

from backend.app.config import get_settings

from .retinanet import DetectionOptions, detect_video, load_detector


LOGGER = logging.getLogger(__name__)
RAW_BUCKET = "raw-videos"
DETECTIONS_BUCKET = "raw-detections"
STOP = False


def request_stop(_signal: int, _frame: Any) -> None:
    global STOP
    STOP = True


def make_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_admin_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured")
    return create_client(settings.supabase_url, settings.supabase_admin_key)


def claim_video(client: Client, video_id: str | None = None, retry_failed: bool = False) -> dict[str, Any] | None:
    query = client.table("videos").select("*")
    if video_id:
        query = query.eq("id", str(UUID(video_id)))
    else:
        query = query.eq("status", "pending").order("created_at").limit(1)
    rows = query.execute().data
    if not rows:
        return None
    video = rows[0]
    current_status = video["status"]
    if current_status != "pending" and not (retry_failed and video_id and current_status == "failed"):
        return None
    metadata = dict(video.get("metadata") or {})
    metadata["detection"] = {
        "stage": "retinanet_person_detection",
        "status": "processing",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    claimed = (
        client.table("videos")
        .update({"status": "processing", "metadata": metadata})
        .eq("id", video["id"])
        .eq("status", current_status)
        .execute()
        .data
    )
    return claimed[0] if claimed else None


def process_video(client: Client, video: dict[str, Any], detector: tuple[Any, Any, int, Any], options: DetectionOptions) -> None:
    video_id = str(UUID(video["id"]))
    metadata = dict(video.get("metadata") or {})
    suffix = Path(str(video["storage_path"])).suffix.lower()
    if suffix not in {".avi", ".mp4", ".mov", ".mkv", ".webm"}:
        suffix = ".mp4"
    try:
        video_bytes = client.storage.from_(RAW_BUCKET).download(video["storage_path"])
        with tempfile.TemporaryDirectory(prefix="nckh-detection-") as temp_dir:
            video_path = Path(temp_dir) / f"input{suffix}"
            video_path.write_bytes(video_bytes)
            result = detect_video(video_path, options, detector)
        result["video_id"] = video_id
        storage_path = f"{video_id}/retinanet-{uuid4().hex}.json"
        payload = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        client.storage.from_(DETECTIONS_BUCKET).upload(
            path=storage_path,
            file=payload,
            file_options={"content-type": "application/json", "upsert": "false"},
        )
        metadata["detection"] = {
            "stage": "retinanet_person_detection",
            "status": "completed",
            "model": result["model"],
            "score_threshold": result["score_threshold"],
            "frames_sampled": result["frames_sampled"],
            "frames_with_people": result["frames_with_people"],
            "person_boxes": result["person_boxes"],
            "storage_path": storage_path,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        client.table("videos").update({
            "status": "completed",
            "fps": result["fps"],
            "width": result["width"],
            "height": result["height"],
            "metadata": metadata,
        }).eq("id", video_id).eq("status", "processing").execute()
        LOGGER.info("Processed video %s: %d person boxes", video_id, result["person_boxes"])
    except Exception:
        LOGGER.exception("Detection failed for video %s", video_id)
        metadata["detection"] = {
            "stage": "retinanet_person_detection",
            "status": "failed",
            "message": "Processing failed; inspect worker logs and retry this video.",
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        client.table("videos").update({"status": "failed", "metadata": metadata}).eq("id", video_id).eq("status", "processing").execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect people in uploaded videos with RetinaNet")
    parser.add_argument("--once", action="store_true", help="Process one pending video and exit")
    parser.add_argument("--drain", action="store_true", help="Process pending videos and exit when the queue is empty")
    parser.add_argument("--max-jobs", type=int, default=20, help="Maximum videos to process in --drain mode")
    parser.add_argument("--video-id", help="Process a specific pending video UUID")
    parser.add_argument("--retry-failed", action="store_true", help="Retry a failed --video-id")
    parser.add_argument("--poll-seconds", type=float, default=15.0)
    parser.add_argument("--score-threshold", type=float, default=0.6)
    parser.add_argument("--sample-seconds", type=float, default=1.0)
    parser.add_argument("--max-frames", type=int, default=120)
    parser.add_argument("--max-image-side", type=int, default=960)
    args = parser.parse_args()
    if args.poll_seconds <= 0 or args.max_jobs < 1 or (args.retry_failed and not args.video_id):
        parser.error("--poll-seconds and --max-jobs must be positive; --retry-failed requires --video-id")
    if args.once and args.drain:
        parser.error("Choose either --once or --drain")
    options = DetectionOptions(args.score_threshold, args.sample_seconds, args.max_frames, args.max_image_side)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)
    client = make_client()
    detector = None
    processed = 0
    while not STOP:
        video = claim_video(client, args.video_id, args.retry_failed)
        if video:
            if detector is None:
                try:
                    detector = load_detector()
                except Exception:
                    LOGGER.exception("Unable to load RetinaNet; leaving video available for retry")
                    metadata = dict(video.get("metadata") or {})
                    metadata["detection"] = {"stage": "retinanet_person_detection", "status": "pending"}
                    client.table("videos").update({"status": "pending", "metadata": metadata}).eq("id", video["id"]).eq("status", "processing").execute()
                    raise
            process_video(client, video, detector, options)
            processed += 1
        if args.once or args.video_id or (args.drain and (not video or processed >= args.max_jobs)):
            if not video:
                LOGGER.info("No eligible video found")
            return
        if not video:
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()

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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, NAMESPACE_URL, uuid4, uuid5

from supabase import Client, create_client

from backend.app.config import get_settings

from .retinanet import DetectionOptions, detect_video, load_detector
from .tracking import assign_tracks
from .reid import MODEL_NAME as REID_MODEL, MODEL_VERSION as REID_VERSION, crop_track_representatives, embed_images, load_extractor


LOGGER = logging.getLogger(__name__)
RAW_BUCKET = "raw-videos"
DETECTIONS_BUCKET = "raw-detections"
CROPS_BUCKET = "person-crops"
QUERIES_BUCKET = "query-images"
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


def enrich_tracks(client: Client, video: dict[str, Any], result: dict[str, Any], video_path: Path, temp_dir: Path, extractor: Any) -> int:
    """Persist per-video tracks and their Re-ID embeddings in existing tables."""
    tracks = assign_tracks(result["frames"])
    result["tracking"] = {"method": "sampled_frame_iou", "track_count": len(tracks)}
    representatives = crop_track_representatives(video_path, tracks, temp_dir / "crops")
    vectors = embed_images(extractor, [path for _, path in representatives])
    started_at = datetime.fromisoformat(video["started_at"].replace("Z", "+00:00"))
    for (track, crop_path), vector in zip(representatives, vectors):
        track_id = str(uuid5(NAMESPACE_URL, f"{video['id']}:{track['local_track_id']}"))
        crop_storage_path = f"{video['id']}/{track_id}.jpg"
        client.storage.from_(CROPS_BUCKET).upload(
            path=crop_storage_path, file=crop_path.read_bytes(),
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        client.table("tracklets").upsert({
            "id": track_id,
            "video_id": video["id"],
            "local_track_id": track["local_track_id"],
            "started_at": (started_at + timedelta(seconds=track["started_seconds"])).isoformat(),
            "ended_at": (started_at + timedelta(seconds=track["ended_seconds"])).isoformat(),
            "representative_image_path": crop_storage_path,
            "detection_confidence": track["best_score"],
            "attributes": {"sample_count": track["sample_count"], "tracking_method": "sampled_frame_iou"},
        }, on_conflict="video_id,local_track_id").execute()
        client.table("tracklet_embeddings").upsert({
            "tracklet_id": track_id,
            "model_name": REID_MODEL,
            "model_version": REID_VERSION,
            "embedding": vector,
        }, on_conflict="tracklet_id,model_version").execute()
    return len(representatives)


def process_video(client: Client, video: dict[str, Any], detector: tuple[Any, Any, int, Any], options: DetectionOptions, extractor: Any = None) -> None:
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
            track_count = 0
            if extractor is not None:
                track_count = enrich_tracks(client, video, result, video_path, Path(temp_dir), extractor)
            else:
                result["tracking"] = {"status": "unavailable", "track_count": 0}
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
            "weights": result["weights"],
            "code_revision": result["code_revision"],
            "torch_version": result["torch_version"],
            "device": result["device"],
            "score_threshold": result["score_threshold"],
            "sample_seconds": result["sample_seconds"],
            "max_frames": result["max_frames"],
            "max_image_side": result["max_image_side"],
            "frames_sampled": result["frames_sampled"],
            "last_sample_time_seconds": result["last_sample_time_seconds"],
            "video_duration_seconds": result["video_duration_seconds"],
            "truncated": result["truncated"],
            "frames_with_people": result["frames_with_people"],
            "person_boxes": result["person_boxes"],
            "inference_batch_size": result["inference_batch_size"],
            "amp_enabled": result["amp_enabled"],
            "processing_seconds": result["processing_seconds"],
            "sampled_frames_per_second": result["sampled_frames_per_second"],
            "storage_path": storage_path,
            "tracks_with_embeddings": track_count,
            "reid_model_version": REID_VERSION if extractor is not None else None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        client.table("videos").update({
            "status": "completed",
            "fps": result["fps"],
            "width": result["width"],
            "height": result["height"],
            "metadata": metadata,
        }).eq("id", video_id).eq("status", "processing").execute()
        LOGGER.info(
            "Processed video %s: %d person boxes; %.2fs, %.2f sampled frames/s, batch=%d, AMP=%s",
            video_id,
            result["person_boxes"],
            result["processing_seconds"],
            result["sampled_frames_per_second"],
            result["inference_batch_size"],
            result["amp_enabled"],
        )
    except Exception:
        LOGGER.exception("Detection failed for video %s", video_id)
        metadata["detection"] = {
            "stage": "retinanet_person_detection",
            "status": "failed",
            "message": "Processing failed; inspect worker logs and retry this video.",
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        client.table("videos").update({"status": "failed", "metadata": metadata}).eq("id", video_id).eq("status", "processing").execute()


def process_search(client: Client, extractor: Any) -> bool:
    """Process one pending image query with the same OSNet model as tracklets."""
    rows = client.table("search_queries").select("*").eq("status", "pending").order("created_at").limit(1).execute().data
    if not rows:
        return False
    query = rows[0]
    claimed = client.table("search_queries").update({"status": "processing"}).eq("id", query["id"]).eq("status", "pending").execute().data
    if not claimed:
        return False
    try:
        image_bytes = client.storage.from_(QUERIES_BUCKET).download(query["query_image_path"])
        with tempfile.TemporaryDirectory(prefix="nckh-query-") as temp_dir:
            image_path = Path(temp_dir) / "person.jpg"
            image_path.write_bytes(image_bytes)
            vector = embed_images(extractor, [image_path])[0]
        matches = client.rpc("match_tracklets", {
            "p_query_embedding": vector,
            "p_threshold": query.get("similarity_threshold") if query.get("similarity_threshold") is not None else 0.65,
            "p_limit": 50,
            "p_camera_id": None,
            "p_start_time": query.get("start_time"),
            "p_end_time": query.get("end_time"),
            "p_model_version": REID_VERSION,
        }).execute().data or []
        for rank, match in enumerate(matches, start=1):
            client.table("search_results").upsert({
                "query_id": query["id"],
                "tracklet_id": match["tracklet_id"],
                "similarity_score": match["similarity"],
                "rank": rank,
            }, on_conflict="query_id,tracklet_id").execute()
        client.table("search_queries").update({"query_embedding": vector, "status": "completed"}).eq("id", query["id"]).execute()
        LOGGER.info("Matched search %s: %d candidates", query["id"], len(matches))
    except Exception:
        LOGGER.exception("Re-ID query failed: %s", query["id"])
        client.table("search_queries").update({"status": "failed"}).eq("id", query["id"]).eq("status", "processing").execute()
    return True


def backfill_latest_detection(client: Client, extractor: Any) -> None:
    """Enrich one existing RetinaNet result without running detection again."""
    videos = client.table("videos").select("*").eq("status", "completed").order("created_at", desc=True).limit(10).execute().data
    for video in videos:
        detection = (video.get("metadata") or {}).get("detection") or {}
        old_path = detection.get("storage_path")
        if not old_path or detection.get("reid_model_version") == REID_VERSION:
            continue
        LOGGER.info("Backfilling OSNet for completed video %s", video["id"])
        try:
            result = json.loads(client.storage.from_(DETECTIONS_BUCKET).download(old_path).decode("utf-8"))
            with tempfile.TemporaryDirectory(prefix="nckh-backfill-") as temp_dir:
                suffix = Path(str(video["storage_path"])).suffix or ".mp4"
                video_path = Path(temp_dir) / f"input{suffix}"
                video_path.write_bytes(client.storage.from_(RAW_BUCKET).download(video["storage_path"]))
                track_count = enrich_tracks(client, video, result, video_path, Path(temp_dir), extractor)
            new_path = f"{video['id']}/retinanet-reid-{uuid4().hex}.json"
            client.storage.from_(DETECTIONS_BUCKET).upload(
                path=new_path,
                file=json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                file_options={"content-type": "application/json", "upsert": "false"},
            )
            metadata = dict(video.get("metadata") or {})
            metadata["detection"] = {**detection, "storage_path": new_path, "tracks_with_embeddings": track_count, "reid_model_version": REID_VERSION}
            client.table("videos").update({"metadata": metadata}).eq("id", video["id"]).eq("status", "completed").execute()
            LOGGER.info("Backfill complete for %s: %d track embeddings", video["id"], track_count)
        except Exception:
            LOGGER.exception("Backfill failed for video %s", video["id"])
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect people in uploaded videos with RetinaNet")
    parser.add_argument("--once", action="store_true", help="Process one pending video and exit")
    parser.add_argument("--drain", action="store_true", help="Process pending videos and exit when the queue is empty")
    parser.add_argument("--max-jobs", type=int, default=20, help="Maximum videos to process in --drain mode")
    parser.add_argument("--video-id", help="Process a specific pending video UUID")
    parser.add_argument("--retry-failed", action="store_true", help="Retry a failed --video-id")
    parser.add_argument("--poll-seconds", type=float, default=15.0)
    parser.add_argument("--score-threshold", type=float, default=0.4)
    parser.add_argument("--sample-seconds", type=float, default=0.5)
    parser.add_argument("--max-frames", type=int, default=120, help="Maximum sampled frames; 0 processes the full video")
    parser.add_argument("--max-image-side", type=int, default=1280)
    parser.add_argument(
        "--inference-batch-size",
        type=int,
        default=0,
        help="Images per inference batch; 0 selects 2 on CUDA and 1 on CPU",
    )
    parser.add_argument("--amp", action="store_true", help="Enable CUDA mixed-precision inference")
    parser.add_argument("--device", choices=("cpu", "cuda", "auto"), default="cpu")
    parser.add_argument("--detector", choices=("retinanet", "rfdetr-medium"), default="retinanet")
    parser.add_argument("--enable-reid", action="store_true", help="Run OSNet tracking and Re-ID enrichment")
    parser.add_argument("--backfill-latest", action="store_true", help="Enrich one completed RetinaNet video missing Re-ID")
    args = parser.parse_args()
    if args.poll_seconds <= 0 or args.max_jobs < 1 or (args.retry_failed and not args.video_id):
        parser.error("--poll-seconds and --max-jobs must be positive; --retry-failed requires --video-id")
    if args.once and args.drain:
        parser.error("Choose either --once or --drain")
    options = DetectionOptions(
        args.score_threshold,
        args.sample_seconds,
        args.max_frames,
        args.max_image_side,
        args.inference_batch_size,
        args.amp,
    )
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)
    client = make_client()
    detector = None
    extractor = None
    if args.enable_reid:
        extractor = load_extractor(args.device)
        if args.backfill_latest:
            backfill_latest_detection(client, extractor)
    processed = 0
    while not STOP:
        video = claim_video(client, args.video_id, args.retry_failed)
        if video:
            if detector is None:
                try:
                    if args.detector == "rfdetr-medium":
                        from .rfdetr_detector import load_detector as load_rfdetr
                        detector = load_rfdetr(args.device)
                    else:
                        detector = load_detector(args.device)
                except Exception:
                    LOGGER.exception("Unable to load %s; leaving video available for retry", args.detector)
                    metadata = dict(video.get("metadata") or {})
                    metadata["detection"] = {"stage": "retinanet_person_detection", "status": "pending"}
                    client.table("videos").update({"status": "pending", "metadata": metadata}).eq("id", video["id"]).eq("status", "processing").execute()
                    raise
            process_video(client, video, detector, options, extractor)
            processed += 1
        if extractor is not None:
            process_search(client, extractor)
        if args.once or args.video_id or (args.drain and (not video or processed >= args.max_jobs)):
            if not video:
                LOGGER.info("No eligible video found")
            return
        if not video:
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()

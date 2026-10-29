"""One-shot local camera recorder -> existing private GPU queue.

RTSP credentials stay on the camera LAN. No public endpoint accepts RTSP URLs.
This is bounded clip ingestion, not a continuous live surveillance service.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx

from backend.multicam.storage import write_json

LIMIT = 48 * 1024 * 1024


def load_config(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    cameras = data.get("cameras")
    endpoint = urlsplit(data.get("web_url", ""))
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError("web_url must be an HTTPS application origin")
    if endpoint.path not in ("", "/"):
        raise ValueError("web_url must not contain a path")
    if not isinstance(cameras, list) or not 2 <= len(cameras) <= 3:
        raise ValueError("Configure 2-3 cameras per capture")
    if data.get("consent") is not True:
        raise ValueError("Set consent=true only for recordings you are authorized to process")
    seconds = data.get("seconds", 15)
    if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 30:
        raise ValueError("seconds must be an integer from 1 to 30")
    for camera in cameras:
        if not isinstance(camera, dict) or not isinstance(camera.get("name"), str) or not camera["name"].strip() or len(camera["name"]) > 120:
            raise ValueError("Each camera needs a name (1-120 characters)")
        if bool(camera.get("rtsp_url_env")) == bool(camera.get("video_path")):
            raise ValueError("Choose exactly one of rtsp_url_env or video_path per camera")
        if camera.get("rtsp_url_env"):
            name = camera["rtsp_url_env"]
            if not isinstance(name, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", name):
                raise ValueError("Invalid environment variable name")
            parsed = urlsplit(os.environ.get(name, ""))
            if parsed.scheme not in {"rtsp", "rtsps"} or not parsed.hostname:
                raise ValueError("A camera environment variable is missing or is not an RTSP URL")
        else:
            source = (path.parent / camera["video_path"]).resolve()
            if not source.is_file() or source.suffix.lower() not in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
                raise ValueError("A configured video file is missing or unsupported")
            camera["video_path"] = str(source)
        offset = camera.get("timeline_start_seconds")
        if offset is not None and (isinstance(offset, bool) or not isinstance(offset, (int, float)) or not math.isfinite(offset) or not 0 <= offset <= 86400):
            raise ValueError("Capture offsets must be finite seconds from 0 to 86400")
        location = camera.get("location")
        if location is not None:
            if not isinstance(location, dict):
                raise ValueError("Invalid camera location")
            for key, bound in (("lat", 90), ("lng", 180)):
                value = location.get(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > bound:
                    raise ValueError("Invalid camera coordinates")
    return data


def record_rtsp(target: Path, seconds: int) -> None:
    """Run only in an isolated child: parent enforces a hard wall-clock deadline."""
    import av
    import cv2
    from backend.multicam.video_io import H264Writer

    url = os.environ.pop("OUTLIER_CAPTURE_URL")
    writer = None
    started = time.monotonic()
    count, next_sample, origin = 0, 0.0, None
    try:
        with av.open(url, options={"rtsp_transport": "tcp", "timeout": "10000000"}, timeout=(10, 10)) as source:
            rate = float(source.streams.video[0].average_rate or 10)
            output_fps = min(10, rate) if math.isfinite(rate) and rate > 0 else 10
            for frame in source.decode(video=0):
                if time.monotonic() - started > seconds + 15:
                    break
                stamp = float(frame.time) if frame.time is not None else time.monotonic() - started
                if origin is None:
                    origin = stamp
                elapsed = stamp - origin
                if elapsed >= seconds or count >= math.ceil(seconds * output_fps):
                    break
                if elapsed < next_sample:
                    continue
                image = frame.to_ndarray(format="bgr24")
                height, width = image.shape[:2]
                if min(width, height) < 16 or max(width, height) > 8192:
                    raise ValueError("Unsupported camera resolution")
                scale = min(1, 1280 / max(width, height))
                size = tuple(max(2, int(value * scale) // 2 * 2) for value in (width, height))
                if writer is None:
                    writer = H264Writer(target, output_fps, *size)
                writer.write(cv2.resize(image, size))
                count += 1
                next_sample = count / output_fps
                if target.exists() and target.stat().st_size > LIMIT:
                    raise ValueError("Camera clip too large")
        if count < 3:
            raise ValueError("Camera provided fewer than 3 frames")
    finally:
        if writer is not None:
            writer.close()


def prepare_camera(camera: dict, index: int, output: Path, seconds: int) -> dict:
    target = output / f"CAM-{index + 1}.mp4"
    if camera.get("rtsp_url_env"):
        env = {**os.environ, "OUTLIER_CAPTURE_URL": os.environ[camera["rtsp_url_env"]]}
        try:
            subprocess.run([sys.executable, "-m", "backend.camera_gateway", "--record-target", str(target), "--seconds", str(seconds)],
                           env=env, timeout=seconds + 30, check=True, stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        except (subprocess.SubprocessError, OSError):
            raise RuntimeError(f"Camera {index + 1}: capture failed or timed out; check the LAN connection") from None
    else:
        target = Path(camera["video_path"])
    size = target.stat().st_size
    if not 0 < size <= LIMIT:
        raise ValueError(f"Camera {index + 1}: clip must be 1 byte to 48 MB")
    metadata = {"name": target.name, "size": size, "type": "video/mp4", "camera_name": camera["name"],
                "source_kind": "rtsp_capture" if camera.get("rtsp_url_env") else "upload"}
    for field in ("timeline_start_seconds", "location"):
        if camera.get(field) is not None:
            metadata[field] = camera[field]
    return {"path": str(target), "metadata": metadata}


def send_job(client: httpx.Client, web_url: str, recordings: list[dict], output: Path) -> dict:
    """Persist the capability before upload; transport failure must not lose access."""
    response = client.post(web_url.rstrip("/") + "/api/demo/jobs", json={"consent": True, "files": [item["metadata"] for item in recordings]})
    if not response.is_success:
        raise RuntimeError(f"Queue refused capture (HTTP {response.status_code}); check GPU availability and daily quota")
    job = response.json()
    identifier = str(UUID(job["id"]))
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", job.get("token", "")) or len(job.get("uploads", [])) != len(recordings):
        raise RuntimeError("Invalid queue response")
    receipt = {"kind": "outlier-camera-job", "id": identifier, "token": job["token"]}
    write_json(output / "access.json", receipt)
    if os.name != "nt":
        (output / "access.json").chmod(0o600)
    write_json(output / "state.json", {"stage": "uploading", "job_id": identifier})
    for recording, upload in zip(recordings, job["uploads"]):
        parsed = urlsplit(upload["url"])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise RuntimeError("Invalid signed upload URL")
        with Path(recording["path"]).open("rb") as stream:
            uploaded = client.put(upload["url"], content=stream, headers={"Content-Type": "application/octet-stream"})
        if not uploaded.is_success:
            raise RuntimeError("Upload failed; access.json and local clips were preserved")
    submitted = client.post(web_url.rstrip("/") + f"/api/demo/jobs/{identifier}", headers={"Authorization": f"Bearer {job['token']}"})
    if not submitted.is_success:
        raise RuntimeError("Submission failed; open access.json on the web to retry finalization")
    write_json(output / "state.json", {"stage": "queued", "job_id": identifier})
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path, default=Path(".cache/camera-gateway"))
    parser.add_argument("--check", action="store_true", help="Validate configuration without connecting or uploading")
    parser.add_argument("--record-target", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--seconds", type=int, default=15, help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        if args.record_target:
            record_rtsp(args.record_target, args.seconds)
            return
        if not args.config:
            parser.error("--config is required")
        config = load_config(args.config.resolve())
        if args.check:
            print(f"Configuration valid: {len(config['cameras'])} cameras; no network action performed")
            return
        # Check GPU before opening camera connections or creating an upload job.
        with httpx.Client(timeout=180, follow_redirects=False) as client:
            response = client.get(config["web_url"].rstrip("/") + "/api/demo/jobs")
            if not response.is_success or response.json().get("worker_online") is not True:
                raise RuntimeError("GPU worker is offline; capture was not started")
            output = args.output.resolve() / str(uuid4())
            output.mkdir(parents=True, mode=0o700)
            print(f"Capturing {len(config['cameras'])} cameras; local artifacts: {output}", flush=True)
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = [pool.submit(prepare_camera, camera, index, output, config.get("seconds", 15)) for index, camera in enumerate(config["cameras"])]
                recordings = [future.result() for future in futures]
            send_job(client, config["web_url"], recordings, output)
            print(f"Queued. Open {output / 'access.json'} in the web Camera RTSP tab. Keep this file private.", flush=True)
    except (KeyboardInterrupt, Exception) as error:
        # Never echo raw av/httpx errors: they may contain RTSP passwords or signed URLs.
        if isinstance(error, (ValueError, RuntimeError)):
            print(f"Stopped: {error}", file=sys.stderr)
        else:
            print(f"Stopped ({type(error).__name__}); local recordings and access receipts were preserved.", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()

"""Continuous RF-DETR detection. Latest-frame buffers, no clip queue or browser trigger."""
from __future__ import annotations

import argparse
import base64
from contextlib import asynccontextmanager
from dataclasses import dataclass
import json
import logging
import math
import os
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.parse import urlsplit

import cv2
import numpy as np
from starlette.requests import Request

LOG = logging.getLogger(__name__)


@dataclass
class Frame:
    sequence: int
    image: np.ndarray
    received_at: float
    received_tick: float


class LatestCamera:
    def __init__(self, config):
        self.config = config
        self.lock = threading.Lock()
        self.frame = None
        self.result = None
        self.last_processed = 0
        self.sequence = 0
        self.source_status = "connecting"

    def offer(self, image):
        height, width = image.shape[:2]
        scale = min(1, 960 / max(height, width))
        image = cv2.resize(image, (max(2, round(width * scale)), max(2, round(height * scale))))
        with self.lock:
            self.sequence += 1
            self.frame = Frame(self.sequence, image, time.time(), time.monotonic())
            self.source_status = "receiving"

    def latest(self):
        with self.lock:
            return self.frame


class Detector:
    def __init__(self, config):
        import torch
        from rfdetr import RFDETRMedium
        device = config.get("device", "auto")
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu":
            torch.set_num_threads(min(4, torch.get_num_threads()))
        options = {"device": device, "resolution": 576}
        if config.get("checkpoint"):
            options["pretrain_weights"] = config["checkpoint"]
        model = RFDETRMedium(**options)
        model.inference(compile=False, inplace=True)
        self.model = model
        self.metadata = {"name": "RF-DETR Medium", "device": device}

    def predict(self, image, threshold):
        result = self.model.predict(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), threshold=threshold)
        names = result.data.get("class_name")
        if names is None:
            raise RuntimeError("Missing detector class names")
        return [{"xyxy": box.tolist(), "score": float(score)}
                for box, score, name in zip(result.xyxy, result.confidence, names) if name == "person"]


class Engine:
    def __init__(self, config, detector=None):
        self.config = config
        self.cameras = {camera["id"]: LatestCamera(camera) for camera in config["cameras"]}
        self.detector = detector
        self.model_status = "ready" if detector else "loading_model"
        self.stop = threading.Event()
        self.threads = []

    def capture(self, camera):
        import av
        config = camera.config
        backoff = 1
        while not self.stop.is_set():
            try:
                source = config.get("video_path") or os.environ[config["rtsp_url_env"]]
                options = {"rtsp_transport": "tcp", "timeout": "5000000"} if not config.get("video_path") else {}
                with av.open(source, timeout=(5, 5), options=options) as reader:
                    rate = float(reader.streams.video[0].average_rate or 10)
                    rate = rate if math.isfinite(rate) and rate > 0 else 10
                    next_frame = time.monotonic()
                    for frame in reader.decode(video=0):
                        if self.stop.is_set():
                            return
                        if config.get("video_path"):
                            self.stop.wait(max(0, next_frame - time.monotonic()))
                            next_frame += 1 / rate
                        camera.offer(frame.to_ndarray(format="bgr24"))
                    backoff = 1
                    if config.get("video_path"):
                        continue  # Explicit recorded-source simulation, paced by original FPS.
            except Exception:
                # Decoder errors often contain camera credentials. Never echo them.
                LOG.warning("Camera %s disconnected; retrying", config["id"])
            camera.source_status = "reconnecting"
            self.stop.wait(backoff)
            backoff = min(10, backoff * 2)

    def detect_latest(self, camera):
        frame = camera.latest()
        if frame is None or frame.sequence <= camera.last_processed or time.monotonic() - frame.received_tick > 2:
            return False
        camera.last_processed = frame.sequence
        started = time.monotonic()
        detections = self.detector.predict(frame.image, self.config.get("threshold", .4))
        height, width = frame.image.shape[:2]
        boxes = []
        for item in detections:
            box, score = item["xyxy"], item["score"]
            if len(box) != 4 or not all(math.isfinite(float(x)) for x in [*box, score]) or not 0 <= score <= 1:
                continue
            x1, y1, x2, y2 = [max(0, min(bound, float(x))) for x, bound in zip(box, [width, height, width, height])]
            if x2 > x1 and y2 > y1:
                boxes.append({"xyxy": [x1, y1, x2, y2], "score": score, "label": "person"})
        elapsed = (time.monotonic() - started) * 1000
        ok, jpeg = cv2.imencode(".jpg", frame.image, [cv2.IMWRITE_JPEG_QUALITY, 72])
        if not ok or jpeg.nbytes > 500_000:
            raise RuntimeError("Frame encoding failed")
        now = time.monotonic()
        previous = camera.result
        fps = 1 / (now - previous["published_tick"]) if previous else None
        # Image and detections are one immutable result. No overlay on unsynchronized HLS.
        camera.result = {"sequence": frame.sequence, "received_at": frame.received_at,
                         "received_tick": frame.received_tick, "published_tick": now,
                         "width": width, "height": height, "jpeg": base64.b64encode(jpeg).decode(),
                         "detections": boxes, "inference_ms": round(elapsed, 1),
                         "inference_fps": round(fps, 2) if fps else None}
        return True

    def infer(self):
        try:
            self.detector = self.detector or Detector(self.config)
            self.model_status = "ready"
        except Exception:
            self.model_status = "model_error"
            LOG.error("Model failed to load; check local model setup")
            return
        interval = 1 / self.config.get("target_fps", 2)
        while not self.stop.is_set():
            started = time.monotonic()
            for camera in self.cameras.values():
                if self.stop.is_set():
                    break
                try:
                    self.detect_latest(camera)
                except Exception:
                    camera.source_status = "inference_error"
                    LOG.warning("Inference failed for camera %s", camera.config["id"])
            self.stop.wait(max(.01, interval - (time.monotonic() - started)))

    def start(self):
        for target, args in [(self.capture, (camera,)) for camera in self.cameras.values()] + [(self.infer, ())]:
            thread = threading.Thread(target=target, args=args, daemon=True)
            self.threads.append(thread)
            thread.start()

    def snapshot(self, identifier):
        camera = self.cameras[identifier]
        result = camera.result
        common = {"camera_id": identifier, "model_status": self.model_status,
                  "source_status": camera.source_status, "simulation": bool(camera.config.get("video_path")),
                  "model": getattr(self.detector, "metadata", None)}
        if not result:
            return {**common, "status": "waiting", "frame": None}
        age = max(0, (time.monotonic() - result["received_tick"]) * 1000)
        if age > 3000:
            return {**common, "status": "stale", "frame": None, "age_ms": round(age)}
        return {**common, "status": "ready", "age_ms": round(age),
                "frame": {key: value for key, value in result.items() if not key.endswith("_tick")}}


def create_app(engine, token, origins):
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

    @asynccontextmanager
    async def lifespan(app):
        engine.start()
        yield
        engine.stop.set()
        for thread in engine.threads:
            thread.join(timeout=1)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["Authorization"])

    @app.get("/cameras/{camera_id}/latest")
    async def latest(camera_id: str, request: Request):
        if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
            raise HTTPException(401, "Unauthorized")
        if camera_id not in engine.cameras:
            raise HTTPException(404, "Camera not found")
        from fastapi.responses import JSONResponse
        return JSONResponse(engine.snapshot(camera_id), headers={"Cache-Control": "no-store"})

    return app


def load_config(path):
    config = json.loads(path.read_text(encoding="utf-8"))
    if config.get("consent") is not True or not 1 <= len(config.get("cameras", [])) <= 8:
        raise ValueError("Configure 1-8 cameras and consent=true")
    if not .2 <= float(config.get("target_fps", 2)) <= 10 or not 0 < float(config.get("threshold", .4)) < 1:
        raise ValueError("Invalid inference settings")
    ids = set()
    for camera in config["cameras"]:
        identifier = camera.get("id", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identifier) or identifier in ids:
            raise ValueError("Camera IDs must be unique")
        ids.add(identifier)
        if bool(camera.get("video_path")) == bool(camera.get("rtsp_url_env")):
            raise ValueError("Each camera needs one video_path or rtsp_url_env")
        if camera.get("video_path"):
            source = (path.parent / camera["video_path"]).resolve()
            if not source.is_file():
                raise ValueError("Video file not found")
            camera["video_path"] = str(source)
        else:
            name = camera["rtsp_url_env"]
            url = urlsplit(os.environ.get(name, "")) if isinstance(name, str) else None
            if not isinstance(name, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", name) or url.scheme not in {"rtsp", "rtsps"} or not url.hostname:
                raise ValueError("Missing RTSP environment variable")
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8090, type=int)
    parser.add_argument("--tls-cert")
    parser.add_argument("--tls-key")
    args = parser.parse_args()
    token = os.environ.get("REALTIME_READ_TOKEN", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
        raise SystemExit("Set REALTIME_READ_TOKEN to a private random token (32+ characters)")
    config = load_config(args.config.resolve())
    origins = config.get("origins", ["https://frontend-peach-zeta-37.vercel.app"])
    if not origins or "*" in origins:
        raise SystemExit("Configure explicit web origins")
    import uvicorn
    uvicorn.run(create_app(Engine(config), token, origins), host=args.host, port=args.port,
                ssl_certfile=args.tls_cert, ssl_keyfile=args.tls_key, access_log=False)


if __name__ == "__main__":
    main()

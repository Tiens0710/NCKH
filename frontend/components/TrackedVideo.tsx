"use client";

import { useEffect, useRef, useState } from "react";
import { artifactUrl, type CameraResult } from "@/lib/multicam";

export function TrackedVideo({
  camera,
  runId,
  frameStride,
}: {
  camera: CameraResult;
  runId: string;
  frameStride: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => {
    const video = videoRef.current,
      canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!video || !canvas || !context) return;
    let animation = 0;
    function paint() {
      if (!context || !canvas || !video) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const time = video.currentTime;
      let left = 0,
        right = camera.frames.length - 1,
        selected = -1;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        if (camera.frames[middle].time_seconds <= time) {
          selected = middle;
          left = middle + 1;
        } else right = middle - 1;
      }
      const frame = camera.frames[selected];
      if (
        frame &&
        time - frame.time_seconds <= (frameStride / camera.fps) * 1.5
      ) {
        context.lineWidth = Math.max(2, camera.width / 300);
        context.font = `${Math.max(14, camera.width / 50)}px sans-serif`;
        for (const detection of frame.detections) {
          const [x1, y1, x2, y2] = detection.xyxy;
          const text = `${detection.global_person_id ? `${detection.global_person_id}? · ` : ""}L${detection.local_track_id ?? "…"} · ${Math.round(detection.score * 100)}%`;
          const color = detection.global_person_id ? "#45edbf" : "#ffd576";
          context.strokeStyle = color;
          context.strokeRect(x1, y1, x2 - x1, y2 - y1);
          const labelY = Math.max(0, y1 - 24);
          context.fillStyle = color;
          context.fillRect(
            x1,
            labelY,
            context.measureText(text).width + 10,
            24,
          );
          context.fillStyle = "#09251e";
          context.fillText(text, x1 + 5, labelY + 17);
        }
      }
    }
    function animate() {
      paint();
      if (video && !video.paused && !video.ended)
        animation = requestAnimationFrame(animate);
    }
    function onPlay() {
      cancelAnimationFrame(animation);
      animate();
    }
    function onPause() {
      cancelAnimationFrame(animation);
      paint();
    }
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", paint);
    video.addEventListener("loadeddata", paint);
    video.addEventListener("timeupdate", paint);
    paint();
    return () => {
      cancelAnimationFrame(animation);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", paint);
      video.removeEventListener("loadeddata", paint);
      video.removeEventListener("timeupdate", paint);
    };
  }, [camera, frameStride]);
  return (
    <article className="panel mc-camera">
      <div className="panel-heading">
        <div>
          <h2>{camera.name}</h2>
          <small>
            {camera.camera_id} · bắt đầu tại {camera.timeline_start_seconds}s
          </small>
        </div>
        <span className="mc-pill">{camera.fps} FPS nguồn</span>
        <button
          type="button"
          className="button button-secondary"
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await containerRef.current?.requestFullscreen();
            } catch {
              setPlaybackError(
                "Trình duyệt chưa hỗ trợ toàn màn hình cho khung video này.",
              );
            }
          }}
        >
          Toàn màn hình kèm khung bao
        </button>
      </div>
      <div
        ref={containerRef}
        className="mc-video"
        style={{ aspectRatio: `${camera.width}/${camera.height}` }}
      >
        <video
          ref={videoRef}
          controls
          playsInline
          controlsList="nofullscreen"
          preload="metadata"
          src={artifactUrl(runId, camera.media_path)}
          aria-label={`Video ${camera.name}`}
          onError={() =>
            setPlaybackError(
              "Không tải được video. Kiểm tra API hoặc tải lại trang.",
            )
          }
          onLoadedData={() => setPlaybackError("")}
        />
        <canvas
          ref={canvasRef}
          width={camera.width}
          height={camera.height}
          aria-hidden="true"
        />
      </div>
      {playbackError ? (
        <p className="notice notice-error" role="alert">
          {playbackError}
        </p>
      ) : null}
      <p className="mc-hint">
        L: ID trong camera · P?: ứng viên cùng người giữa camera. Khung bao hiển
        thị theo frame đã xử lý.
      </p>
    </article>
  );
}

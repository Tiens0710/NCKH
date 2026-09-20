"use client";

import { FileUp, FileVideo, HardDriveUpload } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorNotice, LoadingRows } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatDate } from "@/lib/api";
import type { Camera, Video } from "@/lib/types";

function localDateTimeValue() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

export default function VideosPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [startedAt, setStartedAt] = useState(localDateTimeValue);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cameraData, videoData] = await Promise.all([
        apiFetch<Camera[]>("/api/cameras?active_only=true"),
        apiFetch<Video[]>("/api/videos?limit=50"),
      ]);
      setCameras(cameraData);
      setVideos(videoData);
      setCameraId((current) => current || cameraData[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu video.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<Camera[]>("/api/cameras?active_only=true"),
      apiFetch<Video[]>("/api/videos?limit=50"),
    ])
      .then(([cameraData, videoData]) => {
        if (!active) return;
        setCameras(cameraData);
        setVideos(videoData);
        setCameraId(cameraData[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu video.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !cameraId) return;
    setUploading(true); setError(""); setSuccess("");
    const body = new FormData();
    body.append("file", file);
    body.append("camera_id", cameraId);
    body.append("started_at", new Date(startedAt).toISOString());
    try {
      await apiFetch<Video>("/api/videos/upload", { method: "POST", body });
      setFile(null);
      setSuccess("Video đã được đưa vào hàng đợi xử lý.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload video thất bại.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Dữ liệu đầu vào" title="Video giám sát" description="Upload đoạn video ngắn, gắn với camera và theo dõi trạng thái xử lý." />
      {error ? <ErrorNotice message={error} /> : null}
      {success ? <div className="notice notice-success" role="status"><HardDriveUpload size={19} />{success}</div> : null}

      <section className="panel upload-strip">
        <div><span className="large-icon"><FileUp size={24} /></span><div><h2>Thêm video mới</h2><p>Tối đa 48 MB trong phiên bản thử nghiệm hiện tại.</p></div></div>
        <form className="upload-form" onSubmit={handleUpload}>
          <label className="field"><span>Camera</span><select required value={cameraId} onChange={(e) => setCameraId(e.target.value)}><option value="">Chọn camera</option>{cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>
          <label className="field"><span>Thời điểm bắt đầu</span><input required type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></label>
          <label className="file-picker"><input required type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><FileVideo size={18} /><span>{file?.name ?? "Chọn tệp video"}</span></label>
          <button className="button button-primary" disabled={uploading || !file || !cameraId} type="submit">{uploading ? "Đang tải lên..." : "Upload video"}</button>
        </form>
      </section>

      <section className="panel data-panel">
        <div className="panel-heading"><div><p className="section-kicker">Kho dữ liệu</p><h2>Video đã tải lên</h2></div><span className="record-count">{videos.length} bản ghi</span></div>
        {loading ? <LoadingRows /> : videos.length === 0 ? <EmptyState title="Chưa có video" description="Video đầu tiên sẽ xuất hiện tại đây sau khi upload." /> : (
          <div className="table-wrap"><table><thead><tr><th>Tệp</th><th>Camera</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{videos.map((video) => <tr key={video.id}><td><strong>{String(video.metadata?.original_filename ?? "Video")}</strong><small>{video.storage_path}</small></td><td>{video.cameras?.name ?? "—"}</td><td>{formatDate(video.started_at)}</td><td><StatusBadge status={video.status} /></td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}

"use client";

import { ArrowRight, Camera, FileVideo, Radar, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorNotice, LoadingRows } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { ResearchContext } from "@/components/ResearchContext";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatDate } from "@/lib/api";
import type { Camera as CameraRecord, Video } from "@/lib/types";

export default function DashboardPage() {
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<CameraRecord[]>("/api/cameras"), apiFetch<Video[]>("/api/videos?limit=6")])
      .then(([cameraData, videoData]) => {
        if (!active) return;
        setCameras(cameraData);
        setVideos(videoData);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không rõ nguyên nhân.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const completed = videos.filter((video) => video.status === "completed").length;
  const activeCameras = cameras.filter((camera) => camera.is_active).length;

  return (
    <>
      <PageHeader
        eyebrow="Trung tâm điều phối"
        title="Tổng quan hệ thống"
        description="Theo dõi nguồn camera, tiến độ xử lý video và bắt đầu một truy vấn Re-ID mới."
        action={
          <Link className="button button-primary" href="/search">
            <ScanSearch size={18} aria-hidden="true" />
            Tìm một người
          </Link>
        }
      />

      {error ? <ErrorNotice message={error} /> : null}

      <section className="metric-grid" aria-label="Chỉ số hệ thống">
        <Metric label="Camera hoạt động" value={loading ? "—" : String(activeCameras)} note={`${cameras.length} camera đã khai báo`} icon={<Camera />} />
        <Metric label="Video gần đây" value={loading ? "—" : String(videos.length)} note={`${completed} đã xử lý xong`} icon={<FileVideo />} />
        <Metric label="Mô hình Re-ID" value="512D" note="Vector cosine · HNSW" icon={<Radar />} />
      </section>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Hoạt động</p>
              <h2>Video mới nhất</h2>
            </div>
            <Link className="text-link" href="/videos">
              Xem tất cả <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {loading ? <LoadingRows /> : videos.length === 0 ? (
            <div className="inline-empty">Chưa có video. Hãy upload video đầu tiên để bắt đầu.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Camera</th><th>Bắt đầu</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {videos.map((video) => (
                    <tr key={video.id}>
                      <td><strong>{video.cameras?.name ?? "Chưa xác định"}</strong><small>{video.cameras?.area ?? video.storage_path}</small></td>
                      <td>{formatDate(video.started_at)}</td>
                      <td><StatusBadge status={video.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel system-panel">
          <p className="section-kicker">Pipeline</p>
          <h2>Luồng xử lý Re-ID</h2>
          <ol className="pipeline-list">
            <PipelineStep index="01" title="Thu nhận" detail="Camera hoặc video tải lên" active />
            <PipelineStep index="02" title="Phát hiện & tracking" detail="YOLO kết hợp ByteTrack" />
            <PipelineStep index="03" title="Trích xuất đặc trưng" detail="Embedding Re-ID 512 chiều" />
            <PipelineStep index="04" title="Đối sánh" detail="pgvector và ràng buộc thời gian" />
          </ol>
        </aside>
      </div>

      <ResearchContext />
    </>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <article className="metric"><div className="metric-icon" aria-hidden="true">{icon}</div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function PipelineStep({ index, title, detail, active = false }: { index: string; title: string; detail: string; active?: boolean }) {
  return <li className={active ? "pipeline-active" : ""}><span>{index}</span><div><strong>{title}</strong><small>{detail}</small></div></li>;
}

"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CircleHelp,
  FileVideo,
  Play,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ResearchContext } from "@/components/ResearchContext";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatDate } from "@/lib/api";
import type { Camera as CameraRecord, Video } from "@/lib/types";

const KAGGLE_NOTEBOOK = "https://www.kaggle.com/code/tiens0710/nckh-retinanet-worker/edit";

export default function DashboardPage() {
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cameraData, videoData] = await Promise.all([
        apiFetch<CameraRecord[]>("/api/cameras"),
        apiFetch<Video[]>("/api/videos?limit=6"),
      ]);
      setCameras(cameraData);
      setVideos(videoData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<CameraRecord[]>("/api/cameras"),
      apiFetch<Video[]>("/api/videos?limit=6"),
    ])
      .then(([cameraData, videoData]) => {
        if (!active) return;
        setCameras(cameraData);
        setVideos(videoData);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const states = videos.map(getDetectionState);
    return {
      activeCameras: cameras.filter((camera) => camera.is_active).length,
      pending: states.filter((state) => state === "pending").length,
      processing: states.filter((state) => state === "processing").length,
      completed: states.filter((state) => state === "completed").length,
      failed: states.filter((state) => state === "failed").length,
    };
  }, [cameras, videos]);

  const workerMessage = counts.pending > 0
    ? `${counts.pending} video gần đây đang chờ Kaggle Worker.`
    : counts.processing > 0
      ? `${counts.processing} video gần đây đang được xử lý.`
      : counts.completed > 0
        ? `${counts.completed} video đã có kết quả RetinaNet.`
        : counts.failed > 0
          ? `${counts.failed} video lỗi. Kiểm tra trạng thái trong trang Video.`
        : "Chưa có video trong hàng đợi.";

  return (
    <div className="overview-page">
      <PageHeader
        eyebrow="Không gian làm việc"
        title="Bảng điều khiển"
        description="Theo dõi video và tiếp tục đúng bước trong quy trình phân tích."
        action={
          <Link className="button button-primary" href="/videos">
            <FileVideo size={18} aria-hidden="true" />
            Thêm video
          </Link>
        }
      />

      {error ? (
        <div className="notice notice-error overview-error" role="alert">
          <CircleHelp size={19} aria-hidden="true" />
          <div><strong>Không tải được dữ liệu</strong><p>{error}</p></div>
          <button className="button button-secondary" type="button" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> Thử lại
          </button>
        </div>
      ) : null}

      <section className="overview-command" aria-labelledby="overview-command-title">
        <div className="overview-command-copy">
          <span className="overview-command-icon" aria-hidden="true"><ScanSearch size={21} /></span>
          <p className="section-kicker">Bắt đầu phân tích</p>
          <h2 id="overview-command-title">Từ video đến kết quả</h2>
          <p>Gửi video từ trang Video, chạy RetinaNet trong Kaggle, rồi quay lại xem số khung hình có người.</p>
          <div className="overview-actions">
            <Link className="button button-primary" href="/videos"><FileVideo size={17} aria-hidden="true" /> Chọn video</Link>
            <Link className="button button-secondary" href="/results/demo">Xem demo giao diện</Link>
          </div>
        </div>

        <div className="overview-workflow">
          <div className="overview-workflow-heading">
            <div><span className="section-kicker">Quy trình hiện tại</span><h3>Ba thao tác</h3></div>
            <span className="workflow-state" role="status">{workerMessage}</span>
          </div>
          <ol className="workflow-steps">
            <li><span className="workflow-step-icon"><FileVideo size={16} /></span><div><strong>Gửi video</strong><small>Video được lưu và đưa vào hàng đợi.</small></div><Link href="/videos" aria-label="Mở trang Video"><ArrowRight size={17} /></Link></li>
            <li><span className="workflow-step-icon"><Play size={16} /></span><div><strong>Chạy Kaggle Worker</strong><small>Mở notebook và chọn Run All để chạy RetinaNet.</small></div><a href={KAGGLE_NOTEBOOK} target="_blank" rel="noreferrer" aria-label="Mở Kaggle Notebook trong tab mới"><ArrowUpRight size={17} /></a></li>
            <li><span className="workflow-step-icon"><Check size={16} /></span><div><strong>Xem kết quả</strong><small>Quay lại trang Video, tải lại danh sách để xem phát hiện.</small></div><Link href="/videos" aria-label="Mở danh sách video"><ArrowRight size={17} /></Link></li>
          </ol>
        </div>
      </section>

      <section className="overview-stats" aria-label="Tình trạng dữ liệu">
        <Stat label="Camera hoạt động" value={loading ? "…" : String(counts.activeCameras)} icon={<Camera size={18} />} />
        <Stat label="Video gần đây" value={loading ? "…" : String(videos.length)} icon={<FileVideo size={18} />} />
        <Stat label="Chờ hoặc đang chạy" value={loading ? "…" : String(counts.pending + counts.processing)} icon={<Play size={18} />} />
        <Stat label="Đã có kết quả" value={loading ? "…" : String(counts.completed)} icon={<Check size={18} />} />
      </section>

      <section className="panel overview-activity" aria-labelledby="overview-video-title">
        <div className="panel-heading">
          <div><p className="section-kicker">Dữ liệu mới nhất</p><h2 id="overview-video-title">Video gần đây</h2></div>
          <div className="overview-panel-actions">
            <button className="icon-button" type="button" onClick={() => void loadData()} disabled={loading} aria-label="Tải lại dữ liệu video"><RefreshCw size={17} /></button>
            <Link className="text-link" href="/videos">Mở trang Video <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
        {loading ? <div className="overview-loading" aria-busy="true">Đang tải video…</div> : videos.length === 0 ? (
          <div className="overview-empty"><FileVideo size={25} aria-hidden="true" /><strong>Chưa có video</strong><span>Thêm video để đưa video đầu tiên vào hàng đợi.</span><Link className="text-link" href="/videos">Thêm video <ArrowRight size={15} /></Link></div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Tệp và camera</th><th>Thời gian</th><th>Phát hiện</th><th>Trạng thái</th></tr></thead>
            <tbody>{videos.map((video) => {
              const detectionState = getDetectionState(video);
              const detection = video.metadata?.detection as { person_boxes?: number } | undefined;
              return <tr key={video.id}>
                <td><strong>{String(video.metadata?.original_filename ?? "Video")}</strong><small>{video.cameras?.name ?? "Camera chưa xác định"}</small></td>
                <td>{formatDate(video.started_at)}</td>
                <td>{detectionState === "completed" ? `${detection?.person_boxes ?? 0} khung bao` : "Chưa có"}</td>
                <td><StatusBadge status={detectionState} /></td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </section>

      <details className="research-disclosure">
        <summary>Thông tin kiến trúc nghiên cứu</summary>
        <ResearchContext />
      </details>
    </div>
  );
}

function getDetectionState(video: Video): string {
  const detection = video.metadata?.detection as { status?: string } | undefined;
  if (detection?.status) return detection.status;
  return video.status === "completed" ? "uploaded" : video.status;
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="overview-stat"><span className="overview-stat-icon" aria-hidden="true">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

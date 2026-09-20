"use client";

import { ArrowLeft, Camera, Clock3, MapPinned, RefreshCw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorNotice, LoadingRows } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DemoResults } from "@/components/DemoResults";
import { apiFetch, formatDate } from "@/lib/api";
import type { SearchDetail } from "@/lib/types";

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  if (params.id === "demo") return <DemoResults />;
  return <LiveResults queryId={params.id} />;
}

function LiveResults({ queryId }: { queryId: string }) {
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadResult = useCallback(async () => {
    setLoading(true); setError("");
    try { setDetail(await apiFetch<SearchDetail>(`/api/searches/${queryId}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không tải được kết quả."); }
    finally { setLoading(false); }
  }, [queryId]);

  useEffect(() => {
    let active = true;
    apiFetch<SearchDetail>(`/api/searches/${queryId}`)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được kết quả.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queryId]);

  return (
    <>
      <PageHeader eyebrow="Kết quả truy vấn" title="Đối sánh người" description={`Mã truy vấn ${queryId}`} action={<Link className="button button-secondary" href="/search"><ArrowLeft size={17} />Truy vấn mới</Link>} />
      {error ? <ErrorNotice message={error} /> : null}
      {loading ? <section className="panel"><LoadingRows /></section> : detail ? (
        <>
          <section className="result-summary panel">
            <div><span className="large-icon"><ScanSearch size={24} /></span><div><p className="section-kicker">Trạng thái</p><h2>{detail.results.length} kết quả phù hợp</h2></div></div>
            <StatusBadge status={detail.query.status} />
            <div className="summary-fact"><span>Ngưỡng</span><strong>{Math.round(detail.query.similarity_threshold * 100)}%</strong></div>
            <div className="summary-fact"><span>Khởi tạo</span><strong>{formatDate(detail.query.created_at)}</strong></div>
            <button className="icon-button" type="button" onClick={() => void loadResult()} aria-label="Làm mới kết quả"><RefreshCw size={18} /></button>
          </section>

          <div className="results-grid">
            <section className="panel"><div className="panel-heading"><div><p className="section-kicker">Xếp hạng</p><h2>Các lần xuất hiện</h2></div></div>
              {detail.results.length === 0 ? <EmptyState title="Chưa có đối sánh" description="AI Worker chưa xử lý embedding hoặc chưa tìm thấy người đủ tương đồng." /> : <ol className="match-list">{detail.results.map((result) => <li key={result.id}><span className="rank">#{result.rank ?? "—"}</span><div className="match-thumb"><Camera size={22} /></div><div className="match-main"><strong>{result.tracklets?.videos?.cameras?.name ?? "Camera chưa xác định"}</strong><span><Clock3 size={14} />{formatDate(result.tracklets?.started_at)}</span></div><strong className="score">{Math.round(result.similarity_score * 100)}%</strong></li>)}</ol>}
            </section>
            <aside className="panel"><div className="panel-heading"><div><p className="section-kicker">Không gian</p><h2>Hành trình camera</h2></div></div>
              {detail.trajectory.length === 0 ? <EmptyState title="Chưa có hành trình" description="Các điểm camera sẽ được sắp theo thời gian sau bước đối sánh." /> : <ol className="trajectory-list">{detail.trajectory.map((point) => <li key={point.id}><span>{point.sequence_number}</span><div><strong>{point.cameras?.name ?? "Camera"}</strong><small><MapPinned size={13} />{point.cameras?.area ?? "Chưa đặt khu vực"}</small><small>{formatDate(point.appeared_at)}</small></div></li>)}</ol>}
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}

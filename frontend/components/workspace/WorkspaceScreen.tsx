"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Video, History, Download, Trash2, RefreshCw } from "lucide-react";
import type { WorkspaceView } from "@/lib/workspace-types";
import { appearances, exportEvidenceCsv } from "@/lib/evidence";
import { AnalyticsScreen } from "./AnalyticsScreen";
import { SubjectsScreen, SettingsScreen, IncidentsScreen } from "./OperationsScreens";
import { MonitorScreen } from "./MonitorScreen";
import { CameraScreen } from "./CameraScreen";
import { VideoScreen } from "./VideoScreen";
import { PeopleScreen } from "./PeopleScreen";
import { JourneyScreen } from "./JourneyScreen";
import { downloadJson, useWorkspace } from "./WorkspaceProvider";
import { EmptyState, NeedWorkspace, ScreenTitle } from "./WorkspacePrimitives";

export function WorkspaceScreen({ view }: { view: WorkspaceView }) {
  if (view === 'subjects') return <SubjectsScreen />;
  if (view === 'analytics') return <AnalyticsScreen />;
  if (view === 'settings') return <SettingsScreen />;
  if (view === 'incidents') return <IncidentsScreen />;
  if (view === 'cameras') return <CameraScreen />;
  if (view === 'videos') return <VideoScreen />;
  if (view === 'people') return <PeopleScreen />;
  if (view === 'journey') return <JourneyScreen />;
  if (view === 'history') return <HistoryScreen />;
  return <MonitorScreen />;
}
function HistoryScreen() {
  const app = useWorkspace(), router = useRouter();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const jobs = (app.data?.jobs ?? []).filter(job => job.name.toLocaleLowerCase('vi-VN').includes(filter.toLocaleLowerCase('vi-VN')));
  const result = app.job?.result;
  async function remove() {
    const name = app.data?.jobs.find(job => job.id === app.jobId)?.name ?? 'phiên đang chọn';
    if (!confirm(`Xóa "${name}" cùng video, JSON và ghi chú khỏi máy chủ? Không thể khôi phục.`)) return;
    setBusy(true);
    try { await app.jobAction('DELETE'); }
    catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([exportEvidenceCsv(appearances(result))], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `campus-trace-${app.job!.id}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <ScreenTitle title="Lịch sử và xuất dữ liệu" description="Mở lại phiên đã lưu, tải bằng chứng và quản lý dữ liệu riêng." action={app.access ? <button className="ct-button" onClick={() => void app.refresh().catch(failure => app.setError(failure.message))}><RefreshCw size={16} />Cập nhật</button> : undefined} />
    {!app.access ? <NeedWorkspace /> : null}
    <div className="ct-history-layout"><section className="ct-panel"><div className="ct-section-head"><h2>{jobs.length} phiên</h2><label className="ct-sr-only" htmlFor="history-filter">Tìm phiên theo tên</label><input id="history-filter" type="search" placeholder="Tìm tên phiên…" value={filter} onChange={event => setFilter(event.target.value)} /></div>
      {!jobs.length ? <EmptyState icon={History} title="Không có phiên phù hợp" text="Gửi video mới hoặc xóa điều kiện lọc để xem lịch sử." /> : <ul className="ct-job-list">{jobs.map(job => <li key={job.id}><button className={app.jobId === job.id && !app.replay ? 'selected' : ''} onClick={() => app.selectJob(job.id)}><span><strong>{job.name}</strong><small>{new Date(job.created_at).toLocaleString('vi-VN')}</small></span><span className="ct-track-id">{job.id.slice(0, 8)}<ArrowRight size={15} /></span></button></li>)}</ul>}
    </section><section className="ct-panel"><div className="ct-section-head"><h2>Phiên đang mở</h2></div>
      {!app.job || app.replay ? <EmptyState icon={Video} title="Chưa chọn phiên phân tích" text="Chọn một phiên đã lưu để xem kết quả. Dữ liệu minh họa không được đưa vào lịch sử riêng." /> : <div className="ct-form-stack"><h3>{app.data?.jobs.find(job => job.id === app.jobId)?.name}</h3><p>{app.job.stage}</p><p className="ct-caption">{app.jobId}</p>
        {result ? <><dl className="ct-key-values"><div><dt>Mô hình phát hiện</dt><dd>{result.detector.name}</dd></div><div><dt>Camera / đoạn theo dõi</dt><dd>{result.cameras.length} / {result.tracks.length}</dd></div><div><dt>Tốc độ toàn luồng</dt><dd>{result.metrics.processing_fps.toFixed(1)} FPS</dd></div><div><dt>Ghi chú đối chiếu</dt><dd>{app.notes.length}</dd></div></dl>
          <button className="ct-button ct-primary" onClick={() => router.push('/workspace/journey')}>Mở hành trình<ArrowRight size={16} /></button>
          <button className="ct-button" onClick={() => downloadJson({ result, reviews: app.notes, cameras: app.data?.cameras }, `campus-trace-${app.jobId}.json`)}><Download size={16} />Tải JSON và ghi chú</button><button className="ct-button" onClick={exportCsv}><Download size={16} />Tải bảng lần xuất hiện CSV</button></> : <p className="ct-muted">Kết quả xuất hiện sau khi phiên xử lý hoàn thành.</p>}
        <button className="ct-button ct-danger" disabled={busy || app.job.status === 'processing'} onClick={() => void remove()}><Trash2 size={16} />{busy ? 'Đang xóa…' : 'Xóa phiên và video'}</button>
      </div>}
    </section></div>
    <p className="ct-caption">Video được lưu trong vùng lưu trữ riêng tư. Tệp quyền truy cập không gian cho phép mở lại lịch sử; quyền truy cập tạm thời của từng phiên hết hạn sau 24 giờ. Khi xóa phiên, dữ liệu trên máy chủ sẽ được gỡ bỏ; các tệp đã tải về thiết bị vẫn được giữ nguyên.</p>
  </>;
}

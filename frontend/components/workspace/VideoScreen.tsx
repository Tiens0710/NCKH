"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Upload, Radio, FileVideo, ArrowRight } from "lucide-react";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import type { WorkspaceAccess } from "@/lib/workspace-types";
import { downloadJson, jsonApi, useWorkspace } from "./WorkspaceProvider";
import { NeedWorkspace, ScreenTitle } from "./WorkspacePrimitives";
import { gatewayConfig } from '@/lib/camera-connection';

type FileRow = { file: File; cameraId: string; offset: string };
type UploadJob = WorkspaceAccess & { uploads: { url: string; size: number }[] };
const PENDING = 'campus-trace-pending-job';
export function VideoScreen() {
  const app = useWorkspace(), router = useRouter();
  const [mode, setMode] = useState<'sample' | 'upload' | 'rtsp'>('sample');
  const [sampleId, setSampleId] = useState(DEMO_SAMPLES[0].id);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pending, setPending] = useState<WorkspaceAccess | null>(null);
  const sample = DEMO_SAMPLES.find(sample => sample.id === sampleId)!;
  const processing = app.job && ['queued', 'processing'].includes(app.job.status);
  useEffect(() => { queueMicrotask(() => { try { setPending(JSON.parse(sessionStorage.getItem(PENDING) ?? 'null')); } catch { /* No pending capability. */ } }); }, []);
  function remember(job: WorkspaceAccess) {
    const value = { id: job.id, token: job.token }; sessionStorage.setItem(PENDING, JSON.stringify(value)); setPending(value);
  }
  function clearPending() { sessionStorage.removeItem(PENDING); setPending(null); }
  async function putFiles(targets: UploadJob['uploads']) {
    if (targets.length !== rows.length || rows.some((row, i) => row.file.size !== targets[i].size)) throw new Error('Chọn lại đúng các video và thứ tự của phiên tải dở. Kích thước file chưa khớp.');
    for (let index = 0; index < rows.length; index++) {
      setProgress(`Đang tải video ${index + 1}/${rows.length}…`);
      const response = await fetch(targets[index].url, { method: 'PUT', body: rows[index].file, headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error('Tải video thất bại. Phiên đã được giữ trong lịch sử để tiếp tục.');
    }
  }
  async function start() {
    if (!app.access) return;
    setBusy(true); app.setError('');
    try {
      if (mode === 'sample') {
        setProgress('Đang tạo phiên xử lý mẫu…');
        const job = await jsonApi<WorkspaceAccess>('/api/demo/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sample_id: sampleId }) });
        remember(job); await app.attach(job, name.trim() || sample.title); clearPending();
      } else {
        if (rows.length < 2 || rows.length > 3 || rows.some(row => row.file.size > 48 * 1024 * 1024)) throw new Error('Chọn 2–3 video, tối đa 48 MB mỗi video.');
        if (rows.some(row => row.offset.trim() && (!Number.isFinite(Number(row.offset)) || Number(row.offset) < 0 || Number(row.offset) > 86400))) throw new Error('Mốc bắt đầu cần từ 0 đến 86400 giây.');
        const files = rows.map(row => {
          const camera = app.data?.cameras.find(camera => camera.id === row.cameraId);
          return { name: row.file.name, size: row.file.size, type: row.file.type, camera_name: camera?.name ?? row.file.name,
            ...(row.offset.trim() ? { timeline_start_seconds: Number(row.offset) } : {}), ...(camera?.location ? { location: camera.location } : {}) };
        });
        setProgress('Đang tạo phiên tải…');
        const job = await jsonApi<UploadJob>('/api/demo/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent, files }) });
        const mapping = Object.fromEntries(rows.flatMap((row, index) => row.cameraId ? [[`CAM-${index + 1}`, row.cameraId]] : []));
        remember(job); await app.attach(job, name.trim() || `Video · ${new Date().toLocaleDateString('vi-VN')}`, mapping);
        await putFiles(job.uploads);
        await jsonApi(`/api/workspaces/${app.access.id}/jobs/${job.id}`, { method: 'POST', headers: { Authorization: `Bearer ${app.access.token}` } });
        clearPending();
      }
      setProgress('Đã gửi vào hàng đợi GPU.');
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function resume() {
    if (!app.access || !app.jobId) return;
    setBusy(true); app.setError('');
    try {
      const { uploads } = await jsonApi<{ uploads: UploadJob['uploads'] }>(`/api/workspaces/${app.access.id}/jobs/${app.jobId}`, { method: 'POST', headers: { Authorization: `Bearer ${app.access.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'uploads' }) });
      await putFiles(uploads); await app.jobAction('POST'); clearPending(); setProgress('Đã tiếp tục phiên hiện có.');
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function restoreCapture(file?: File) {
    if (!file || !app.access) return;
    setBusy(true);
    try { if (file.size > 4096) throw new Error('File phiên camera không hợp lệ.'); const job = JSON.parse(await file.text());
      if (job.kind !== 'outlier-camera-job') throw new Error('Chọn access.json do gateway tạo.');
      await app.attach(job, name.trim() || 'Đoạn ghi camera RTSP');
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <ScreenTitle title="Phân tích video" description="Chọn video và gửi xử lý. Kết quả cập nhật tự động." action={<Link href="/workspace/history">Lịch sử video</Link>} />
    {!app.access ? <NeedWorkspace /> : null}
    {app.online === false ? <div className="ct-message"><span><strong>GPU đang ngoại tuyến.</strong> Vẫn xem được video gốc, kết quả và lịch sử đã lưu. Cần bật worker Kaggle để phân tích mới.</span><button onClick={() => void app.showReplay().then(() => router.push('/workspace/people')).catch(failure => app.setError(failure.message))}>Xem kết quả mẫu</button></div> : null}
    <div className="ct-video-layout"><section className="ct-panel ct-input-panel">
      <div className="ct-tabs" role="group" aria-label="Nguồn video">{([['sample', Play, 'Video mẫu'], ['upload', Upload, 'Tải video'], ['rtsp', Radio, 'Camera RTSP']] as const).map(([value, Icon, title]) => <button key={value} aria-pressed={mode === value} disabled={busy} onClick={() => setMode(value)}><Icon size={16} />{title}</button>)}</div>
      <label className="ct-session-name">Tên phiên (tùy chọn)<input maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Ví dụ: cổng chính buổi sáng" /></label>
      {mode === 'sample' ? <>
        <label>Bộ video<select value={sampleId} disabled={busy} onChange={event => setSampleId(event.target.value)}>{DEMO_SAMPLES.filter(sample => !sample.research_only).map(sample => <option key={sample.id} value={sample.id}>{sample.title}</option>)}</select></label>
        <p className="ct-muted">{sample.cameras.length} camera {sample.simulation ? 'giả lập' : 'thật'} · {sample.duration_seconds} giây · đầu vào chưa xử lý</p>
        <div className="ct-raw-videos">{sample.cameras.map(camera => <article key={camera.file}><h3>{camera.name}</h3><video controls muted playsInline preload="metadata" poster={sample.attribution ? `/demo/samples/${camera.file.replace(/\.mp4$/, '.jpg')}` : undefined} src={`/demo/samples/${camera.file}`} /></article>)}</div>
        <details className="ct-source"><summary>Nguồn dữ liệu & giới hạn</summary><p>{sample.description}</p><p>{sample.challenge}</p><p><a href={sample.source_url} target="_blank" rel="noreferrer">{sample.source_name}</a> · {sample.license}</p>{sample.attribution ? <p>{sample.attribution}</p> : null}<p>Mỗi lần bấm phân tích tạo job AI mới. Xem video gốc không gửi job.</p></details>
      </> : mode === 'upload' ? <>
        <label className="ct-upload-zone"><Upload size={24} /><strong>Chọn video từ máy</strong><span>2–3 file · MP4, MOV, AVI, MKV, WEBM · tối đa 48 MB/file</span><input multiple type="file" accept=".mp4,.mov,.avi,.mkv,.webm" disabled={busy} onChange={event => setRows(Array.from(event.target.files ?? []).map(file => ({ file, cameraId: '', offset: '' })))} /></label>
        {!app.data?.cameras.length ? <p className="ct-muted">Chưa có danh mục camera. Có thể phân tích theo tên file hoặc <Link className="ct-text-link" href="/workspace/cameras">thêm camera</Link> để lưu vị trí.</p> : null}
        {rows.map((row, index) => <fieldset className="ct-upload-row" key={`${row.file.name}-${index}`}><legend>{index + 1}. {row.file.name} · {(row.file.size / 1024 / 1024).toFixed(1)} MB</legend><label>Camera<select value={row.cameraId} disabled={busy} onChange={event => setRows(rows.map((item, position) => position === index ? { ...item, cameraId: event.target.value } : item))}><option value="">Theo tên video</option>{app.data?.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select></label>
          <label>Bắt đầu từ mốc chung (giây)<input type="number" min="0" max="86400" step="any" value={row.offset} disabled={busy} onChange={event => setRows(rows.map((item, position) => position === index ? { ...item, offset: event.target.value } : item))} placeholder="Không biết thì để trống" /></label></fieldset>)}
        <p className="ct-caption">Chỉ phân tích 30 giây đầu, tối đa 10 frame/giây. Để trống mốc khi chưa đồng bộ; hệ thống không bịa thứ tự di chuyển.</p>
        <label className="ct-checkbox"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />Tôi có quyền sử dụng video và đồng ý gửi tới Storage/Kaggle.</label>
      </> : <div className="ct-form-stack"><h2>Kết nối qua bộ thu tại trường</h2><p>Gateway đọc camera trong mạng nội bộ, ghi đoạn ngắn rồi gửi vào cùng hàng đợi AI. Mật khẩu RTSP giữ trên máy thu.</p>
        <p className="ct-muted">AI xử lý các clip đã gửi. Để xem nguồn camera trên web, thêm URL HLS trong <Link href="/workspace/cameras">Thiết lập camera</Link>. Khi chưa có thiết bị, dùng video mẫu.</p>
        <button className="ct-button" onClick={() => { try { downloadJson(gatewayConfig(app.data?.cameras ?? [], location.origin), 'camera-gateway.json'); } catch (failure) { app.setError((failure as Error).message); } }}>Tải cấu hình gateway</button>
        <label>Mở phiên do gateway gửi<input type="file" accept=".json,application/json" disabled={!app.access || busy} onChange={event => { void restoreCapture(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div>}
      {mode !== 'rtsp' ? <div className="ct-submit-row"><button className="ct-button ct-primary" disabled={busy || !app.access || app.online !== true || !!processing || mode === 'upload' && (!consent || rows.length < 2 || rows.length > 3)} onClick={() => void start()}><Play size={16} />{busy ? 'Đang gửi…' : 'Bắt đầu phân tích'}</button><span className="ct-muted" role="status">{progress || (processing ? 'Có phiên đang xử lý, hãy đợi hoàn thành.' : 'Chỉ gửi khi bạn bấm nút.')}</span></div> : null}
      {pending && app.access ? <div className="ct-message"><span>Quyền truy cập phiên vừa tạo vẫn được giữ để phục hồi.</span><button disabled={busy} onClick={() => { setBusy(true); void app.attach(pending, name.trim() || 'Phiên khôi phục').then(clearPending).catch(failure => app.setError(failure.message)).finally(() => setBusy(false)); }}>Mở lại phiên</button></div> : null}
    </section><aside className="ct-panel ct-processing-panel"><div className="ct-section-head"><h2>Phiên đang mở</h2><FileVideo size={18} /></div>
      {app.job && !app.replay ? <><strong>{app.data?.jobs.find(job => job.id === app.jobId)?.name ?? 'Phiên video'}</strong><p>{app.job.stage}</p><progress max="1" value={app.job.progress} aria-label="Tiến độ xử lý" /><p className="ct-progress-value">{Math.round(app.job.progress * 100)}%</p>{app.job.message ? <p role="alert">{app.job.message}</p> : null}
        {app.job.status === 'completed' ? <Link href="/workspace/people" className="ct-button ct-primary">Xem người đã phát hiện<ArrowRight size={16} /></Link> : app.job.status === 'uploading' ? <><p className="ct-muted">Tải dở: chọn lại các video theo thứ tự ở tab Tải video để tiếp tục, hoặc xác nhận lại nếu mọi byte đã lên máy chủ.</p><button disabled={busy || !rows.length} onClick={() => void resume()}>Tiếp tục tải cùng phiên</button><button disabled={busy} onClick={() => void app.jobAction('POST').catch(failure => app.setError(failure.message))}>Xác nhận video đã tải</button></> : <p className="ct-muted">Trạng thái cập nhật tự động. Không cần bấm chạy lại trên web.</p>}</> : <><p>Chưa gửi video trong lượt này.</p></>}

    </aside></div>
  </>;
}

"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Pencil, Trash2, MapPin, Camera } from "lucide-react";
import type { SiteCamera } from "@/lib/workspace-types";
import { useWorkspace } from "./WorkspaceProvider";
import { campusDiagramPosition, CTU_CAMPUS } from "@/lib/ctu-campus";
import { Modal } from "./Modal";
import { EmptyState, NeedWorkspace, ScreenTitle } from "./WorkspacePrimitives";
import { cameraConnection, gatewayConfig, hlsUrl } from '@/lib/camera-connection';
import { HlsStream } from './HlsStream';
import { RealtimeCamera } from './RealtimeCamera';

const roles = { gate: "Cổng vào/ra", walkway: "Lối đi", yard: "Sân/khu sinh hoạt", other: "Khu vực khác" };
const OperationalMap = dynamic(() => import('./OperationalMap'), { ssr: false, loading: () => <p>Đang mở bản đồ…</p> });
type Draft = { id?: string; name: string; zone: string; role: SiteCamera['role']; source: SiteCamera['source']; x: number; y: number; lat: string; lng: string; streamUrl: string; rtspEnv: string; aiUrl: string; aiToken: string };
const fresh = (): Draft => ({ name: '', zone: '', role: 'walkway', source: 'realtime', x: .5, y: .5, lat: '', lng: '', streamUrl: '', rtspEnv: '', aiUrl: '', aiToken: '' });
export function CameraScreen() {
  const app = useWorkspace();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');
  const [draftError, setDraftError] = useState('');
  const cameras = app.data?.cameras ?? [];
  function edit(camera: SiteCamera) {
    setPreview(''); setDraftError(''); setMessage(''); setDraft({ ...camera, x: camera.position.x, y: camera.position.y, lat: camera.location?.lat.toString() ?? '', lng: camera.location?.lng.toString() ?? '', aiUrl: camera.connection?.realtime_url ?? '', aiToken: camera.connection?.realtime_token ?? '', streamUrl: camera.connection?.stream_url ?? '', rtspEnv: camera.connection?.rtsp_env ?? `CAMPUS_CAMERA_${cameras.findIndex(item => item.id === camera.id) + 1}_RTSP` });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (!!draft.lat.trim() !== !!draft.lng.trim()) { setDraftError('Điền cả vĩ độ và kinh độ, hoặc để trống cả hai.'); return; }
    setBusy(true); app.setError(''); setDraftError('');
    try {
      const connection = cameraConnection(draft.source, { protocol: draft.source, rtsp_env: draft.rtspEnv, stream_url: draft.streamUrl, realtime_url: draft.aiUrl, realtime_token: draft.aiToken });
      await app.mutate({ action: 'save_camera', camera: { id: draft.id, name: draft.name, zone: draft.zone, role: draft.role, source: draft.source,
        connection, position: { x: draft.x, y: draft.y }, ...(draft.lat.trim() ? { location: { lat: Number(draft.lat), lng: Number(draft.lng) } } : {}) } });
      setDraft(null); setMessage('Đã lưu camera trên máy chủ.');
    } catch (failure) { setDraftError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function exportGateway() {
    try {
      const config = gatewayConfig(cameras, window.location.origin);
      const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'camera-gateway.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Đã tải cấu hình gateway, không chứa mật khẩu. Xem hướng dẫn RTSP bên dưới.');
    } catch (failure) { app.setError((failure as Error).message); }
  }
  async function remove(camera: SiteCamera) {
    if (!confirm(`Xóa camera "${camera.name}" khỏi danh mục? Các video và bằng chứng trong lịch sử vẫn được giữ.`)) return;
    setBusy(true);
    try { await app.mutate({ action: 'delete_camera', id: camera.id }); setMessage('Đã xóa khỏi danh mục camera.'); }
    catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <ScreenTitle title="Camera" description="Kết nối nguồn hình ảnh và đặt vị trí trong khuôn viên." action={app.access ? <button className="ct-button ct-primary" onClick={() => { setPreview(''); setDraftError(''); setDraft(fresh()); setMessage(''); }}><Plus size={16} />Thêm camera</button> : undefined} />
    {!app.access ? <NeedWorkspace /> : null}
    {message ? <p className="ct-saved" role="status">{message}</p> : null}
    <section className="ct-camera-connection-guide"><div><h2>Giám sát tự động</h2><p><strong>Camera + AI</strong> · Gateway tự phát hiện liên tục. <strong>HLS</strong> · Chỉ xem hình. <strong>RTSP</strong> · Ghi clip qua gateway cùng mạng camera để gửi AI.</p></div><details><summary>Cấu hình RTSP và gateway</summary><p>Để tự phát hiện liên tục, chạy <code>python -m backend.realtime_gateway --config realtime-gateway.json</code> trên máy GPU và chọn Camera + AI tự động. Xem hướng dẫn trong <code>docs/REALTIME.md</code>. Bộ thu clip bên dưới dành cho phân tích video lưu.</p><p>Thêm 2–3 camera RTSP, mỗi camera dùng một tên biến môi trường riêng. URL và mật khẩu RTSP chỉ đặt trên máy gateway, không nhập vào web.</p><ol><li>Tải mã nguồn dự án và cài <code>backend/requirements-camera.txt</code>.</li><li>Tải cấu hình bên dưới, đặt biến RTSP trên gateway. Khi được phép ghi hình, đổi <code>consent</code> thành <code>true</code> trong file.</li><li>Kiểm tra: <code>python -m backend.camera_gateway --config camera-gateway.json --check</code>.</li><li>Ghi 15 giây và gửi AI: <code>python -m backend.camera_gateway --config camera-gateway.json</code>.</li></ol><p>Mở file <code>access.json</code> của gateway tại mục Video để nhận kết quả. GPU cần chạy để phân tích. Đây là ghi clip theo lần, chưa phải AI liên tục.</p><button className="ct-button" type="button" onClick={exportGateway} disabled={!app.access}>Tải cấu hình gateway</button><p>Nếu muốn xem RTSP ngay trên web, cấu hình gateway chuyển sang HLS và điền URL HLS ở camera. Luồng cần HTTPS và cho phép CORS từ web này.</p></details></section>
    <div className="ct-camera-layout"><section className="ct-panel"><div className="ct-section-head"><h2>{CTU_CAMPUS.name}</h2><span>{cameras.length} camera</span></div>
      <OperationalMap points={cameras.flatMap(camera => camera.location ? [{ id: camera.id, name: camera.name, ...camera.location }] : [])} onSelect={id => { const camera = cameras.find(camera => camera.id === id); if (camera) edit(camera); }} onPlace={app.access ? (lat, lng) => { setMessage(''); setDraft({ ...fresh(), ...campusDiagramPosition(lat, lng), lat: lat.toFixed(7), lng: lng.toFixed(7) }); } : undefined} />
      <p className="ct-caption"><MapPin size={14} />Bấm bản đồ để thêm camera. Camera chưa đặt vị trí chỉ nằm trong danh sách.</p></section>
      <section className="ct-panel"><div className="ct-section-head"><h2>Danh mục camera</h2></div>
        {!cameras.length ? <EmptyState icon={Camera} title="Chưa có camera" text="Thêm camera, chọn HLS, RTSP hoặc video ghi sẵn." /> : <ul className="ct-camera-list">{cameras.map(camera => <li key={camera.id}><div><strong>{camera.name}</strong><span>{camera.zone || 'Chưa đặt khu vực'} · {roles[camera.role]}</span><small>{camera.source === 'rtsp' ? camera.connection?.stream_url ? 'RTSP qua gateway · có luồng HLS' : 'RTSP · cần gateway' : camera.source === 'realtime' ? 'AI tự động · gateway chạy liên tục' : camera.source === 'hls' ? 'Luồng HLS · chỉ xem hình' : 'Video ghi sẵn'}{camera.location ? ' · có tọa độ' : ''}</small></div>
          <button title={`Sửa ${camera.name}`} aria-label={`Sửa ${camera.name}`} onClick={() => edit(camera)}><Pencil size={16} /></button><button title={`Xóa ${camera.name}`} aria-label={`Xóa ${camera.name}`} disabled={busy} onClick={() => void remove(camera)}><Trash2 size={16} /></button></li>)}</ul>}
      </section></div>
    {draft ? <Modal className="ct-modal-wide" titleId="camera-editor-title" onClose={() => !busy && setDraft(null)}>
      <h2 id="camera-editor-title">{draft.id ? 'Sửa camera' : 'Thêm camera'}</h2><form onSubmit={save} className="ct-camera-editor">
        {draftError ? <p className="ct-camera-form-error" role="alert">{draftError}</p> : null}
        <div className="ct-form-stack"><label>Tên camera<input required autoFocus maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Khu vực<input maxLength={80} value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.target.value })} placeholder="Ví dụ: cổng chính, dãy A" /></label>
          <label>Loại vị trí<select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Draft['role'] })}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Nguồn video<select value={draft.source} onChange={event => { setPreview(''); setDraft({ ...draft, source: event.target.value as Draft['source'], rtspEnv: draft.rtspEnv || `CAMPUS_CAMERA_${cameras.length + 1}_RTSP` }); }}><option value="realtime">Camera + AI tự động</option><option value="recorded">Video ghi sẵn</option><option value="hls">HLS · xem trong web</option><option value="rtsp">RTSP · qua gateway</option></select></label>
          {draft.source === 'rtsp' ? <label>Biến môi trường RTSP trên gateway<input required maxLength={80} pattern="[A-Z][A-Z0-9_]{0,79}" value={draft.rtspEnv} onChange={event => setDraft({ ...draft, rtspEnv: event.target.value })} placeholder="CAMPUS_GATE_RTSP" /><small>Chỉ nhập tên biến, không nhập URL hoặc mật khẩu camera.</small></label> : null}
          {draft.source !== 'recorded' && draft.source !== 'realtime' ? <div className="ct-connection-fields"><label>{draft.source === 'hls' ? 'URL luồng HLS (HTTPS)' : 'URL HLS từ gateway (tùy chọn)'}<input type="url" required={draft.source === 'hls'} maxLength={2048} placeholder="https://camera.example.edu/stream/index.m3u8" value={draft.streamUrl} onChange={event => { setPreview(''); setDraft({ ...draft, streamUrl: event.target.value }); }} /><small>Địa chỉ luồng dành cho trình duyệt; không chứa tài khoản hoặc mật khẩu camera.</small></label><button type="button" className="ct-button" disabled={!draft.streamUrl.trim()} onClick={() => { try { setPreview(hlsUrl(draft.streamUrl)); setDraftError(''); } catch (failure) { setDraftError((failure as Error).message); } }}>Kiểm tra luồng</button>{preview ? <HlsStream key={preview} src={preview} name={draft.name || 'camera đang cấu hình'} /> : null}</div> : null}
          {draft.source === 'realtime' ? <div className="ct-connection-fields"><p>AI tự chạy tại gateway, web tự nhận frame và khung bao. Không cần bấm Detect.</p><label>URL AI của camera<input required type="url" maxLength={2048} value={draft.aiUrl} placeholder="https://ai.example.edu/cameras/gate/latest" onChange={event => { setPreview(''); setDraft({ ...draft, aiUrl: event.target.value }); }} /></label><label>Khóa đọc gateway<input required type="password" autoComplete="new-password" minLength={32} maxLength={256} value={draft.aiToken} onChange={event => { setPreview(''); setDraft({ ...draft, aiToken: event.target.value }); }} /></label><button className="ct-button" type="button" onClick={() => { try { const config = cameraConnection('realtime', { protocol: 'realtime', realtime_url: draft.aiUrl, realtime_token: draft.aiToken }); setPreview(config!.realtime_url!); setDraftError(''); } catch (failure) { setDraftError((failure as Error).message); } }}>Xem trạng thái AI</button>{preview ? <RealtimeCamera key={preview + draft.aiToken} connection={{ url: preview, token: draft.aiToken }} name={draft.name || 'camera'} /> : null}<small>Gateway cần đang chạy và có HTTPS/CORS cho web này. Khóa chỉ cấp quyền đọc frame AI; không nhập mật khẩu RTSP.</small></div> : null}
          <details><summary>Tọa độ địa lý (tùy chọn)</summary><div className="ct-two-fields"><label>Vĩ độ<input type="number" step="any" min={-90} max={90} value={draft.lat} onChange={event => setDraft({ ...draft, lat: event.target.value })} /></label><label>Kinh độ<input type="number" step="any" min={-180} max={180} value={draft.lng} onChange={event => setDraft({ ...draft, lng: event.target.value })} /></label></div></details></div>
        <div><p className="ct-muted">Bấm bản đồ để đặt camera.{draft.lat && draft.lng ? ' Đã chọn vị trí.' : ''}</p><OperationalMap points={draft.lat && draft.lng ? [{ id: draft.id ?? 'new', name: draft.name || 'Camera đang đặt', lat: Number(draft.lat), lng: Number(draft.lng), selected: true }] : []} onPlace={(lat, lng) => setDraft({ ...draft, ...campusDiagramPosition(lat, lng), lat: lat.toFixed(7), lng: lng.toFixed(7) })} /></div>
        <div className="ct-form-actions"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Hủy</button><button className="ct-button ct-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu camera'}</button></div>
      </form></Modal> : null}
  </>;
}

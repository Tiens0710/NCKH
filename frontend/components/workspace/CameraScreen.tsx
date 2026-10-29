"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Pencil, Trash2, MapPin, Camera } from "lucide-react";
import type { SiteCamera } from "@/lib/workspace-types";
import { useWorkspace } from "./WorkspaceProvider";
import { campusDiagramPosition, CTU_CAMPUS } from "@/lib/ctu-campus";
import { Modal } from "./Modal";
import { EmptyState, NeedWorkspace, ScreenTitle } from "./WorkspacePrimitives";

const roles = { gate: "Cổng vào/ra", walkway: "Lối đi", yard: "Sân/khu sinh hoạt", other: "Khu vực khác" };
const OperationalMap = dynamic(() => import('./OperationalMap'), { ssr: false, loading: () => <p>Đang mở bản đồ…</p> });
type Draft = { id?: string; name: string; zone: string; role: SiteCamera['role']; source: SiteCamera['source']; x: number; y: number; lat: string; lng: string };
const fresh = (): Draft => ({ name: '', zone: '', role: 'walkway', source: 'recorded', x: .5, y: .5, lat: '', lng: '' });
export function CameraScreen() {
  const app = useWorkspace();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const cameras = app.data?.cameras ?? [];
  function edit(camera: SiteCamera) {
    setMessage(''); setDraft({ ...camera, x: camera.position.x, y: camera.position.y, lat: camera.location?.lat.toString() ?? '', lng: camera.location?.lng.toString() ?? '' });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (!!draft.lat.trim() !== !!draft.lng.trim()) { app.setError('Điền cả vĩ độ và kinh độ, hoặc để trống cả hai.'); return; }
    setBusy(true); app.setError('');
    try {
      await app.mutate({ action: 'save_camera', camera: { id: draft.id, name: draft.name, zone: draft.zone, role: draft.role, source: draft.source,
        position: { x: draft.x, y: draft.y }, ...(draft.lat.trim() ? { location: { lat: Number(draft.lat), lng: Number(draft.lng) } } : {}) } });
      setDraft(null); setMessage('Đã lưu camera trên máy chủ.');
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(camera: SiteCamera) {
    if (!confirm(`Xóa camera "${camera.name}" khỏi danh mục? Các video và bằng chứng trong lịch sử vẫn được giữ.`)) return;
    setBusy(true);
    try { await app.mutate({ action: 'delete_camera', id: camera.id }); setMessage('Đã xóa khỏi danh mục camera.'); }
    catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <ScreenTitle title="Camera" description="Đặt camera vào đúng khu vực để đọc được các lần xuất hiện." action={app.access ? <button className="ct-button ct-primary" onClick={() => { setDraft(fresh()); setMessage(''); }}><Plus size={16} />Thêm camera</button> : undefined} />
    {!app.access ? <NeedWorkspace /> : null}
    {message ? <p className="ct-saved" role="status">{message}</p> : null}
    <div className="ct-camera-layout"><section className="ct-panel"><div className="ct-section-head"><h2>{CTU_CAMPUS.name}</h2><span>{cameras.length} camera</span></div>
      <OperationalMap points={cameras.flatMap(camera => camera.location ? [{ id: camera.id, name: camera.name, ...camera.location }] : [])} onSelect={id => { const camera = cameras.find(camera => camera.id === id); if (camera) edit(camera); }} onPlace={app.access ? (lat, lng) => { setMessage(''); setDraft({ ...fresh(), ...campusDiagramPosition(lat, lng), lat: lat.toFixed(7), lng: lng.toFixed(7) }); } : undefined} />
      <p className="ct-caption"><MapPin size={14} />Bấm bản đồ để thêm camera. Camera chưa đặt vị trí chỉ nằm trong danh sách.</p></section>
      <section className="ct-panel"><div className="ct-section-head"><h2>Danh mục camera</h2></div>
        {!cameras.length ? <EmptyState icon={Camera} title="Chưa có camera" text="Thêm camera, đặt tên và khu vực. Sau đó gắn video ghi sẵn hoặc cấu hình nguồn RTSP." /> : <ul className="ct-camera-list">{cameras.map(camera => <li key={camera.id}><div><strong>{camera.name}</strong><span>{camera.zone || 'Chưa đặt khu vực'} · {roles[camera.role]}</span><small>{camera.source === 'rtsp' ? 'Nguồn RTSP · chưa xác minh kết nối' : 'Video ghi sẵn'}{camera.location ? ' · có tọa độ' : ''}</small></div>
          <button title={`Sửa ${camera.name}`} aria-label={`Sửa ${camera.name}`} onClick={() => edit(camera)}><Pencil size={16} /></button><button title={`Xóa ${camera.name}`} aria-label={`Xóa ${camera.name}`} disabled={busy} onClick={() => void remove(camera)}><Trash2 size={16} /></button></li>)}</ul>}
      </section></div>
    {draft ? <Modal className="ct-modal-wide" titleId="camera-editor-title" onClose={() => !busy && setDraft(null)}>
      <h2 id="camera-editor-title">{draft.id ? 'Sửa camera' : 'Thêm camera'}</h2><form onSubmit={save} className="ct-camera-editor">
        <div className="ct-form-stack"><label>Tên camera<input required autoFocus maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Khu vực<input maxLength={80} value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.target.value })} placeholder="Ví dụ: cổng chính, dãy A" /></label>
          <label>Loại vị trí<select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Draft['role'] })}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Nguồn video<select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value as Draft['source'] })}><option value="recorded">Video ghi sẵn</option><option value="rtsp">Camera RTSP</option></select></label>
          <details><summary>Tọa độ địa lý (tùy chọn)</summary><div className="ct-two-fields"><label>Vĩ độ<input type="number" step="any" min={-90} max={90} value={draft.lat} onChange={event => setDraft({ ...draft, lat: event.target.value })} /></label><label>Kinh độ<input type="number" step="any" min={-180} max={180} value={draft.lng} onChange={event => setDraft({ ...draft, lng: event.target.value })} /></label></div></details></div>
        <div><p className="ct-muted">Bấm bản đồ để đặt camera.{draft.lat && draft.lng ? ' Đã chọn vị trí.' : ''}</p><OperationalMap points={draft.lat && draft.lng ? [{ id: draft.id ?? 'new', name: draft.name || 'Camera đang đặt', lat: Number(draft.lat), lng: Number(draft.lng), selected: true }] : []} onPlace={(lat, lng) => setDraft({ ...draft, ...campusDiagramPosition(lat, lng), lat: lat.toFixed(7), lng: lng.toFixed(7) })} /></div>
        <div className="ct-form-actions"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Hủy</button><button className="ct-button ct-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu camera'}</button></div>
      </form></Modal> : null}
  </>;
}

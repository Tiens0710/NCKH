"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Download, Clock3, ArrowRight, Check, X, HelpCircle } from "lucide-react";
import { appearances, directEvidence, seconds, type Appearance } from "@/lib/evidence";
import { FocusVideo } from "@/components/PersonSearchResults";
import { SiteDiagram, type DiagramEdge } from "./SiteDiagram";
import { TrackPortrait } from "./TrackPortrait";
import { downloadJson, useWorkspace } from "./WorkspaceProvider";
import { NoResult, ScreenTitle } from "./WorkspacePrimitives";

const OperationalMap = dynamic(() => import('./OperationalMap'), { ssr: false, loading: () => <p>Đang mở bản đồ…</p> });
const decisionLabels = { same: 'Xác nhận cùng người', different: 'Không cùng người', uncertain: 'Chưa đủ bằng chứng', entry: 'Đánh dấu vào', exit: 'Đánh dấu ra', presence: 'Có mặt' };
export function JourneyScreen() {
  const app = useWorkspace(), result = app.job?.result;
  const [mapMode, setMapMode] = useState<'diagram' | 'geo'>('geo');
  const [otherKey, setOtherKey] = useState('');
  const [note, setNote] = useState('');
  const [eventKind, setEventKind] = useState<'entry' | 'exit' | 'presence'>('presence');
  const [eventTime, setEventTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const key = app.selection?.trackKey ?? result?.tracks[0]?.track_key ?? '';
  const allRows = useMemo(() => result ? appearances(result) : [], [result]);
  const evidence = useMemo(() => result ? directEvidence(result, app.notes, key) : { rows: [], synchronized: false }, [result, app.notes, key]);
  const root = allRows.find(row => row.track.track_key === key);
  const focused = allRows.find(row => row.camera.camera_id === app.selection?.cameraId && (app.selection.trackId === undefined || row.track.local_track_id === app.selection.trackId)) ?? root;
  const focusedTracks = useMemo(() => focused ? [focused.track] : [], [focused]);
  const viewerFocus = useMemo(() => focused ? { cameraId: focused.camera.camera_id, trackId: focused.track.local_track_id,
    seconds: app.selection?.cameraId === focused.camera.camera_id ? app.selection.seconds : focused.first, revision: app.selection?.revision ?? 0 } : null, [focused, app.selection]);
  const options = allRows.filter(row => row.camera.camera_id !== root?.camera.camera_id);
  const other = options.find(row => row.track.track_key === otherKey) ?? options.find(row => evidence.rows.some(item => item.track.track_key === row.track.track_key && item.relationship !== 'selected'));
  const nodes = useMemo(() => result?.cameras.map((camera, index) => {
    const jobIndex = app.data?.jobs.find(job => job.id === app.jobId);
    const config = jobIndex?.camera_snapshots?.[camera.camera_id] ?? app.data?.cameras.find(item => item.id === jobIndex?.camera_ids[camera.camera_id]);
    return { id: camera.camera_id, name: camera.name, zone: config?.zone, x: config?.position.x ?? .12 + index * .76 / Math.max(1, result.cameras.length - 1),
      y: config?.position.y ?? (index % 2 ? .3 : .65), selected: camera.camera_id === root?.camera.camera_id,
      count: result.tracks.filter(track => track.camera_id === camera.camera_id).length, location: camera.location ?? config?.location };
  }) ?? [], [result, app.data, app.jobId, root?.camera]);
  const edges: DiagramEdge[] = [];
  for (const row of evidence.rows) {
    if (!root || row.camera.camera_id === root.camera.camera_id || row.relationship === 'selected') continue;
    edges.push({ from: root.camera.camera_id, to: row.camera.camera_id, confirmed: row.relationship === 'confirmed', directed: false });
  }
  const confirmedRows = evidence.rows.filter(row => row.relationship !== 'candidate');
  if (evidence.synchronized && confirmedRows.length > 1) {
    const confirmedEdges = [];
    for (let i = 1; i < confirmedRows.length; i++) if (confirmedRows[i - 1].camera.camera_id !== confirmedRows[i].camera.camera_id)
      confirmedEdges.push({ from: confirmedRows[i - 1].camera.camera_id, to: confirmedRows[i].camera.camera_id, confirmed: true, directed: true });
    for (let i = edges.length - 1; i >= 0; i--) if (edges[i].confirmed) edges.splice(i, 1);
    edges.push(...confirmedEdges);
  }
  const points = nodes.flatMap(node => node.location ? [{ id: node.id, name: node.name, ...node.location, selected: node.selected }] : []);
  function choose(row: Appearance, preserveRoot = false) {
    app.setSelection({ trackKey: preserveRoot ? key : row.track.track_key, cameraId: row.camera.camera_id, trackId: row.track.local_track_id, seconds: row.first, revision: Date.now() });
    if (!preserveRoot) { setOtherKey(''); setSaved(''); setEventTime(''); }
  }
  async function review(decision: keyof typeof decisionLabels) {
    if (!root || !app.jobId || app.replay) return;
    if (['same', 'different', 'uncertain'].includes(decision) && !other) { app.setError('Chọn track ở camera khác trước khi lưu đối chiếu.'); return; }
    setBusy(true); setSaved('');
    try {
      await app.mutate({ action: 'review', job_id: app.jobId, track_key: root.track.track_key, other_track_key: other?.track.track_key,
        decision, note, time_seconds: eventTime.trim() ? Number(eventTime) : root.first });
      await app.refreshJob(); setSaved('Đã lưu quyết định của người vận hành.'); setNote('');
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <ScreenTitle title="Hành trình & đối chiếu" description="Xem người ở đâu, lúc nào và bằng chứng nối các lần xuất hiện." action={result ? <button className="ct-button" onClick={() => downloadJson({ result, reviews: app.notes, selected_track: key, note: 'Camera links are evidence candidates; manual reviews are separately attributed.' }, 'campus-trace-evidence.json')}><Download size={16} />Xuất bằng chứng</button> : undefined} />
    {!result || !root ? <NoResult /> : <>
      <section className="ct-subject-bar"><TrackPortrait row={root} /><div><h2>{root.camera.camera_id} · L{root.track.local_track_id}</h2><p>{root.camera.name} · {seconds(root.first)}–{seconds(root.last)}</p><span>Áo {root.track.clothing_colors?.upper?.label ?? 'chưa rõ'} / quần-váy {root.track.clothing_colors?.lower?.label ?? 'chưa rõ'}</span></div>
        <label>Track gốc<select value={key} onChange={event => { const row = allRows.find(row => row.track.track_key === event.target.value); if (row) choose(row); }}>{allRows.map(row => <option key={row.track.track_key} value={row.track.track_key}>{row.camera.camera_id} · L{row.track.local_track_id}</option>)}</select></label>
        <div className="ct-subject-count"><strong>{evidence.rows.length}</strong><span>lần xuất hiện đang đối chiếu</span></div></section>
      <div className="ct-journey-workbench"><div className="ct-journey-layout"><section className="ct-panel ct-map-panel"><div className="ct-section-head"><h2>Khu II · Đại học Cần Thơ</h2><div className="ct-inline-actions"><button aria-pressed={mapMode === 'diagram'} onClick={() => setMapMode('diagram')}>Sơ đồ</button><button aria-pressed={mapMode === 'geo'} onClick={() => setMapMode('geo')}>Bản đồ</button></div></div>
        {mapMode === 'geo' ? <OperationalMap points={points} edges={edges} onSelect={id => { const row = evidence.rows.find(row => row.camera.camera_id === id) ?? allRows.find(row => row.camera.camera_id === id); if (row) choose(row, evidence.rows.some(item => item.track.track_key === row.track.track_key)); }} /> : <SiteDiagram nodes={nodes} edges={edges} onSelect={id => { const row = evidence.rows.find(row => row.camera.camera_id === id) ?? allRows.find(row => row.camera.camera_id === id); if (row) choose(row, evidence.rows.some(item => item.track.track_key === row.track.track_key)); }} />}
        <div className="ct-map-legend"><span><i className="candidate" />Liên kết AI ứng viên</span><span><i />Người vận hành xác nhận</span></div>
        <p className="ct-caption">{points.length ? `${points.length}/${nodes.length} camera có tọa độ. ` : 'Video này chưa có vị trí tại trường. '}Đường nối thể hiện liên kết camera, không phải lối đi thực tế.</p>
      </section><section className="ct-panel ct-timeline-panel"><div className="ct-section-head"><h2>Các lần xuất hiện</h2><Clock3 size={17} /></div>
        <p className="ct-caption">{evidence.synchronized ? 'Sắp theo mốc thời gian chung đã cung cấp.' : 'Chưa đồng bộ thời gian: không suy ra thứ tự vào/ra giữa camera.'}</p>
        <ol className="ct-evidence-timeline">{evidence.rows.map(row => <li key={row.track.track_key} className={focused?.track.track_key === row.track.track_key ? 'is-selected' : ''}><button onClick={() => choose(row, true)}><span className="ct-timeline-camera">{row.camera.name}<small>L{row.track.local_track_id}</small></span><time>{seconds(row.first)}–{seconds(row.last)}</time><span>{row.relationship === 'selected' ? 'Track gốc' : row.relationship === 'confirmed' ? 'Người vận hành xác nhận' : `AI gợi ý${row.similarity !== undefined ? ` · tương đồng ${(row.similarity * 100).toFixed(1)}%` : ''}`}</span>{row.camera.timeline_known ? <small>Mốc chung: {seconds(row.first + row.camera.timeline_start_seconds)}</small> : null}</button></li>)}</ol>
        {!result.links.length ? <p className="ct-caption">AI chưa trả liên kết liên camera. Bạn vẫn có thể chọn cặp để đối chiếu bằng video.</p> : null}
      </section></div>
      <div className="ct-evidence-layout"><section className="ct-panel"><div className="ct-section-head"><h2>Video bằng chứng</h2><span>{focused?.camera.name}</span></div>
        {focused ? <div className="ct-player"><FocusVideo key={`${app.job!.id}-${focused.camera.camera_id}`} camera={focused.camera} matches={focusedTracks} focus={viewerFocus} /></div> : null}
        <p className="ct-caption">{focused?.camera.raw_media_path ? 'Khung bao chỉ hiển thị cho track được chọn.' : 'Video kết quả cũ đã có khung bao; chưa hỗ trợ ẩn riêng các track khác.'}</p>
      </section><details className="ct-panel ct-review-panel"><summary>Đối chiếu & ghi chú</summary><div className="ct-review-content">
        <label>Track tại camera khác<select value={other?.track.track_key ?? ''} onChange={event => setOtherKey(event.target.value)}><option value="">Chọn track để so sánh</option>{options.map(row => <option key={row.track.track_key} value={row.track.track_key}>{row.camera.name} · L{row.track.local_track_id}</option>)}</select></label>
        {other ? <div className="ct-compare-pair"><div><TrackPortrait row={root} /><span>{root.camera.camera_id} / L{root.track.local_track_id}</span></div><ArrowRight size={16} /><div><TrackPortrait row={other} /><span>{other.camera.camera_id} / L{other.track.local_track_id}</span></div><button className="ct-text-link" onClick={() => choose(other, true)}>Mở video của track đối chiếu</button></div> : <p className="ct-muted">Chọn track từ camera khác. Màu áo giống nhau chưa đủ chứng minh cùng người.</p>}
        <label>Ghi chú bằng chứng<textarea value={note} maxLength={1000} rows={3} onChange={event => setNote(event.target.value)} placeholder="Chi tiết nhìn thấy, điểm khác biệt hoặc lý do chưa chắc chắn" /></label>
        <div className="ct-review-buttons"><button disabled={busy || !other || app.replay || !app.access} onClick={() => void review('same')}><Check size={15} />Cùng người</button><button disabled={busy || !other || app.replay || !app.access} onClick={() => void review('different')}><X size={15} />Khác người</button><button disabled={busy || !other || app.replay || !app.access} onClick={() => void review('uncertain')}><HelpCircle size={15} />Chưa rõ</button></div>
        <div className="ct-mark-event"><label>Đánh dấu thủ công<select value={eventKind} onChange={event => setEventKind(event.target.value as typeof eventKind)}><option value="presence">Có mặt tại camera</option><option value="entry">Đi vào khuôn viên</option><option value="exit">Đi ra khuôn viên</option></select></label>
          <label>Mốc trong video track gốc (giây)<input type="number" min="0" max={root.camera.duration_seconds} step="any" value={eventTime} placeholder={root.first.toFixed(2)} onChange={event => setEventTime(event.target.value)} /></label>
          <button className="ct-button" disabled={busy || app.replay || !app.access} onClick={() => void review(eventKind)}>Lưu đánh dấu track gốc</button></div>
        <p className="ct-caption">{app.replay ? 'Bản mẫu chỉ xem; mở phiên riêng của bạn để lưu đối chiếu.' : 'Xác nhận và đánh dấu do người vận hành cung cấp, không phải kết luận tự động của mô hình.'}</p>{saved ? <p role="status" className="ct-saved">{saved}</p> : null}
      </div></details></div></div>
      {app.notes.length ? <section className="ct-panel"><div className="ct-section-head"><h2>Nhật ký đối chiếu của phiên</h2><span>{app.notes.length} ghi nhận</span></div>
        {!app.notes.length ? <p className="ct-muted">Chưa có xác nhận hoặc đánh dấu thủ công.</p> : <ul className="ct-review-log">{app.notes.map(note => <li key={note.id}><div><strong>{decisionLabels[note.decision]}</strong><span>{note.track_key}{note.other_track_key ? ` ↔ ${note.other_track_key}` : ''}{note.time_seconds !== undefined ? ` · ${seconds(note.time_seconds)} trong video` : ''}</span><p>{note.note || 'Không có ghi chú bổ sung.'}</p></div><time>{new Date(note.created_at).toLocaleString('vi-VN')}</time></li>)}</ul>}
      </section> : null}
    </>}
  </>;
}

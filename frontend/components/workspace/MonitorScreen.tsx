"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Camera, Maximize2, Play, Plus, Search, Settings2, Video } from "lucide-react";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import type { DemoCamera } from "@/lib/public-demo";
import { appearances, cameraJourney, seconds, type Appearance } from "@/lib/evidence";
import { CameraVideo, type EvidenceCue } from './CameraVideo';
import { TrackPortrait } from './TrackPortrait';
import { EvaluationPanel } from './EvaluationPanel';
import { CampusExplorer } from './CampusExplorer';
import { searchPeople } from '@/lib/person-search';
import { useWorkspace } from "./WorkspaceProvider";
import { HlsStream } from './HlsStream';

type Feed = { id: string; name: string; src?: string; stream?: boolean; pendingRtsp?: boolean; poster?: string; location?: { lat: number; lng: number }; processed?: boolean; analysis?: DemoCamera };

export function MonitorScreen() {
  const app = useWorkspace();
  const [selectedId, setSelectedId] = useState('');
  const [showTrail, setShowTrail] = useState(true);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [showRecording, setShowRecording] = useState(false);
  const [clipState, setClipState] = useState<{ source: string; cues: Record<string, EvidenceCue> }>({ source: '', cues: {} });
  const tiles = useRef<Record<string, HTMLElement | null>>({});
  const configured = app.data?.cameras ?? [];
  const hasStreams = configured.some(camera => camera.connection?.stream_url);
  const result = !hasStreams || showRecording ? app.job?.result : undefined;
  const sourceId = result ? app.job?.id ?? '' : 'configured';
  const rows = useMemo(() => result ? appearances(result) : [], [result]);
  const candidates = useMemo(() => {
    if (!result || !activeQuery.trim()) return rows;
    const keys = new Set(searchPeople(result.tracks, activeQuery).map(item => item.track.track_key));
    return rows.filter(row => keys.has(row.track.track_key));
  }, [result, rows, activeQuery]);
  const reference = candidates.find(row => row.track.track_key === app.selection?.trackKey) ?? candidates[0];
  const personKey = reference?.track.track_key ?? '';
  const cues = clipState.source === sourceId ? clipState.cues : {};
  const journey = useMemo(() => result && personKey ? cameraJourney(result, app.notes, personKey) : null, [result, app.notes, personKey]);
  const ObservationList = journey?.synchronized ? 'ol' : 'ul';
  const index = app.data?.jobs.find(job => job.id === app.jobId);
  const sample = DEMO_SAMPLES[0];
  const feeds: Feed[] = result ? result.cameras.map(camera => {
    const config = index?.camera_snapshots?.[camera.camera_id];
    return { id: camera.camera_id, name: config?.name ?? camera.name, src: camera.raw_media_path ?? camera.media_path,
      location: camera.location ?? config?.location, processed: !camera.raw_media_path, analysis: camera };
  }) : configured.length ? configured.map(camera => ({ id: camera.id, name: camera.name, location: camera.location, src: camera.connection?.stream_url, stream: !!camera.connection?.stream_url, pendingRtsp: camera.source === 'rtsp' }))
    : sample.cameras.map((camera, i) => ({ id: `sample-${i}`, name: `Camera ${i + 1}`, src: `/demo/samples/${camera.file}`, poster: `/demo/samples/${camera.file.replace(/\.mp4$/, '.jpg')}` }));
  const sampleMode = !!(result && app.replay) || (!result && !configured.length);
  function selectPerson(row: Appearance) {
    if (clipState.source === sourceId) for (const id of Object.keys(clipState.cues)) { const player = tiles.current[id]?.querySelector('video'); if (player) { player.currentTime = 0; void player.play().catch(() => {}); } }
    setClipState({ source: sourceId, cues: {} });
    app.setSelection({ trackKey: row.track.track_key, cameraId: row.camera.camera_id, seconds: row.first, revision: (app.selection?.revision ?? 0) + 1 });
  }
  function search(event: React.FormEvent) {
    event.preventDefault(); setActiveQuery(query.trim()); setClipState({ source: sourceId, cues: {} });
    if (result) { const found = new Set(searchPeople(result.tracks, query.trim()).map(item => item.track.track_key)); const first = rows.find(row => !query.trim() || found.has(row.track.track_key)); if (first) selectPerson(first); }
  }
  function openEvidence(row: Appearance) {
    const duration = row.camera.duration_seconds;
    const start = Math.max(0, Math.min(row.first, Math.max(0, duration - .01)));
    const revision = (app.selection?.revision ?? 0) + 1;
    setSelectedId(row.camera.camera_id);
    setClipState(previous => ({ source: sourceId, cues: { ...(previous.source === sourceId ? previous.cues : {}), [row.camera.camera_id]: { seconds: start, until: Math.min(duration, Math.max(start + .25, row.last + 1 / Math.max(1, row.camera.fps))), revision } } }));
    app.setSelection({ trackKey: personKey, cameraId: row.camera.camera_id, trackId: row.track.local_track_id, seconds: start, revision });
    tiles.current[row.camera.camera_id]?.scrollIntoView({ block: 'nearest' });
  }
  function clearClip(id: string) {
    setClipState(previous => ({ source: sourceId, cues: Object.fromEntries(Object.entries(previous.cues).filter(([key]) => key !== id)) }));
    const player = tiles.current[id]?.querySelector('video'); if (player) { player.currentTime = 0; void player.play().catch(() => {}); }
  }
  return <>
    <div className="ct-monitor-heading"><div><p className="ct-location-line">Đại học Cần Thơ <span>/</span> Khu II</p><h1>Giám sát khuôn viên</h1></div><Link className="ct-advanced-search" href="/workspace/people">Bộ lọc theo camera & màu áo</Link></div>
    <section className="ct-case-search" aria-label="Tìm người và chọn ảnh tham chiếu">
      <form onSubmit={search}><label htmlFor="case-query"><Search size={17} /><span className="ct-sr-only">Đặc điểm người cần tìm</span><input id="case-query" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} placeholder="Tìm người: ví dụ áo đen, quần xanh dương" /></label><button className="ct-button ct-primary" disabled={!result} type="submit">Tìm trong video</button>{activeQuery ? <button type="button" onClick={() => { setQuery(''); setActiveQuery(''); }}>Xóa lọc</button> : null}</form>
      {!result ? <p className="ct-search-hint">Cần kết quả đã phân tích để tìm người. <button onClick={() => void app.showReplay().then(() => setShowRecording(true)).catch(failure => app.setError(failure.message))}>Mở dữ liệu mẫu đã xử lý</button></p> : activeQuery ? <div className="ct-case-matches"><div className="ct-match-caption"><span>{candidates.length} đoạn theo dõi khớp “{activeQuery}”</span><small>Chọn ảnh để đối chiếu; cùng màu áo chưa có nghĩa là cùng người.</small></div>
        {candidates.length ? <div className="ct-case-candidates">{candidates.slice(0, 6).map(row => <button key={row.track.track_key} className="ct-candidate" aria-pressed={row.track.track_key === personKey} onClick={() => selectPerson(row)}><TrackPortrait row={row} /><span><strong>{row.camera.name} · L{row.track.local_track_id}</strong><small>{seconds(row.first)}–{seconds(row.last)}</small><span>Áo {row.track.clothing_colors?.upper?.label ?? 'chưa rõ'}</span></span></button>)}</div> : <p className="ct-no-match" role="status">Không có người khớp trong phiên này. Hãy đổi đặc điểm hoặc bỏ bớt điều kiện.</p>}{candidates.length > 6 ? <Link href="/workspace/people">Mở bộ lọc để xem tất cả kết quả</Link> : null}</div> : null}
    </section>
    <div className={`ct-monitor-layout${result ? ' ct-evidence-mode' : ''}`}>
      <section className="ct-monitor-feeds" aria-label="Xem camera">
        <div className="ct-wall-head"><h2><Camera size={16} />Camera & bằng chứng</h2><span>{feeds.length} nguồn video</span><span className="ct-wall-source">{sampleMode ? app.replay ? 'Mẫu MARS' : 'Mẫu i.c.sens' : result ? 'Phiên đã lưu' : 'Camera đã cấu hình'}</span>{hasStreams && app.job?.result ? <button onClick={() => setShowRecording(!showRecording)}>{showRecording ? 'Xem camera kết nối' : 'Xem kết quả đã lưu'}</button> : null}</div>
        <div className="ct-camera-wall">{feeds.map(camera => {
          const observation = journey?.rows.find(row => row.camera.camera_id === camera.id);
          return <article key={camera.id} ref={element => { tiles.current[camera.id] = element; }} tabIndex={-1} className={`ct-camera-tile${selectedId === camera.id ? ' is-selected' : ''}`} aria-label={camera.name}>
            <div className="ct-feed-heading"><h3>{camera.name}</h3><span>{observation?.relationship === 'candidate' ? 'AI gợi ý' : camera.stream ? 'HLS' : camera.pendingRtsp ? 'RTSP · cần gateway' : camera.src ? camera.processed ? 'Đã xử lý' : 'Ghi sẵn' : 'Chưa có video'}</span>{camera.src ? <button aria-label={`Phóng to ${camera.name}`} title={`Phóng to ${camera.name}`} onClick={event => { void event.currentTarget.closest('article')?.requestFullscreen().catch(() => app.setError('Không mở được toàn màn hình. Dùng nút toàn màn hình trong video để thử lại.')); }}><Maximize2 size={15} /></button> : null}</div>
            {camera.src ? camera.stream ? <HlsStream key={camera.src} src={camera.src} name={camera.name} /> : <CameraVideo key={camera.src} src={camera.src} poster={camera.poster} name={camera.name} analysis={camera.analysis} trackIds={journey?.rows.filter(row => row.camera.camera_id === camera.id).map(row => row.track.local_track_id) ?? []} showTrail={showTrail} cue={cues[camera.id]} /> : <div className="ct-monitor-empty"><Video size={24} /><p>{camera.pendingRtsp ? 'Chờ gateway cung cấp luồng HLS' : 'Chưa có video'}</p><Link className="ct-button" href={camera.pendingRtsp ? '/workspace/cameras' : '/workspace/videos'}>{camera.pendingRtsp ? 'Cấu hình kết nối' : 'Thêm video'}</Link></div>}
            {observation ? <div className="ct-feed-evidence"><button onClick={() => openEvidence(observation)}><Play size={13} />{seconds(observation.first)}–{seconds(observation.last)} · Xem đoạn</button>{cues[camera.id] ? <button onClick={() => clearClip(camera.id)}>Toàn bộ</button> : null}</div> : null}
          </article>;
        })}{feeds.length % 2 === 1 ? reference ? <section className="ct-wall-reference" aria-label="Ảnh người đang đối chiếu"><div className="ct-reference-label">Người tham chiếu · L{reference.track.local_track_id}</div><div className="ct-reference-body"><TrackPortrait row={reference} /><div><h2>{reference.camera.name}</h2><p>Áo {reference.track.clothing_colors?.upper?.label ?? 'chưa rõ'}</p><p>Quần/váy {reference.track.clothing_colors?.lower?.label ?? 'chưa rõ'}</p><small>{journey?.rows.some(row => row.relationship === 'candidate') ? 'Có gợi ý liên camera, cần đối chiếu' : journey?.rows.some(row => row.relationship === 'confirmed') ? 'Có liên kết do người vận hành xác nhận' : 'Chưa xác nhận danh tính liên camera'}</small></div></div><button onClick={() => openEvidence(reference)}><Play size={14} />Xem bằng chứng gốc</button></section> : <Link className="ct-add-source" href="/workspace/videos"><Plus size={22} strokeWidth={1.4} /><strong>Thêm nguồn video</strong><span>Tải video hoặc cấu hình camera</span></Link> : null}</div>
        <div className="ct-wall-footer"><span>{sampleMode ? 'Video mẫu · chưa kết nối camera tại trường' : result ? 'Phát lại video của phiên đã lưu' : hasStreams ? 'Xem nguồn HLS · AI chỉ phân tích các clip đã gửi' : 'Nguồn camera đã cấu hình'}</span><Link href="/workspace/history">Đổi phiên video</Link></div>
        {!result && !configured.length ? <details className="ct-source-credit"><summary>Nguồn & giấy phép video</summary><p>{sample.attribution ?? sample.source_name} <a href={sample.source_url} target="_blank" rel="noreferrer">Nguồn dữ liệu</a> · <a href={sample.license_url ?? sample.source_url} target="_blank" rel="noreferrer">{sample.license}</a></p><p>{sample.changes}</p></details> : null}
        {!result && app.job && app.job.status !== 'completed' ? <p className="ct-caption" role="status">{app.job.stage}</p> : null}
      </section>
      <aside className="ct-monitor-rail" aria-label="Người tham chiếu, bản đồ và hành trình">
        {reference && feeds.length % 2 === 0 ? <section className="ct-reference-person" aria-label="Ảnh người đang đối chiếu"><TrackPortrait row={reference} /><div><span>Người tham chiếu · L{reference.track.local_track_id}</span><h2>{reference.camera.name}</h2><p>Áo {reference.track.clothing_colors?.upper?.label ?? 'chưa rõ'} · quần/váy {reference.track.clothing_colors?.lower?.label ?? 'chưa rõ'}</p><small>Chọn lần xuất hiện để mở bằng chứng.</small></div></section> : null}
        <section className="ct-monitor-map"><div className="ct-section-head"><h2>Khu II · Cần Thơ</h2><Link href="/workspace/cameras" aria-label="Thiết lập camera" title="Đặt vị trí camera"><Settings2 size={16} /></Link></div>
          <CampusExplorer key={sourceId || 'raw-samples'} cameras={feeds.map(camera => ({ ...camera, observation: journey?.rows.find(row => row.camera.camera_id === camera.id) }))} edges={journey?.edges ?? []} selectedId={selectedId} onOpenGrid={id => { const row = journey?.rows.find(row => row.camera.camera_id === id); if (row) openEvidence(row); else { setSelectedId(id); tiles.current[id]?.scrollIntoView({ block: 'nearest' }); tiles.current[id]?.focus({ preventScroll: true }); } }} />
          <p className="ct-map-note">{feeds.some(camera => camera.location) ? 'Chọn camera trên bản đồ để xem video.' : configured.length && !result ? 'Nguồn camera chưa gắn tọa độ.' : 'Video mẫu chưa gắn vị trí tại trường.'} <Link href="/workspace/cameras">Thiết lập</Link></p>
        </section>
        <section className="ct-monitor-route"><div className="ct-section-head"><h2>Lần xuất hiện & đối chiếu</h2>{result ? <Link href="/workspace/journey">Ghi nhận xác nhận</Link> : null}</div>
          {result && journey ? <>
            <div className="ct-route-toolbar">{!activeQuery ? <label>Người đang theo dõi<select value={personKey} onChange={event => { const row = candidates.find(row => row.track.track_key === event.target.value); if (row) selectPerson(row); }}>{candidates.map(row => <option key={row.track.track_key} value={row.track.track_key}>{row.camera.name} · L{row.track.local_track_id}</option>)}</select></label> : null}<label className="ct-checkbox"><input type="checkbox" checked={showTrail} onChange={event => setShowTrail(event.target.checked)} />Hiện vệt di chuyển</label></div>
            <ObservationList className="ct-observation-list">{journey.rows.map(row => <li key={row.track.track_key} data-relationship={row.relationship}><button className="ct-evidence-jump" onClick={() => openEvidence(row)} aria-label={`Xem bằng chứng ${row.camera.name} L${row.track.local_track_id}`}><TrackPortrait row={row} /><span><strong>{row.camera.name}</strong><span className="ct-observation-time">{seconds(row.first)}–{seconds(row.last)}</span><small>{row.relationship === 'candidate' ? 'AI gợi ý · chưa xác nhận' : row.relationship === 'confirmed' ? 'Đã xác nhận' : 'Người tham chiếu'}</small></span><Play size={14} /></button></li>)}</ObservationList>
            {!journey.synchronized ? <p className="ct-route-note">Chưa đồng bộ giờ giữa các camera; chưa suy ra thứ tự đi qua.</p> : null}
            {journey.edges.some(edge => !feeds.find(feed => feed.id === edge.from)?.location || !feeds.find(feed => feed.id === edge.to)?.location) ? <details open className="ct-route-diagram"><summary>Liên kết camera · chưa có tọa độ</summary>{journey.edges.map((edge, i) => <div className="ct-link-row" key={i}><span>{feeds.find(feed => feed.id === edge.from)?.name}</span><svg width="40" height="16" aria-hidden="true"><line x1="1" y1="8" x2="39" y2="8" stroke={edge.confirmed ? '#1d5fbf' : '#777'} strokeWidth="2" strokeDasharray={edge.confirmed ? undefined : '4 4'} /></svg><span>{feeds.find(feed => feed.id === edge.to)?.name}</span></div>)}</details> : null}
            <details className="ct-route-explainer"><summary>Cách đọc bằng chứng</summary><p>Nét đứt: AI gợi ý. Nét liền: đã xác nhận. Mũi tên chỉ hiện khi đã xác nhận và đồng bộ giờ. Đường nối camera không phải lối đi thực tế. Ảnh và thời gian được trích từ phát hiện thực trong video.</p></details>
          </> : <div className="ct-route-empty"><p>{result ? 'Không có người khớp bộ lọc.' : 'Chưa có người được theo dõi.'}</p><span>{result ? 'Xóa lọc hoặc chọn đặc điểm khác.' : 'Phân tích video để xem vệt di chuyển và liên kết camera.'}</span>{!result ? <button className="ct-button" onClick={() => void app.showReplay().then(() => setShowRecording(true)).catch(failure => app.setError(failure.message))}>Xem hành trình mẫu</button> : null}</div>}
        </section>
      </aside>
    </div>
    {result ? <EvaluationPanel key={sourceId} result={result} sourceId={sourceId} /> : null}
  </>;
}

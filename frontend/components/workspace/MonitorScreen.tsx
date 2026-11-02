"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Camera, Maximize2, Play, Plus, Search, Settings2, Video, X } from "lucide-react";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import type { DemoCamera } from "@/lib/public-demo";
import { appearances, cameraJourney, seconds, type Appearance } from "@/lib/evidence";
import { CameraVideo, type EvidenceCue } from './CameraVideo';
import { TrackPortrait } from './TrackPortrait';
import { EvaluationPanel } from './EvaluationPanel';
import { CampusExplorer } from './CampusExplorer';
import { AnalyticsScreen } from './AnalyticsScreen';
import { PeopleScreen } from './PeopleScreen';
import { Modal } from './Modal';
import { useWorkspace } from "./WorkspaceProvider";
import { HlsStream } from './HlsStream';
import { RealtimeCamera } from './RealtimeCamera';
import type { RealtimeConnection } from '@/lib/realtime';

type Feed = { zone?: string; id: string; name: string; src?: string; stream?: boolean; realtime?: RealtimeConnection; pendingRtsp?: boolean; poster?: string; location?: { lat: number; lng: number }; processed?: boolean; analysis?: DemoCamera };

export function MonitorScreen() {
  const app = useWorkspace();
  const [feedQuery,setFeedQuery]=useState(''),[feedType,setFeedType]=useState('all'),[feedZone,setFeedZone]=useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showTrail, setShowTrail] = useState(true);
  const { searchOpen, setSearchOpen } = app;
  const [showRecording, setShowRecording] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [clipState, setClipState] = useState<{ source: string; cues: Record<string, EvidenceCue> }>({ source: '', cues: {} });
  const tiles = useRef<Record<string, HTMLElement | null>>({});
  const configured = app.data?.cameras ?? [];
  const hasStreams = configured.some(camera => camera.connection?.stream_url || camera.connection?.realtime_url);
  const result = !showSamples && (!hasStreams || showRecording) ? app.job?.result : undefined;
  const sourceId = showSamples ? 'pdestre-campus-preview' : result ? app.job?.id ?? '' : 'configured';
  const rows = useMemo(() => result ? appearances(result) : [], [result]);
  const candidates = rows;
  const reference = candidates.find(row => row.track.track_key === app.selection?.trackKey) ?? candidates[0];
  const personKey = reference?.track.track_key ?? '';
  const cues = clipState.source === sourceId ? clipState.cues : {};
  const journey = useMemo(() => result && personKey ? cameraJourney(result, app.notes, personKey) : null, [result, app.notes, personKey]);
  const ObservationList = journey?.synchronized ? 'ol' : 'ul';
  const index = app.data?.jobs.find(job => job.id === app.jobId);
  const sample = DEMO_SAMPLES[0];
  const allFeeds: Feed[] = result ? result.cameras.map(camera => {
    const config = index?.camera_snapshots?.[camera.camera_id];
    return { id: camera.camera_id, name: config?.name ?? camera.name, zone: config?.zone, src: camera.raw_media_path ?? camera.media_path,
      location: camera.location ?? config?.location, processed: !camera.raw_media_path, analysis: camera };
  }) : !showSamples && configured.length ? configured.map(camera => ({ id: camera.id, name: camera.name, zone: camera.zone, location: camera.location, src: camera.connection?.stream_url, stream: !!camera.connection?.stream_url, pendingRtsp: camera.source === 'rtsp', realtime: camera.connection?.realtime_url ? { url: camera.connection.realtime_url, token: camera.connection.realtime_token! } : undefined }))
    : sample.cameras.map((camera, i) => ({ id: `sample-${i}`, name: camera.name, src: `/demo/samples/${camera.file}`, poster: `/demo/samples/${camera.file.replace(/\.mp4$/, '.jpg')}` }));
  const feedZones=[...new Set(allFeeds.map(feed=>feed.zone).filter((value):value is string=>!!value))];
  const feeds=allFeeds.filter(feed=>(!feedZone||feed.zone===feedZone)&&feed.name.toLocaleLowerCase('vi').includes(feedQuery.toLocaleLowerCase('vi'))&&(feedType==='all'||feedType==='live'&&!!(feed.stream||feed.realtime)||feedType==='recorded'&&!feed.stream&&!feed.realtime));
  const sampleMode = showSamples || !!(result && app.replay) || (!result && !configured.length);
  function selectPerson(row: Appearance) {
    if (clipState.source === sourceId) for (const id of Object.keys(clipState.cues)) { const player = tiles.current[id]?.querySelector('video'); if (player) { player.currentTime = 0; void player.play().catch(() => {}); } }
    setClipState({ source: sourceId, cues: {} });
    app.setSelection({ trackKey: row.track.track_key, cameraId: row.camera.camera_id, seconds: row.first, revision: (app.selection?.revision ?? 0) + 1 });
  }
  function openEvidence(row: Appearance) {
    const duration = row.camera.duration_seconds;
    const start = Math.max(0, Math.min(row.first, Math.max(0, duration - .01)));
    const revision = (app.selection?.revision ?? 0) + 1;
    setSelectedId(row.camera.camera_id);
    setClipState(previous => ({ source: sourceId, cues: { ...(previous.source === sourceId ? previous.cues : {}), [row.camera.camera_id]: { seconds: start, until: Math.min(duration, Math.max(start + .25, row.last + 1 / Math.max(1, row.camera.fps))), revision } } }));
    app.setSelection({ trackKey: row.track.track_key, cameraId: row.camera.camera_id, trackId: row.track.local_track_id, seconds: start, revision });
    tiles.current[row.camera.camera_id]?.scrollIntoView({ block: 'nearest' });
  }
  function clearClip(id: string) {
    setClipState(previous => ({ source: sourceId, cues: Object.fromEntries(Object.entries(previous.cues).filter(([key]) => key !== id)) }));
    const player = tiles.current[id]?.querySelector('video'); if (player) { player.currentTime = 0; void player.play().catch(() => {}); }
  }
  return <>
    <div className="ct-monitor-heading"><div><p className="ct-location-line">Đại học Cần Thơ <span>/</span> Khu II</p><h1>Giám sát khuôn viên</h1></div><div className="ct-monitor-actions"><Link href="/workspace/history">Lịch sử</Link><button className="ct-button ct-primary" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><Search size={17} />Tìm người</button></div></div>
    <section className="ct-glass-overview" aria-label="Tổng quan giám sát">
      <div className="ct-glass-stat ct-glass-stat-featured"><span>Nguồn video đang xem</span><strong>{feeds.length.toString().padStart(2, '0')}</strong><small>{sampleMode ? 'Dữ liệu minh họa' : result ? 'Phiên phân tích đã lưu' : 'Nguồn đã cấu hình'}</small></div>
      <div className="ct-glass-stat"><span>Nguồn trực tiếp đã cấu hình</span><strong>{configured.filter(camera => camera.connection?.stream_url || camera.connection?.realtime_url).length.toString().padStart(2, '0')}</strong><small>Số nguồn cấu hình, chưa xác nhận kết nối</small></div>
      <div className="ct-glass-stat"><span>Đoạn theo dõi trong phiên</span><strong>{result ? rows.length.toString().padStart(2, '0') : '—'}</strong><small>{result ? 'Không đại diện số người riêng biệt' : 'Chưa có kết quả phân tích'}</small></div>
      <div className="ct-glass-stat ct-glass-stat-status"><span>Máy chủ phân tích</span><strong><i data-online={app.online === true} />{app.online === null ? 'Đang kiểm tra' : app.online ? 'Sẵn sàng' : 'Chưa kết nối'}</strong><small>{app.online ? 'Có thể gửi yêu cầu phân tích' : 'Vẫn xem được video và kết quả đã lưu'}</small></div>
    </section>
    {searchOpen ? <Modal titleId="person-search-title" className="ct-search-drawer" onClose={() => setSearchOpen(false)}><div className="ct-drawer-head"><div><p>Tra cứu đối tượng</p><h2 id="person-search-title">Tìm người</h2></div><button aria-label="Đóng tìm người" onClick={() => setSearchOpen(false)}><X size={20} /></button></div><p className="ct-drawer-intro">Nhập đặc điểm trang phục hoặc chọn bộ lọc. Chọn kết quả để xem đoạn video tương ứng.</p><PeopleScreen embedded resultOverride={result ?? null} onLoadSample={async () => { await app.showReplay(); setShowRecording(true); setShowSamples(false); }} onInspect={row => { openEvidence(row); setSearchOpen(false); requestAnimationFrame(() => tiles.current[row.camera.camera_id]?.focus({ preventScroll: true })); }} /></Modal> : null}
    <div className={`ct-monitor-layout${result ? ' ct-evidence-mode' : ''}`}>
      <section className="ct-monitor-feeds" aria-label="Xem camera">
        <div className="ct-wall-head"><h2><Camera size={16} />Camera và bằng chứng</h2><span>{feeds.length} nguồn video</span><button type="button" onClick={() => { setShowSamples(!showSamples); }}>{showSamples ? 'Quay lại phiên hiện tại' : 'Video mẫu P-DESTRE'}</button><span className="ct-wall-source">{sampleMode ? result && app.replay ? 'Mẫu MARS' : sample.short_label ?? sample.title : result ? 'Phiên đã lưu' : 'Camera đã cấu hình'}</span>{hasStreams && app.job?.result ? <button onClick={() => { setShowRecording(!showRecording); setShowSamples(false); }}>{showRecording ? 'Xem camera kết nối' : 'Xem kết quả đã lưu'}</button> : null}</div>
        <div className="ct-feed-filters"><label>Tìm camera<input type="search" value={feedQuery} maxLength={100} onChange={e=>setFeedQuery(e.target.value)} placeholder="Tên camera"/></label><label>Nguồn<select value={feedType} onChange={e=>setFeedType(e.target.value)}><option value="all">Tất cả nguồn</option><option value="live">Luồng trực tiếp</option><option value="recorded">Video / nguồn chưa kết nối</option></select></label>{feedZones.length?<label>Khu vực<select value={feedZone} onChange={e=>setFeedZone(e.target.value)}><option value="">Tất cả khu vực</option>{feedZones.map(zone=><option key={zone}>{zone}</option>)}</select></label>:null}</div>
        {!feeds.length?<div className="ct-ops-empty"><p>Không có nguồn phù hợp với bộ lọc.</p><button onClick={()=>{setFeedQuery('');setFeedType('all');setFeedZone('');}}>Hiển thị tất cả camera</button></div>:null}
        <div className="ct-camera-wall">{feeds.map(camera => {
          const observation = journey?.rows.find(row => row.camera.camera_id === camera.id);
          return <article key={camera.id} ref={element => { tiles.current[camera.id] = element; }} tabIndex={-1} className={`ct-camera-tile${selectedId === camera.id ? ' is-selected' : ''}`} aria-label={camera.name}>
            <div className="ct-feed-heading"><h3>{camera.name}</h3><span>{observation?.relationship === 'candidate' ? 'Đề xuất từ AI' : camera.realtime ? 'AI tự động' : camera.stream ? 'HLS · chỉ phát video' : camera.pendingRtsp ? 'RTSP · chờ bộ kết nối' : camera.src ? camera.processed ? 'Đã xử lý' : 'Ghi sẵn' : 'Chưa có video'}</span>{camera.src || camera.realtime ? <button aria-label={`Phóng to ${camera.name}`} title={`Phóng to ${camera.name}`} onClick={event => { void event.currentTarget.closest('article')?.requestFullscreen().catch(() => app.setError('Không mở được toàn màn hình. Dùng nút toàn màn hình trong video để thử lại.')); }}><Maximize2 size={15} /></button> : null}</div>
            {camera.realtime ? <RealtimeCamera key={camera.realtime.url} connection={camera.realtime} name={camera.name} /> : camera.src ? camera.stream ? <HlsStream key={camera.src} src={camera.src} name={camera.name} /> : <CameraVideo key={camera.src} src={camera.src} poster={camera.poster} name={camera.name} analysis={camera.analysis} trackIds={journey?.rows.filter(row => row.camera.camera_id === camera.id).map(row => row.track.local_track_id) ?? []} showTrail={showTrail} cue={cues[camera.id]} /> : <div className="ct-monitor-empty"><Video size={24} /><p>{camera.pendingRtsp ? 'Đang chờ luồng HLS từ bộ kết nối camera' : 'Chưa có video'}</p><Link className="ct-button" href={camera.pendingRtsp ? '/workspace/cameras' : '/workspace/videos'}>{camera.pendingRtsp ? 'Cấu hình kết nối' : 'Thêm video'}</Link></div>}
            {observation ? <div className="ct-feed-evidence"><button onClick={() => openEvidence(observation)}><Play size={13} />{seconds(observation.first)}–{seconds(observation.last)} · Xem đoạn</button>{cues[camera.id] ? <button onClick={() => clearClip(camera.id)}>Xem toàn bộ</button> : null}</div> : null}
          </article>;
        })}{feeds.length % 2 === 1 ? reference ? <section className="ct-wall-reference" aria-label="Ảnh người đang đối chiếu"><div className="ct-reference-label">Người tham chiếu · L{reference.track.local_track_id}</div><div className="ct-reference-body"><TrackPortrait row={reference} /><div><h2>{reference.camera.name}</h2><p>Áo {reference.track.clothing_colors?.upper?.label ?? 'chưa rõ'}</p><p>Quần/váy {reference.track.clothing_colors?.lower?.label ?? 'chưa rõ'}</p><small>{journey?.rows.some(row => row.relationship === 'candidate') ? 'Có đề xuất liên kết giữa các camera. Cần kiểm tra bằng chứng.' : journey?.rows.some(row => row.relationship === 'confirmed') ? 'Có liên kết do người vận hành xác nhận' : 'Chưa xác nhận cùng một người giữa các camera'}</small></div></div><button onClick={() => openEvidence(reference)}><Play size={14} />Xem bằng chứng gốc</button></section> : <Link className="ct-add-source" href="/workspace/videos"><Plus size={22} strokeWidth={1.4} /><strong>Thêm nguồn video</strong><span>Tải video hoặc cấu hình camera</span></Link> : null}</div>
        <div className="ct-wall-footer"><span>{sampleMode ? !result && sample.synchronized === false ? 'P-DESTRE · góc quay UAV · 3 phiên ghi hình độc lập, chưa đồng bộ' : 'Video mẫu · chưa kết nối camera tại trường' : result ? 'Phát lại video của phiên đã lưu' : configured.some(camera => camera.connection?.realtime_url) ? 'Phân tích tự động qua bộ kết nối · độ trễ hiển thị tại từng camera' : hasStreams ? 'Luồng HLS chỉ phát video · cần kết nối máy chủ AI để phân tích' : 'Nguồn camera đã cấu hình'}</span><Link href="/workspace/history">Đổi phiên video</Link></div>
        {!result && (showSamples || !configured.length) ? <details className="ct-source-credit"><summary>Nguồn video và giấy phép sử dụng</summary><p>{sample.attribution ?? sample.source_name} <a href={sample.source_url} target="_blank" rel="noreferrer">Nguồn dữ liệu</a> · <a href={sample.license_url ?? sample.source_url} target="_blank" rel="noreferrer">{sample.license}</a></p><p>{sample.changes}</p></details> : null}
        {!result && app.job && app.job.status !== 'completed' ? <p className="ct-caption" role="status">{app.job.stage}</p> : null}
      </section>
      <aside className="ct-monitor-rail" aria-label="Người tham chiếu, bản đồ và hành trình">
        {reference && feeds.length % 2 === 0 ? <section className="ct-reference-person" aria-label="Ảnh người đang đối chiếu"><TrackPortrait row={reference} /><div><span>Người tham chiếu · L{reference.track.local_track_id}</span><h2>{reference.camera.name}</h2><p>Áo {reference.track.clothing_colors?.upper?.label ?? 'chưa rõ'} · quần/váy {reference.track.clothing_colors?.lower?.label ?? 'chưa rõ'}</p><small>Chọn một lần xuất hiện để xem đoạn video tương ứng.</small></div></section> : null}
        <section className="ct-monitor-map"><div className="ct-section-head"><h2>Khu II · Cần Thơ</h2><Link href="/workspace/cameras" aria-label="Thiết lập camera" title="Đặt vị trí camera"><Settings2 size={16} /></Link></div>
          <CampusExplorer key={sourceId || 'raw-samples'} cameras={feeds.map(camera => ({ ...camera, observation: journey?.rows.find(row => row.camera.camera_id === camera.id) }))} edges={journey?.edges ?? []} selectedId={selectedId} onOpenGrid={id => { const row = journey?.rows.find(row => row.camera.camera_id === id); if (row) openEvidence(row); else { setSelectedId(id); tiles.current[id]?.scrollIntoView({ block: 'nearest' }); tiles.current[id]?.focus({ preventScroll: true }); } }} />
          <p className="ct-map-note">{feeds.some(camera => camera.location) ? 'Chọn camera trên bản đồ để xem video.' : configured.length && !result ? 'Nguồn camera chưa gắn tọa độ.' : 'Video mẫu chưa gắn vị trí tại trường.'} <Link href="/workspace/cameras">Thiết lập</Link></p>
        </section>
        <section className="ct-monitor-route"><div className="ct-section-head"><h2>Lần xuất hiện và đối chiếu</h2>{result ? <Link href="/workspace/journey">Đối chiếu và xác nhận</Link> : null}</div>
          {result && journey ? <>
            <div className="ct-route-toolbar">{<label>Đối tượng đang đối chiếu<select value={personKey} onChange={event => { const row = candidates.find(row => row.track.track_key === event.target.value); if (row) selectPerson(row); }}>{candidates.map(row => <option key={row.track.track_key} value={row.track.track_key}>{row.camera.name} · L{row.track.local_track_id}</option>)}</select></label>}<label className="ct-checkbox"><input type="checkbox" checked={showTrail} onChange={event => setShowTrail(event.target.checked)} />Hiển thị vệt di chuyển</label></div>
            <ObservationList className="ct-observation-list">{journey.rows.map(row => <li key={row.track.track_key} data-relationship={row.relationship}><button className="ct-evidence-jump" onClick={() => openEvidence(row)} aria-label={`Xem bằng chứng ${row.camera.name} L${row.track.local_track_id}`}><TrackPortrait row={row} /><span><strong>{row.camera.name}</strong><span className="ct-observation-time">{seconds(row.first)}–{seconds(row.last)}</span><small>{row.relationship === 'candidate' ? 'Đề xuất từ AI · chờ xác nhận' : row.relationship === 'confirmed' ? 'Đã xác nhận' : 'Người tham chiếu'}</small></span><Play size={14} /></button></li>)}</ObservationList>
            {!journey.synchronized ? <p className="ct-route-note">Chưa đồng bộ thời gian giữa các camera. Chưa thể xác định thứ tự xuất hiện.</p> : null}
            {journey.edges.some(edge => !feeds.find(feed => feed.id === edge.from)?.location || !feeds.find(feed => feed.id === edge.to)?.location) ? <details open className="ct-route-diagram"><summary>Liên kết giữa các camera · chưa xác định vị trí</summary>{journey.edges.map((edge, i) => <div className="ct-link-row" key={i}><span>{feeds.find(feed => feed.id === edge.from)?.name}</span><svg width="40" height="16" aria-hidden="true"><line x1="1" y1="8" x2="39" y2="8" stroke={edge.confirmed ? '#1d5fbf' : '#777'} strokeWidth="2" strokeDasharray={edge.confirmed ? undefined : '4 4'} /></svg><span>{feeds.find(feed => feed.id === edge.to)?.name}</span></div>)}</details> : null}
            <details className="ct-route-explainer"><summary>Cách đọc bằng chứng</summary><p>Nét đứt: Đề xuất từ AI. Nét liền: đã xác nhận. Mũi tên chỉ hiện khi đã xác nhận và đồng bộ giờ. Đường nối camera không phải lối đi thực tế. Ảnh và thời gian được trích từ phát hiện thực trong video.</p></details>
          </> : <div className="ct-route-empty"><p>{result ? 'Chưa chọn người để đối chiếu.' : 'Chưa có dữ liệu theo dõi.'}</p><span>{result ? 'Mở Tìm người và chọn một kết quả.' : 'Phân tích video để xem vệt di chuyển và liên kết camera.'}</span>{!result ? <button className="ct-button" onClick={() => void app.showReplay().then(() => { setShowRecording(true); setShowSamples(false); }).catch(failure => app.setError(failure.message))}>Xem hành trình mẫu</button> : null}</div>}
        </section>
      </aside>
    </div>
    <AnalyticsScreen compact />
    {result ? <EvaluationPanel key={sourceId} result={result} sourceId={sourceId} /> : null}
  </>;
}

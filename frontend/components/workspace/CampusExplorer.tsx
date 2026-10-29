"use client";
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Camera, Expand, Link2, MapPin, Play, RotateCcw, X } from 'lucide-react';
import { buildMapScene, validMapLocation, type MapCamera, type MapEdge, type MapLocation } from '@/lib/map-scene';
import { seconds } from '@/lib/evidence';
import { Modal } from './Modal';
import { TrackPortrait } from './TrackPortrait';
import { CameraVideo } from './CameraVideo';

const OperationalMap = dynamic(() => import('./OperationalMap'), { ssr: false, loading: () => <p>Đang mở bản đồ…</p> });
function Thumbnail({ camera }: { camera: MapCamera }) {
  if (camera.observation) return <TrackPortrait row={camera.observation} />;
  if (camera.poster) return <Image src={camera.poster} alt={`Ảnh từ ${camera.name}`} width={96} height={64} unoptimized />;
  return <Camera size={22} strokeWidth={1.5} />;
}
function CameraGraph({ cameras, edges, selectedId, selectedEdge, onCamera, onEdge }: {
  cameras: MapCamera[]; edges: MapEdge[]; selectedId: string; selectedEdge: MapEdge | null;
  onCamera: (id: string) => void; onEdge: (edge: MapEdge) => void;
}) {
  const height = cameras.length > 6 ? Math.max(460, Math.ceil(cameras.length / 4) * 130) : 460;
  const positions = cameras.map((camera, i) => ({ ...camera,
    x: cameras.length > 6 ? 110 + (i % 4) * 190 : cameras.length === 1 ? 400 : 400 + Math.cos(i * 2 * Math.PI / cameras.length - Math.PI / 2) * 240,
    y: cameras.length > 6 ? 80 + Math.floor(i / 4) * 130 : cameras.length === 1 ? 230 : 230 + Math.sin(i * 2 * Math.PI / cameras.length - Math.PI / 2) * 130 }));
  return <div className="ct-camera-graph" role="group" aria-label="Sơ đồ liên kết camera, không phải vị trí địa lý" style={{ height: cameras.length > 6 ? height : '100%', minWidth: cameras.length > 6 ? 640 : undefined }}>
    <svg className="ct-graph-lines" viewBox={`0 0 800 ${height}`} preserveAspectRatio="none" aria-label="Các liên kết bằng chứng">
      {edges.map((edge, i) => { const from = positions.find(p => p.id === edge.from), to = positions.find(p => p.id === edge.to); if (!from || !to) return null;
        const selected = selectedEdge?.from === edge.from && selectedEdge?.to === edge.to;
        return <g key={i}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={edge.confirmed ? '#1b6c80' : '#7b8992'} strokeWidth={selected ? 4 : 2} strokeDasharray={edge.confirmed ? undefined : '7 7'} vectorEffect="non-scaling-stroke" />
          <line className="ct-graph-link-hit" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth="22" vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={`Xem liên kết ${from.name} và ${to.name}`} onClick={() => onEdge(edge)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdge(edge); } }} /></g>;
      })}
    </svg>
    {positions.map(camera => <button key={camera.id} className={`ct-graph-camera${camera.id === selectedId && !selectedEdge ? ' is-selected' : ''}`} style={{ left: `${camera.x / 8}%`, top: `${camera.y / height * 100}%` }} onClick={() => onCamera(camera.id)} aria-label={`Khám phá ${camera.name}`}>
      <Thumbnail camera={camera} /><span><strong>{camera.name}</strong><small>{camera.observation ? `${seconds(camera.observation.first)}–${seconds(camera.observation.last)}` : 'Mở nguồn video'}</small></span>
    </button>)}
    <p className="ct-graph-disclosure">Sơ đồ phi địa lý · bấm camera hoặc đường nối để đối chiếu</p>
  </div>;
}
function InspectorCamera({ camera, location, illustrative, onOpenGrid }: { camera: MapCamera; location?: MapLocation; illustrative: boolean; onOpenGrid: () => void }) {
  const [revision, setRevision] = useState(0);
  const row = camera.observation;
  const cue = useMemo(() => row ? { seconds: row.first, until: Math.min(row.camera.duration_seconds, Math.max(row.first + .25, row.last + 1 / Math.max(1, row.camera.fps))), revision } : undefined, [row, revision]);
  return <div className="ct-map-camera-card">
    <div className="ct-inspector-title"><Camera size={17} /><h3>{camera.name}</h3></div>
    <p className="ct-map-source-tag">{illustrative ? 'Vị trí minh họa · chưa lưu' : location ? 'Vị trí đã khai báo' : 'Video mẫu · chưa gắn vị trí'}</p>
    {camera.src ? <CameraVideo src={camera.src} poster={camera.poster} name={camera.name} analysis={camera.analysis} trackIds={row ? [row.track.local_track_id] : []} showTrail={!!row} cue={cue} /> : <p className="ct-map-empty-source">Camera này chưa có video. <Link href="/workspace/videos">Thêm nguồn video</Link></p>}
    {row ? <><div className="ct-map-person"><TrackPortrait row={row} /><div><strong>L{row.track.local_track_id} · {seconds(row.first)}–{seconds(row.last)}</strong><span>Áo {row.track.clothing_colors?.upper?.label ?? 'chưa rõ'}</span><span>{row.relationship === 'candidate' ? 'AI gợi ý · cần đối chiếu' : row.relationship === 'confirmed' ? 'Người vận hành đã xác nhận' : 'Người tham chiếu'}</span></div></div>
      <button className="ct-button" onClick={() => setRevision(value => value + 1)}><RotateCcw size={14} />Phát lại đoạn xuất hiện</button></> : <p className="ct-route-note">Chọn người từ kết quả phân tích để xem lần xuất hiện.</p>}
    {location ? <dl className="ct-map-coordinates"><div><dt>{illustrative ? 'Vĩ độ minh họa' : 'Vĩ độ'}</dt><dd>{location.lat.toFixed(6)}</dd></div><div><dt>{illustrative ? 'Kinh độ minh họa' : 'Kinh độ'}</dt><dd>{location.lng.toFixed(6)}</dd></div></dl> : null}
    <button className="ct-button ct-primary" onClick={onOpenGrid}><Play size={14} />Mở trên lưới camera</button>
  </div>;
}
function MapDialog({ cameras, edges, initialId, onClose, onOpenGrid }: { cameras: MapCamera[]; edges: MapEdge[]; initialId: string; onClose: () => void; onOpenGrid: (id: string) => void }) {
  const recorded = buildMapScene(cameras, edges);
  const [mode, setMode] = useState<'campus' | 'links'>('campus');
  const [selectedId, setSelectedId] = useState(initialId || cameras[0]?.id || '');
  const [selectedEdge, setSelectedEdge] = useState<MapEdge | null>(null);
  const [temporary, setTemporary] = useState<Record<string, MapLocation>>({});
  const [placing, setPlacing] = useState(false);
  const [inspectedPoint, setInspectedPoint] = useState<MapLocation>();
  const [notice, setNotice] = useState('');
  const scene = buildMapScene(cameras, edges, temporary);
  const selected = cameras.find(camera => camera.id === selectedId) ?? cameras[0];
  const selectedPoint = scene.points.find(point => point.id === selected?.id);
  const hasIllustrations = scene.points.some(point => point.illustrative);
  function choose(id: string) { setSelectedId(id); setSelectedEdge(null); setNotice(''); }
  function place(location: MapLocation) {
    if (!selected) return;
    if (!validMapLocation(location)) { setNotice('Điểm nằm ngoài phạm vi tọa độ hợp lệ. Hãy trở về khuôn viên rồi thử lại.'); return; }
    if (recorded.points.some(point => point.id === selected.id)) { setNotice('Camera này đã có vị trí lưu sẵn. Hãy chọn camera chưa có tọa độ để thử bố trí.'); return; }
    setTemporary(previous => ({ ...previous, [selected.id]: location }));
    setInspectedPoint(undefined); setNotice(`Đã đặt vị trí minh họa cho ${selected.name}. Chỉ dùng trong cửa sổ này, không lưu vào camera thật.`);
  }
  const pointPopup = (id: string) => {
    const camera = cameras.find(camera => camera.id === id), point = scene.points.find(point => point.id === id);
    return <div className="ct-map-popup"><strong>{camera?.name}</strong><p>{point?.illustrative ? 'Minh họa · vị trí do bạn đặt' : 'Vị trí camera đã khai báo'}</p>{camera?.observation ? <p>L{camera.observation.track.local_track_id} · {seconds(camera.observation.first)}–{seconds(camera.observation.last)}</p> : null}<button onClick={() => choose(id)}>Mở thẻ camera & video</button></div>;
  };
  return <Modal className="ct-map-dialog" titleId="map-explorer-title" onClose={onClose}>
    <header className="ct-map-dialog-head"><div><h2 id="map-explorer-title">Bản đồ camera</h2><p>Khu II · Đại học Cần Thơ</p></div><div className="ct-map-dialog-toolbar"><div className="ct-map-view-tabs" role="group" aria-label="Kiểu khám phá"><button aria-pressed={mode === 'campus'} onClick={() => { setMode('campus'); setInspectedPoint(undefined); }}><MapPin size={15} />Khuôn viên</button>{edges.length > 0 ? <button aria-pressed={mode === 'links'} onClick={() => { setMode('links'); setPlacing(false); setInspectedPoint(undefined); }}><Link2 size={15} />Liên kết camera <span>{edges.length}</span></button> : null}</div><span>{recorded.recordedCount}/{cameras.length} camera có tọa độ đã lưu</span></div><button onClick={onClose} aria-label="Đóng bản đồ"><X size={20} /></button></header>
    {hasIllustrations || placing ? <div className="ct-map-illustration-notice" role="status"><span><strong>Bố trí minh họa</strong> · vị trí do bạn đặt, không phải hành trình thật và không được lưu.</span><button onClick={() => { setTemporary({}); setPlacing(false); setInspectedPoint(undefined); setNotice('Đã xóa bố trí minh họa. Dữ liệu camera thật không thay đổi.'); }}>Xóa minh họa</button></div> : null}
    <div className={`ct-map-workbench${mode === 'links' ? ' is-links' : ''}`}><div className="ct-map-stage">
      {mode === 'campus' ? <><OperationalMap points={scene.points.map(point => ({ ...point, selected: point.id === selected?.id }))} edges={scene.edges}
        onExplore={(lat, lng) => { if (placing) place({ lat, lng }); else setInspectedPoint({ lat, lng }); }} inspectedPoint={inspectedPoint} pointContent={pointPopup}
        edgeContent={index => { const edge = scene.edges[index]; return <div className="ct-map-popup"><strong>{edge?.illustrative ? 'Liên kết trên bố trí minh họa' : 'Liên kết camera'}</strong><p>Đường nối quan sát, không phải lối đi GPS.</p><button onClick={() => { setSelectedEdge(edge); setInspectedPoint(undefined); }}>Đối chiếu hai camera</button></div>; }}
        locationContent={inspectedPoint ? <div className="ct-map-popup"><strong>Vị trí trên bản đồ</strong><p>{inspectedPoint.lat.toFixed(6)}, {inspectedPoint.lng.toFixed(6)}</p><a href={`https://www.openstreetmap.org/?mlat=${inspectedPoint.lat}&mlon=${inspectedPoint.lng}#map=18/${inspectedPoint.lat}/${inspectedPoint.lng}`} target="_blank" rel="noreferrer">Xem trên OpenStreetMap</a></div> : null} />
        {placing ? <div className="ct-map-placement-hint">Bấm bản đồ để đặt minh họa: <strong>{selected?.name}</strong></div> : !scene.points.length ? <div className="ct-map-location-note"><MapPin size={16} /><div><strong>Khu II · Đại học Cần Thơ</strong><span>Video mẫu chưa gắn vị trí tại trường.</span></div></div> : null}</> : <CameraGraph cameras={cameras} edges={edges} selectedId={selectedId} selectedEdge={selectedEdge} onCamera={choose} onEdge={setSelectedEdge} />}
    </div><aside className="ct-map-inspector" aria-label="Thẻ camera và bằng chứng">
      {selectedEdge ? <div className="ct-map-link-card"><div className="ct-inspector-title"><Link2 size={17} /><h3>Đối chiếu liên camera</h3></div><p>{selectedEdge.confirmed ? 'Liên kết do người vận hành xác nhận' : 'Gợi ý từ AI · chưa xác nhận cùng người'}</p><div className="ct-map-comparison">{[selectedEdge.from, selectedEdge.to].map(id => { const camera = cameras.find(camera => camera.id === id); return camera ? <button key={id} onClick={() => choose(id)}><Thumbnail camera={camera} /><strong>{camera.name}</strong><span>Mở bằng chứng</span></button> : null; })}</div><p className="ct-route-note">Chọn một ảnh để xem video. Đường trên bản đồ không chứng minh đường đi qua vùng không có camera.</p></div>
        : selected ? <InspectorCamera key={selected.id} camera={selected} location={selectedPoint} illustrative={selectedPoint?.illustrative ?? false} onOpenGrid={() => { onClose(); onOpenGrid(selected.id); }} /> : <p>Chưa có nguồn camera. <Link href="/workspace/videos">Thêm video</Link></p>}
      <div className="ct-map-sources"><div className="ct-map-sources-heading"><h3>Chuyển camera</h3><span>{cameras.length} nguồn</span></div><div className="ct-map-camera-list" aria-label="Duyệt camera">{cameras.map(camera => <button key={camera.id} aria-pressed={camera.id === selected?.id && !selectedEdge} onClick={() => choose(camera.id)}><Thumbnail camera={camera} /><span><strong>{camera.name}</strong><small>{camera.observation ? 'Có đoạn xuất hiện' : 'Video ghi sẵn'}</small></span></button>)}</div></div>
      {mode === 'campus' && recorded.recordedCount < cameras.length ? <details className="ct-map-staging-control"><summary>Bố trí thử trên bản đồ</summary><button className="ct-button" aria-pressed={placing} onClick={() => { setPlacing(!placing); setInspectedPoint(undefined); setSelectedEdge(null); }}>{placing ? 'Dừng đặt minh họa' : 'Thử bố trí camera trên bản đồ'}</button><p>Chọn camera rồi bấm vị trí. Bố trí thử sẽ xóa khi đóng.</p><Link href="/workspace/cameras">Thiết lập vị trí camera thật</Link></details> : null}
      {notice ? <p className="ct-map-action-notice" role="status">{notice}</p> : null}
    </aside></div>
    {mode === 'links' ? <footer className="ct-map-footer-note"><span>Nét đứt: AI gợi ý · Nét liền: đã xác nhận</span><span>Đường nối camera không phải quỹ đạo GPS.</span></footer> : null}
  </Modal>;
}
export function CampusExplorer({ cameras, edges = [], selectedId = '', onOpenGrid }: { cameras: MapCamera[]; edges?: MapEdge[]; selectedId?: string; onOpenGrid: (id: string) => void }) {
  const [open, setOpen] = useState(false), [initialId, setInitialId] = useState('');
  const scene = buildMapScene(cameras, edges);
  function explore(id = selectedId) { setInitialId(id); setOpen(true); }
  return <div className="ct-campus-explorer"><OperationalMap points={scene.points.map(point => ({ ...point, selected: point.id === selectedId }))} edges={scene.edges}
    pointContent={id => <div className="ct-map-popup"><strong>{cameras.find(camera => camera.id === id)?.name}</strong><p>Chọn để xem video và bằng chứng tại camera.</p><button onClick={() => explore(id)}>Khám phá camera này</button></div>}
    edgeContent={index => <div className="ct-map-popup"><strong>Liên kết camera</strong><p>{scene.edges[index]?.confirmed ? 'Người vận hành đã xác nhận' : 'AI gợi ý · cần đối chiếu'}</p><button onClick={() => explore(scene.edges[index]?.from)}>Mở bản đồ điều tra</button></div>} />
    <button className="ct-map-explore-button" onClick={() => explore()}><Expand size={15} /><span>Mở bản đồ điều tra</span></button>
    {open ? <MapDialog cameras={cameras} edges={edges} initialId={initialId} onClose={() => setOpen(false)} onOpenGrid={onOpenGrid} /> : null}
  </div>;
}

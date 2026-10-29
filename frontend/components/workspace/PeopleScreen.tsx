"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, RefreshCw } from "lucide-react";
import { appearances, seconds } from "@/lib/evidence";
import { COLOR_SWATCHES } from "@/lib/public-demo";
import { searchPeople } from "@/lib/person-search";
import { useWorkspace } from "./WorkspaceProvider";
import { NoResult, ScreenTitle } from "./WorkspacePrimitives";
import { TrackPortrait } from "./TrackPortrait";

const colors = { white: 'Trắng', black: 'Đen', gray: 'Xám', red: 'Đỏ', orange: 'Cam', brown: 'Nâu', yellow: 'Vàng', green: 'Xanh lá', blue: 'Xanh dương', purple: 'Tím', pink: 'Hồng', unknown: 'Chưa rõ' };
export function PeopleScreen() {
  const app = useWorkspace(), router = useRouter();
  const [query, setQuery] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [upper, setUpper] = useState('');
  const [lower, setLower] = useState('');
  const [page, setPage] = useState(1);
  const result = app.job?.result;
  const rows = useMemo(() => result ? appearances(result) : [], [result]);
  const filtered = useMemo(() => {
    const selected = query.trim() && result ? new Set(searchPeople(result.tracks, query).map(item => item.track.track_key)) : null;
    return rows.filter(row => (!selected || selected.has(row.track.track_key)) && (!cameraId || cameraId === row.camera.camera_id) &&
      (!upper || row.track.clothing_colors?.upper?.name === upper) && (!lower || row.track.clothing_colors?.lower?.name === lower));
  }, [query, result, rows, cameraId, upper, lower]);
  function reset() { setQuery(''); setCameraId(''); setUpper(''); setLower(''); setPage(1); }
  return <>
    <ScreenTitle title="Tìm người theo đặc điểm" description="Nhập mô tả hoặc chọn màu trang phục để tìm trong video đã phân tích." action={result && !app.replay ? <button className="ct-button" onClick={() => void app.refreshJob().catch(failure => app.setError(failure.message))}><RefreshCw size={16} />Làm mới video</button> : undefined} />
      <section className="ct-panel ct-people-filters"><div className="ct-search-field"><Search size={18} /><label className="ct-sr-only" htmlFor="people-query">Mô tả màu trang phục</label><input id="people-query" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Ví dụ: áo trắng quần đen" /></div>
        <label>Camera<select value={cameraId} onChange={event => { setCameraId(event.target.value); setPage(1); }}><option value="">Tất cả camera</option>{result?.cameras.map(camera => <option key={camera.camera_id} value={camera.camera_id}>{camera.name}</option>)}</select></label>
        <label>Màu áo<select value={upper} onChange={event => { setUpper(event.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(colors).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Màu quần/váy<select value={lower} onChange={event => { setLower(event.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(colors).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><button onClick={reset}>Xóa lọc</button>
      </section>
    {!result ? <NoResult /> : <>
      <div className="ct-list-meta"><span><strong>{filtered.length}</strong> track khớp / {rows.length} track có quan sát</span><span>Track là đoạn theo dõi; chưa phải số người duy nhất.</span></div>
      {!filtered.length ? <div className="ct-panel ct-empty"><Search size={24} /><h2>Chưa có track khớp</h2><p>Thử đổi camera hoặc màu trang phục.</p><button className="ct-button" onClick={reset}>Xóa điều kiện lọc</button></div> : <div className="ct-person-grid">{filtered.slice((page - 1) * 12, page * 12).map(row => <article className="ct-person-card" key={`${app.job!.id}-${row.track.track_key}`}><TrackPortrait row={row} /><div className="ct-person-body">
        <span className="ct-track-id">{row.camera.camera_id} / L{row.track.local_track_id}</span><h2>{row.camera.name}</h2><p>{seconds(row.first)}–{seconds(row.last)}</p>
        <div className="ct-outfit">{(['upper', 'lower'] as const).map(part => { const color = row.track.clothing_colors?.[part]; return <span key={part}><i style={{ backgroundColor: COLOR_SWATCHES[color?.name ?? 'unknown'] ?? '#999' }} />{part === 'upper' ? 'Áo' : 'Quần/váy'}: {color?.label ?? 'chưa rõ'}</span>; })}</div>
        <button className="ct-button" onClick={() => { app.setSelection({ trackKey: row.track.track_key, cameraId: row.camera.camera_id, seconds: row.first, revision: Date.now() }); router.push('/workspace/journey'); }}>Xem hành trình<ArrowRight size={15} /></button>
      </div></article>)}</div>}
      {filtered.length > 12 ? <div className="ct-pagination"><span>{(page - 1) * 12 + 1}–{Math.min(page * 12, filtered.length)} / {filtered.length} track</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button><button disabled={page * 12 >= filtered.length} onClick={() => setPage(page + 1)}>Sau</button></div> : null}
    </>}
  </>;
}

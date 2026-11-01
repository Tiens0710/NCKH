"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, RefreshCw } from "lucide-react";
import type { PublicDemoResult } from "@/lib/public-demo";
import { appearances, seconds, directEvidence, type Appearance } from "@/lib/evidence";
import { COLOR_SWATCHES } from "@/lib/public-demo";
import { EMPTY_SEARCH, filterAppearances, validateSearch, type SearchFilters } from "@/lib/search-filters";
import { useWorkspace } from "./WorkspaceProvider";
import { NoResult, ScreenTitle } from "./WorkspacePrimitives";
import { TrackPortrait } from "./TrackPortrait";

const colors = { white: 'Trắng', black: 'Đen', gray: 'Xám', red: 'Đỏ', orange: 'Cam', brown: 'Nâu', yellow: 'Vàng', green: 'Xanh lá', blue: 'Xanh dương', purple: 'Tím', pink: 'Hồng', unknown: 'Chưa rõ' };
export function PeopleScreen({ embedded = false, resultOverride, onInspect, onLoadSample }: { embedded?: boolean; resultOverride?: PublicDemoResult | null; onInspect?: (row: Appearance) => void; onLoadSample?: () => Promise<void> }) {
  const app = useWorkspace(), router = useRouter();
  const [filters, setFilters] = useState<SearchFilters>({ ...EMPTY_SEARCH });
  const [references, setReferences] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ name: string; filters: SearchFilters }[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const result = resultOverride === undefined ? app.job?.result : resultOverride;
  const rows = useMemo(() => result ? appearances(result) : [], [result]);
  const validation = validateSearch(filters);
  const matches = useMemo(() => {
    const hits = filterAppearances(rows, filters);
    if (!references.length || !result) return hits;
    const related = new Set(references.flatMap(key => directEvidence(result, app.notes, key).rows.map(row => row.track.track_key)));
    return hits.filter(hit => related.has(hit.row.track.track_key)).map(hit => ({ ...hit, reasons: [...hit.reasons, 'Có liên kết với ảnh tham chiếu. Xem trạng thái xác nhận trong mục Hành trình.'] }));
  }, [rows, filters, result, references, app.notes]);
  const filtered = matches.map(hit => hit.row);
  function update<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); }
  function reset() { setFilters({ ...EMPTY_SEARCH }); setReferences([]); setPage(1); }
  const storageKey = `campus-trace-search-v1:${app.access?.id ?? 'demo'}:${app.job?.id ?? 'raw'}`;
  function readSaved() {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(value)) return [];
      return value.filter((item): item is { name: string; filters: SearchFilters } => !!item && typeof item.name === 'string' && item.name.length <= 60 && item.filters && Object.entries(EMPTY_SEARCH).every(([key]) => key === 'excludedKeys' ? Array.isArray(item.filters[key]) && item.filters[key].length <= 200 && item.filters[key].every((x: unknown) => typeof x === 'string') : typeof item.filters[key] === 'string' && item.filters[key].length <= 500)).slice(0, 8);
    } catch { return []; }
  }
  function save() {
    if (!saveName.trim() || validation) return;
    const items = [{ name: saveName.trim(), filters }, ...readSaved().filter(item => item.name !== saveName.trim())].slice(0, 8);
    try { localStorage.setItem(storageKey, JSON.stringify(items)); setSaved(items); setSavedOpen(true); setNotice('Đã lưu bộ lọc cho phiên hiện tại trên trình duyệt này. Ảnh tham chiếu không được lưu cùng bộ lọc.'); } catch { setNotice('Không thể lưu bộ lọc trên trình duyệt này.'); }
  }
  return <>
    {!embedded ? <ScreenTitle title="Tìm người theo đặc điểm" description="Tra cứu các lần xuất hiện theo trang phục, camera và thời gian trong video đã phân tích." action={result && !app.replay ? <button className="ct-button" onClick={() => void app.refreshJob().catch(failure => app.setError(failure.message))}><RefreshCw size={16} />Cập nhật kết quả</button> : undefined} /> : null}
      <section className="ct-panel ct-people-filters"><div className="ct-search-field"><Search size={18} /><label className="ct-sr-only" htmlFor={embedded ? "drawer-people-query" : "people-query"}>Đặc điểm trang phục</label><input id={embedded ? "drawer-people-query" : "people-query"} data-initial-focus={embedded || undefined} type="search" value={filters.query} maxLength={500} onChange={event => update('query', event.target.value)} placeholder="Áo trắng quần đen hoặc áo xanh dương" /></div>
        <label>Camera<select value={filters.cameraId} onChange={event => update('cameraId', event.target.value)}><option value="">Tất cả camera</option>{result?.cameras.map(camera => <option key={camera.camera_id} value={camera.camera_id}>{camera.name}</option>)}</select></label>
        <label>Màu áo<select value={filters.upper} onChange={event => update('upper', event.target.value)}><option value="">Tất cả</option>{Object.entries(colors).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Màu quần/váy<select value={filters.lower} onChange={event => update('lower', event.target.value)}><option value="">Tất cả</option>{Object.entries(colors).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><button onClick={reset}>Xóa lọc</button>
      </section>
    <details className="ct-search-advanced"><summary>Thời gian, hướng di chuyển và loại trừ</summary><div className="ct-search-advanced-grid">
      <label>Bắt đầu (giây)<input type="number" min="0" step="0.1" value={filters.start} onChange={e => update('start', e.target.value)} placeholder="0" /></label>
      <label>Kết thúc (giây)<input type="number" min="0" step="0.1" value={filters.end} onChange={e => update('end', e.target.value)} placeholder="Cuối video" /></label>
      <label>Khoảng thời gian quan sát tối thiểu (giây)<input type="number" min="0" step="0.1" value={filters.minSpan} onChange={e => update('minSpan', e.target.value)} /></label>
      <label>Hướng di chuyển trên hình ảnh<select value={filters.direction} onChange={e => update('direction', e.target.value)}><option value="">Tất cả</option><option value="left">Sang trái</option><option value="right">Sang phải</option><option value="up">Lên trên</option><option value="down">Xuống dưới</option><option value="unknown">Chưa xác định</option></select></label>
      <label className="ct-search-wide">Loại trừ trang phục<input maxLength={500} value={filters.exclude} onChange={e => update('exclude', e.target.value)} placeholder="Ví dụ: áo trắng" /></label>
      </div><p>Mốc thời gian được tính từ đầu mỗi video. Hướng di chuyển được xác định trên hình ảnh và có thể chịu ảnh hưởng của chuyển động camera. Chưa hỗ trợ suy ra hướng địa lý; thuộc tính chưa rõ không được dùng để kết luận loại trừ.</p></details>
    {validation ? <p role="alert" className="ct-search-validation">{validation}</p> : null}
    {references.length ? <div className="ct-search-reference"><strong>{references.length} ảnh tham chiếu</strong><p>Đối chiếu các liên kết hiện có với ảnh đã chọn. Chưa hỗ trợ tìm kiếm từ ảnh tải lên.</p><button onClick={() => { setReferences([]); setPage(1); }}>Bỏ chọn ảnh tham chiếu</button></div> : null}
    {filters.excludedKeys.length ? <p className="ct-caption">Đã ẩn {filters.excludedKeys.length} kết quả trong bộ lọc này. <button onClick={() => update('excludedKeys', [])}>Hiện lại</button></p> : null}
    <details className="ct-search-capabilities"><summary>Phạm vi tìm kiếm hiện tại</summary><p>Hiện hỗ trợ màu trang phục, camera, thời điểm quan sát và hướng dịch chuyển khi có đủ khung hình. Các đặc điểm như balô, mũ, giày, tóc, phương tiện, hành vi và vùng vào/ra chưa có dữ liệu phân tích. Chưa hỗ trợ tìm kiếm bằng ảnh tải lên.</p></details>
    <div className="ct-search-saved"><button onClick={() => { setSaved(readSaved()); setSavedOpen(!savedOpen); }}>Bộ lọc đã lưu</button>{savedOpen ? <div><label>Tên bộ lọc<input maxLength={60} value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Ví dụ: áo đen tại cổng" /></label><button disabled={!result || !saveName.trim() || !!validation} onClick={save}>Lưu bộ lọc</button><small>Lưu tối đa 8 bộ lọc cho mỗi phiên trên trình duyệt này. Chưa hỗ trợ thông báo khi có kết quả mới.</small>{saved.map((item,i) => <div className="ct-saved-query" key={i}><button onClick={() => { setFilters(item.filters); setReferences([]); setPage(1); }}>{item.name}</button><button aria-label={`Xóa truy vấn ${item.name}`} onClick={() => { const next=saved.filter((_,index)=>index!==i); try { localStorage.setItem(storageKey,JSON.stringify(next)); setSaved(next); } catch { setNotice('Không thể xóa bộ lọc đã lưu. Vui lòng thử lại.'); } }}>Xóa</button></div>)}</div> : null}<p role="status">{notice}</p></div>
    {!result ? embedded ? <div className="ct-search-empty"><Search size={25} /><h3>Chưa có kết quả phân tích cho video đang xem</h3><p>Video vẫn tiếp tục phát. Phân tích video để tra cứu trang phục và các lần xuất hiện.</p><Link className="ct-button ct-primary" href="/workspace/videos">Chọn video để phân tích</Link>{onLoadSample ? <button className="ct-button" onClick={() => void onLoadSample().catch(failure => app.setError(failure.message))}>Tra cứu dữ liệu minh họa MARS</button> : null}<small>Dữ liệu minh họa MARS độc lập với video P-DESTRE đang phát.</small></div> : <NoResult /> : <>
      <div className="ct-list-meta" role="status" aria-live="polite"><span><strong>{filtered.length}</strong> đoạn theo dõi phù hợp / {rows.length} đoạn đã ghi nhận</span><span>Một người có thể có nhiều đoạn theo dõi. Số kết quả không đại diện cho số người riêng biệt.</span></div>
      {!filtered.length ? <div className="ct-panel ct-empty"><Search size={24} /><h2>Không tìm thấy kết quả phù hợp</h2><p>Điều chỉnh camera, màu trang phục hoặc các điều kiện tìm kiếm.</p><button className="ct-button" onClick={reset}>Xóa điều kiện lọc</button></div> : <div className="ct-person-grid">{filtered.slice((page - 1) * 12, page * 12).map(row => <article className="ct-person-card" key={`${app.job!.id}-${row.track.track_key}`}><TrackPortrait row={row} /><div className="ct-person-body">
        <span className="ct-track-id">{row.camera.camera_id} / L{row.track.local_track_id}</span><h2>{row.camera.name}</h2><p>{seconds(row.first)}–{seconds(row.last)}</p>
        <div className="ct-outfit">{(['upper', 'lower'] as const).map(part => { const color = row.track.clothing_colors?.[part]; return <span key={part}><i style={{ backgroundColor: COLOR_SWATCHES[color?.name ?? 'unknown'] ?? '#999' }} />{part === 'upper' ? 'Áo' : 'Quần/váy'}: {color?.label ?? 'chưa rõ'}</span>; })}</div>
        <details className="ct-match-reasons"><summary>Chi tiết đối chiếu</summary><ul>{matches.find(hit => hit.row.track.track_key === row.track.track_key)?.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><small>Độ tin cậy phát hiện: {(row.score * 100).toFixed(1)}%. Điểm này không thể hiện độ chính xác của danh tính hoặc màu trang phục.</small></details>
        <div className="ct-result-feedback"><button aria-pressed={references.includes(row.track.track_key)} onClick={() => { setReferences(previous => previous.includes(row.track.track_key) ? previous.filter(key => key !== row.track.track_key) : [...previous, row.track.track_key]); setPage(1); }}>Ảnh tham chiếu</button><button onClick={() => update('excludedKeys', [...filters.excludedKeys, row.track.track_key])}>Ẩn kết quả</button></div>
        <button className="ct-button" onClick={() => { if (onInspect) { onInspect(row); return; } app.setSelection({ trackKey: row.track.track_key, cameraId: row.camera.camera_id, seconds: row.first, revision: Date.now() }); router.push('/workspace/journey'); }}>{onInspect ? 'Xem trong camera' : 'Xem hành trình'}<ArrowRight size={15} /></button>
      </div></article>)}</div>}
      {filtered.length > 12 ? <div className="ct-pagination"><span>{(page - 1) * 12 + 1}–{Math.min(page * 12, filtered.length)} / {filtered.length} track</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button><button disabled={page * 12 >= filtered.length} onClick={() => setPage(page + 1)}>Sau</button></div> : null}
    </>}
  </>;
}

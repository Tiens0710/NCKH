import type { Appearance } from './evidence';
import { queryTerms, searchPeople } from './person-search';

export type SearchFilters = { query: string; exclude: string; cameraId: string; upper: string; lower: string; start: string; end: string; minSpan: string; direction: string; excludedKeys: string[] };
export const EMPTY_SEARCH: SearchFilters = { query: '', exclude: '', cameraId: '', upper: '', lower: '', start: '', end: '', minSpan: '', direction: '', excludedKeys: [] };
export type SearchMatch = { row: Appearance; reasons: string[]; direction: string; observedTimes: number[] };
export function validateSearch(filters: SearchFilters): string {
  if (filters.exclude.trim() && queryTerms(filters.exclude).some(t => !/^(?:(?:upper|lower)_)?(?:white|black|gray|red|orange|brown|yellow|green|blue|purple|pink)$/.test(t))) return 'Phần loại trừ hiện hỗ trợ màu áo/quần, ví dụ: áo trắng.';
  for (const key of ['start','end','minSpan'] as const) if (filters[key] !== '' && (!Number.isFinite(Number(filters[key])) || Number(filters[key]) < 0)) return 'Thời gian phải là số giây không âm.';
  if (filters.start !== '' && filters.end !== '' && Number(filters.start) > Number(filters.end)) return 'Mốc bắt đầu phải nhỏ hơn hoặc bằng mốc kết thúc.';
  return '';
}
/** Direction is image-plane displacement within a contiguous observed segment, not a geographic route. */
export function observedDirection(row: Appearance, start = 0, end = Infinity): string {
  if (!row.camera.width || !row.camera.height) return 'unknown';
  const frames = row.camera.frames.filter(f => f.time_seconds >= start && f.time_seconds <= end).map(f => ({ t: f.time_seconds, d: f.detections.find(d => d.local_track_id === row.track.local_track_id) })).filter(f => f.d && f.d.xyxy.length === 4 && f.d.xyxy.every(Number.isFinite)).sort((a,b) => a.t-b.t);
  if (frames.length < 3 || frames.at(-1)!.t - frames[0].t < .5 || frames.some((f,i) => i > 0 && f.t - frames[i-1].t > 1.5)) return 'unknown';
  const a=frames[0].d!.xyxy,b=frames.at(-1)!.d!.xyxy;
  const dx=((b[0]+b[2])-(a[0]+a[2]))/(2*row.camera.width),dy=(b[3]-a[3])/row.camera.height;
  if (Math.max(Math.abs(dx),Math.abs(dy)) < .06) return 'unknown';
  return Math.abs(dx) >= Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
}
export function filterAppearances(rows: Appearance[], filters: SearchFilters): SearchMatch[] {
  if (validateSearch(filters)) return [];
  const positive = new Set<string>();
  // Each alternative is an AND query; alternatives are joined with OR.
  const alternatives=filters.query.split(/\s+(?:hoặc|hoac|OR)\s+|\|/i).map(q=>q.trim()).filter(Boolean);
  for (const query of alternatives) for (const hit of searchPeople(rows.map(r=>r.track),query)) positive.add(hit.track.track_key);
  const excluded = new Set(searchPeople(rows.map(r=>r.track),filters.exclude).map(h=>h.track.track_key));
  const negativeTerms=queryTerms(filters.exclude);
  const start=filters.start === '' ? 0 : Number(filters.start),end=filters.end === '' ? Infinity : Number(filters.end);
  return rows.flatMap(row => {
    const key=row.track.track_key,upper=row.track.clothing_colors?.upper?.name,lower=row.track.clothing_colors?.lower?.name;
    if (filters.excludedKeys.includes(key) || alternatives.length && !positive.has(key) || filters.cameraId && filters.cameraId !== row.camera.camera_id || filters.upper && filters.upper !== upper || filters.lower && filters.lower !== lower) return [];
    if (filters.exclude.trim()) {
      // Unknown clothing is not proof that the excluded attribute is absent.
      if (excluded.has(key) || negativeTerms.some(t=>t.startsWith('upper_') && (!upper || upper === 'unknown') || t.startsWith('lower_') && (!lower || lower === 'unknown') || !t.includes('_') && (!upper || !lower || upper === 'unknown' || lower === 'unknown'))) return [];
    }
    const times=row.camera.frames.filter(f=>f.time_seconds >= start && f.time_seconds <= end && f.detections.some(d=>d.local_track_id === row.track.local_track_id)).map(f=>f.time_seconds).sort((a,b)=>a-b);
    if (!times.length || times.at(-1)!-times[0] < Number(filters.minSpan || 0)) return [];
    const direction=observedDirection(row,start,end);
    if (filters.direction && direction !== filters.direction) return [];
    const reasons=[...(alternatives.length ? ['Khớp mô tả trang phục'] : []),...(filters.cameraId ? ['Đúng camera đã chọn'] : []),...(filters.upper ? ['Khớp màu áo'] : []),...(filters.lower ? ['Khớp màu quần/váy'] : []),...(filters.exclude.trim() ? ['Không khớp mô tả bị loại; màu trang phục có dữ liệu'] : []),...(filters.start !== '' || filters.end !== '' ? [`Có ${times.length} frame quan sát trong khoảng đã chọn`] : []),...(filters.minSpan ? [`Khoảng quan sát ít nhất ${filters.minSpan} giây; không phải thời gian đứng yên`] : []),...(filters.direction ? ['Hướng suy ra từ khung bao trong hình'] : [])];
    const observed = new Set(times);
    const observations = row.camera.frames.filter(f => observed.has(f.time_seconds)).flatMap(f => f.detections.filter(d => d.local_track_id === row.track.local_track_id).map(d => ({ time: f.time_seconds, detection: d })));
    const best = observations.reduce((a,b) => b.detection.score > a.detection.score ? b : a);
    const matchedRow = { ...row, first: times[0], last: times.at(-1)!, portraitTime: best.time, box: best.detection.xyxy, score: best.detection.score };
    return [{row: matchedRow,reasons:reasons.length ? reasons : ['Có phát hiện thực trong video'],direction,observedTimes:times}];
  });
}

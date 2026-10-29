import type { DemoCamera, DemoTrack, PublicDemoResult } from "./public-demo";
import type { Review } from "./workspace-types";

export type Appearance = { track: DemoTrack; camera: DemoCamera; first: number; last: number; score: number; box: number[]; portraitTime: number };
export function appearances(result: PublicDemoResult): Appearance[] {
  const output: Appearance[] = [];
  for (const camera of result.cameras) {
    const byId = new Map<number, { first: number; last: number; score: number; box: number[]; time: number }>();
    for (const frame of camera.frames) {
      if (!Number.isFinite(frame.time_seconds)) continue;
      for (const detection of frame.detections) {
        if (detection.local_track_id === null) continue;
        const current = byId.get(detection.local_track_id);
        if (!current) byId.set(detection.local_track_id, { first: frame.time_seconds, last: frame.time_seconds, score: detection.score, box: detection.xyxy, time: frame.time_seconds });
        else {
          current.first = Math.min(current.first, frame.time_seconds); current.last = Math.max(current.last, frame.time_seconds);
          if (detection.score > current.score) { current.score = detection.score; current.box = detection.xyxy; current.time = frame.time_seconds; }
        }
      }
    }
    for (const track of result.tracks.filter(track => track.camera_id === camera.camera_id)) {
      const item = byId.get(track.local_track_id);
      if (item) output.push({ track, camera, first: item.first, last: item.last, score: item.score, box: item.box, portraitTime: item.time });
    }
  }
  return output;
}
export function directEvidence(result: PublicDemoResult, notes: Review[], selectedKey: string) {
  const states = new Map<string, { relationship: "selected" | "confirmed" | "candidate"; similarity?: number }>();
  states.set(selectedKey, { relationship: "selected" });
  const latest = new Map<string, Review>();
  for (const note of [...notes].sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))) {
    if (note.track_key !== selectedKey && note.other_track_key !== selectedKey || !note.other_track_key) continue;
    const other = note.track_key === selectedKey ? note.other_track_key : note.track_key;
    if (!latest.has(other)) latest.set(other, note);
    else if (latest.get(other)!.created_at === note.created_at && latest.get(other)!.decision !== note.decision)
      latest.set(other, { ...note, decision: "uncertain" });
  }
  for (const link of result.links) {
    const other = link.from_track === selectedKey ? link.to_track : link.to_track === selectedKey ? link.from_track : null;
    if (other) states.set(other, { relationship: "candidate", similarity: link.similarity });
  }
  for (const [other, note] of latest) {
    if (note.decision === "same") states.set(other, { relationship: "confirmed" });
    else if (note.decision === "different" || note.decision === "uncertain") states.delete(other);
  }
  const rows = appearances(result).filter(row => states.has(row.track.track_key)).map(row => ({ ...row, ...states.get(row.track.track_key)! }));
  const synchronized = rows.length > 0 && rows.every(row => row.camera.timeline_known === true);
  if (synchronized) rows.sort((a, b) => a.camera.timeline_start_seconds + a.first - b.camera.timeline_start_seconds - b.first);
  return { rows, synchronized };
}
export function seconds(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${Math.floor(value % 60).toString().padStart(2, "0")}.${Math.floor(value % 1 * 10)}`;
}
export function cameraJourney(result: PublicDemoResult, notes: Review[], selectedKey: string) {
  const evidence = directEvidence(result, notes, selectedKey);
  const root = evidence.rows.find(row => row.track.track_key === selectedKey);
  const edges: { from: string; to: string; confirmed: boolean; directed: boolean }[] = [];
  if (!root) return { ...evidence, edges };
  for (const row of evidence.rows) {
    if (row.camera.camera_id === root.camera.camera_id || row.relationship === 'selected') continue;
    if (row.relationship === 'confirmed' && evidence.synchronized) continue;
    edges.push({ from: root.camera.camera_id, to: row.camera.camera_id, confirmed: row.relationship === 'confirmed', directed: false });
  }
  const confirmed = evidence.rows.filter(row => row.relationship !== 'candidate');
  if (evidence.synchronized) for (let i = 1; i < confirmed.length; i++) {
    const from = confirmed[i - 1].camera.camera_id, to = confirmed[i].camera.camera_id;
    if (from !== to) edges.push({ from, to, confirmed: true, directed: true });
  }
  return { ...evidence, edges };
}
export function exportEvidenceCsv(rows: Appearance[]) {
  const cell = (value: string | number) => {
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + [['camera', 'track', 'first_video_seconds', 'last_video_seconds', 'common_start_seconds', 'upper_color', 'lower_color', 'best_detection_score'],
    ...rows.map(row => [row.camera.name, row.track.track_key, row.first, row.last, row.camera.timeline_known ? row.first + row.camera.timeline_start_seconds : '',
      row.track.clothing_colors?.upper?.name ?? 'unknown', row.track.clothing_colors?.lower?.name ?? 'unknown', row.score])].map(row => row.map(cell).join(',')).join('\r\n');
}

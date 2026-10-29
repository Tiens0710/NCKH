import type { DemoCamera } from './public-demo';
export type TrailPoint = [number, number];
/** Observed bottom-centre points only: never joins across missing detections or future frames. */
export function trackTrail(camera: DemoCamera, id: number, now: number, windowSeconds = 6): TrailPoint[][] {
  const output: TrailPoint[][] = [];
  let segment: TrailPoint[] = [], previous = -Infinity;
  const frames = camera.frames;
  const intervals = frames.slice(1).map((frame, i) => frame.time_seconds - frames[i].time_seconds).filter(n => n > 0).sort((a, b) => a - b);
  const maxGap = Math.max(.5, (intervals[Math.floor(intervals.length / 2)] || 1 / (camera.fps || 1)) * 2.5);
  const finish = () => { if (segment.length > 1) output.push(segment); segment = []; };
  for (const frame of frames) {
    if (frame.time_seconds > now + 1e-6) break;
    if (frame.time_seconds < now - windowSeconds) continue;
    const detection = frame.detections.find(item => item.local_track_id === id && item.xyxy.length === 4 && item.xyxy.every(Number.isFinite) && item.xyxy[2] > item.xyxy[0] && item.xyxy[3] > item.xyxy[1]);
    if (!detection) { finish(); previous = -Infinity; continue; }
    if (frame.time_seconds - previous > maxGap) finish();
    const [x1, , x2, y2] = detection.xyxy;
    segment.push([(x1 + x2) / 2, y2]); previous = frame.time_seconds;
  }
  finish();
  return output;
}

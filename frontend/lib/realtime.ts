export type RealtimeConnection = { url: string; token: string };
export type RealtimeFrame = { sequence: number; width: number; height: number; jpeg: string;
  received_at: number; inference_ms: number; inference_fps: number | null;
  detections: { xyxy: [number, number, number, number]; score: number; label: 'person' }[] };
export type RealtimeSnapshot = { camera_id: string; status: 'waiting' | 'ready' | 'stale'; age_ms?: number;
  simulation: boolean; model_status: string; source_status: string; model?: { name: string; device: string }; frame: RealtimeFrame | null };
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function realtimeSnapshot(raw: unknown, endpoint: string): RealtimeSnapshot {
  const data = raw as RealtimeSnapshot;
  const expected = new URL(endpoint).pathname.match(/\/cameras\/([^/]+)\/latest$/)?.[1];
  if (!data || !expected || data.camera_id !== expected || !['ready','waiting','stale'].includes(data.status) || typeof data.simulation !== 'boolean') throw new Error('Phản hồi gateway không hợp lệ.');
  if (data.status !== 'ready') return { ...data, frame: null };
  const frame = data.frame;
  if (!finite(data.age_ms) || data.age_ms < 0 || data.age_ms > 60000 || !frame || !Number.isSafeInteger(frame.sequence) || frame.sequence < 1 ||
    !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height) || Math.min(frame.width,frame.height) < 2 || Math.max(frame.width,frame.height) > 960 ||
    typeof frame.jpeg !== 'string' || frame.jpeg.length > 700000 || !/^\/9j\/[A-Za-z0-9+/=]+$/.test(frame.jpeg) ||
    !finite(frame.inference_ms) || frame.inference_ms < 0 || !finite(frame.received_at) ||
    frame.inference_fps !== null && (!finite(frame.inference_fps) || frame.inference_fps < 0) || !Array.isArray(frame.detections) || frame.detections.length > 500) throw new Error('Frame AI không hợp lệ.');
  for (const item of frame.detections) {
    const box = item.xyxy;
    if (item.label !== 'person' || !finite(item.score) || item.score < 0 || item.score > 1 || !Array.isArray(box) || box.length !== 4 || !box.every(finite) ||
      box[0] < 0 || box[1] < 0 || box[2] > frame.width || box[3] > frame.height || box[2] <= box[0] || box[3] <= box[1]) throw new Error('Khung bao AI không hợp lệ.');
  }
  return data;
}
export function frameFresh(snapshot: RealtimeSnapshot | null, elapsed: number) {
  return snapshot?.status === 'ready' && !!snapshot.frame && (snapshot.age_ms ?? Infinity) + Math.max(0, elapsed) <= 3000;
}

import type { DemoCamera, DemoDetection } from "./public-demo";

export function visibleDetections(camera: DemoCamera, seconds: number, focusedId: number | null, hideAll = false): DemoDetection[] {
  if (hideAll) return [];
  let frame: DemoCamera["frames"][number] | undefined;
  let previous: DemoCamera["frames"][number] | undefined;
  for (const item of camera.frames) {
    if (item.time_seconds > seconds + 1e-6) break;
    previous = frame; frame = item;
  }
  if (!frame) return [];
  const interval = previous ? frame.time_seconds - previous.time_seconds
    : camera.frames.length > 1 ? camera.frames[1].time_seconds - camera.frames[0].time_seconds : 1 / camera.fps;
  if (seconds - frame.time_seconds > Math.max(1 / camera.fps, interval) * 1.5) return [];
  return frame.detections.filter(detection => focusedId === null || detection.local_track_id === focusedId);
}

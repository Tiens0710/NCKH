import type { DemoTrack, PublicDemoResult } from "./public-demo";

/** Direct candidates only: similarity is not transitive identity evidence. */
export function journeyObservations(result: PublicDemoResult, selectedKey: string) {
  const keys = new Set([selectedKey]);
  for (const link of result.links) {
    if (link.from_track === selectedKey) keys.add(link.to_track);
    if (link.to_track === selectedKey) keys.add(link.from_track);
  }
  const observations: { track: DemoTrack; camera: PublicDemoResult["cameras"][number]; first: number; last: number }[] = [];
  for (const camera of result.cameras) {
    const tracks = result.tracks.filter(track => track.camera_id === camera.camera_id && keys.has(track.track_key));
    for (const track of tracks) {
      const times = camera.frames.filter(frame => frame.detections.some(detection => detection.local_track_id === track.local_track_id))
        .map(frame => frame.time_seconds).filter(Number.isFinite);
      if (times.length) observations.push({ track, camera, first: Math.min(...times), last: Math.max(...times) });
    }
  }
  if (observations.every(item => item.camera.timeline_known === true))
    observations.sort((a, b) => a.camera.timeline_start_seconds + a.first - b.camera.timeline_start_seconds - b.first);
  return observations;
}

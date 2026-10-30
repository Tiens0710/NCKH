import type { Appearance } from './evidence';
import type { DemoCamera } from './public-demo';
import type { RealtimeConnection } from './realtime';
export type MapLocation = { lat: number; lng: number };
export type MapCamera = { id: string; name: string; src?: string; poster?: string; stream?: boolean; realtime?: RealtimeConnection; pendingRtsp?: boolean; location?: MapLocation; analysis?: DemoCamera;
  observation?: Appearance & { relationship?: 'selected' | 'candidate' | 'confirmed' } };
export type MapEdge = { from: string; to: string; confirmed?: boolean; directed?: boolean; illustrative?: boolean };
export function validMapLocation(value?: MapLocation): value is MapLocation {
  return !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}
/** Temporary staging never overrides a recorded location or turns a hypothetical edge into a route. */
export function buildMapScene(cameras: MapCamera[], edges: MapEdge[], temporary: Record<string, MapLocation> = {}) {
  const points = cameras.flatMap(camera => {
    const recorded = validMapLocation(camera.location), location = recorded ? camera.location : temporary[camera.id];
    return validMapLocation(location) ? [{ id: camera.id, name: camera.name, ...location, illustrative: !recorded }] : [];
  });
  const byId = new Map(points.map(point => [point.id, point]));
  return { points, recordedCount: points.filter(point => !point.illustrative).length,
    edges: edges.flatMap(edge => {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to || from.id === to.id) return [];
      const illustrative = from.illustrative || to.illustrative;
      return [{ ...edge, illustrative, directed: illustrative ? false : edge.directed }];
    }) };
}

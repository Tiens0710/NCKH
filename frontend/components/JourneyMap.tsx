"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";

export type CameraPoint = { id: string; name: string; lat: number; lng: number; selected: boolean };
function Bounds({ points }: { points: CameraPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points.map(point => [point.lat, point.lng] as LatLngTuple), { padding: [32, 32], maxZoom: 18 });
  }, [map, points]);
  return null;
}
export default function JourneyMap({ points, onSelect }: { points: CameraPoint[]; onSelect: (cameraId: string) => void }) {
  const selected = points.find(point => point.selected);
  return <MapContainer center={[points[0].lat, points[0].lng]} zoom={16} className="pd-journey-map" scrollWheelZoom={false}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Bounds points={points} />
    {selected ? points.filter(point => !point.selected).map(point => <Polyline key={point.id}
      positions={[[selected.lat, selected.lng], [point.lat, point.lng]]} pathOptions={{ color: "#267c69", weight: 2, dashArray: "6 8" }} />) : null}
    {points.map(point => <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={point.selected ? 10 : 7}
      pathOptions={{ color: point.selected ? "#267c69" : "#555", fillOpacity: 0.8 }} eventHandlers={{ click: () => onSelect(point.id) }}>
      <Popup>{point.name}<br />{point.selected ? "Camera của track đang chọn" : "Camera có track ứng viên"}</Popup>
    </CircleMarker>)}
  </MapContainer>;
}

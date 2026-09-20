"use client";

import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect } from "react";
import type { DemoRoutePoint } from "@/lib/demo";

const CAMPUS_CENTER: LatLngExpression = [10.03183, 105.7838];

function FitRoute({ points }: { points: LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points as LatLngBoundsExpression, { padding: [30, 30] });
  }, [map, points]);

  return null;
}

export function CampusMap({ points }: { points: DemoRoutePoint[] }) {
  const positions = points.map((point) => [point.lat, point.lng] as LatLngExpression);

  return (
    <div className="campus-map-frame" aria-label="Bản đồ vệ tinh tuyến đường demo Campus II">
      <MapContainer
        center={CAMPUS_CENTER}
        zoom={17}
        minZoom={14}
        maxZoom={20}
        scrollWheelZoom
        className="campus-map"
      >
        <TileLayer
          attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          attribution=""
          opacity={0.82}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />
        <Polyline positions={positions} pathOptions={{ color: "#f04438", weight: 5, opacity: 0.95 }} />
        {points.map((point, index) => {
          const isCamera = point.kind === "camera";
          const isLast = index === points.length - 1;
          return (
            <CircleMarker
              key={`${point.camera}-${point.sequence}`}
              center={[point.lat, point.lng]}
              radius={isLast ? 9 : 7}
              pathOptions={{
                color: isLast ? "#7c3aed" : isCamera ? "#15803d" : "#2563eb",
                fillColor: isLast ? "#a855f7" : isCamera ? "#22c55e" : "#60a5fa",
                fillOpacity: 0.95,
                weight: 3,
              }}
            >
              <Popup>
                <strong>{point.camera}</strong>
                <br />
                {point.area}
                <br />
                {point.time} · {isCamera ? "Camera" : "Mốc nội suy"}
              </Popup>
            </CircleMarker>
          );
        })}
        <FitRoute points={positions} />
      </MapContainer>
      <span className="campus-map-label">Dữ liệu mô phỏng · lớp nền vệ tinh</span>
    </div>
  );
}

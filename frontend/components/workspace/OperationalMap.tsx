"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, Tooltip, Polyline, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { DomEvent, divIcon, type LatLngTuple } from "leaflet";
import { CTU_CAMPUS } from "@/lib/ctu-campus";
type Point = { id: string; name: string; lat: number; lng: number; selected?: boolean; illustrative?: boolean };
type Edge = { from: string; to: string; confirmed?: boolean; directed?: boolean; illustrative?: boolean };
function Direction({ from, to }: { from: Point; to: Point }) {
  const angle = Math.atan2(-(to.lat - from.lat), (to.lng - from.lng) * Math.cos(from.lat * Math.PI / 180)) * 180 / Math.PI;
  return <Marker position={[(from.lat + to.lat) / 2, (from.lng + to.lng) / 2]} interactive={false} keyboard={false}
    icon={divIcon({ className: 'ct-route-arrow', iconSize: [20, 20], iconAnchor: [10, 10], html: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" style="display:block;transform:rotate(${angle}deg)"><path d="M3 3 L18 10 L3 17 L7 10 Z" fill="#1d5fbf"/></svg>` })} />;
}
function Bounds({ points, onPlace, onExplore }: { points: Point[]; onPlace?: (lat: number, lng: number) => void; onExplore?: (lat: number, lng: number) => void }) {
  const map = useMap();
  const controls = useRef<HTMLDivElement>(null);
  useMapEvents({ click: event => { if (onPlace) onPlace(event.latlng.lat, event.latlng.lng); else onExplore?.(event.latlng.lat, event.latlng.lng); } });
  useEffect(() => { const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(map.getContainer()); return () => observer.disconnect(); }, [map]);
  useEffect(() => { if (controls.current) DomEvent.disableClickPropagation(controls.current); }, []);
  return <div ref={controls} className="ct-map-controls"><button type="button" onClick={event => { event.stopPropagation(); map.setView(CTU_CAMPUS.center, CTU_CAMPUS.zoom); }}>Về khuôn viên</button>
    {points.length ? <button type="button" onClick={event => { event.stopPropagation(); map.fitBounds(points.map(point => [point.lat, point.lng] as LatLngTuple), { maxZoom: 18, padding: [40, 40] }); }}>Xem camera</button> : null}</div>;
}
export default function OperationalMap({ points = [], edges = [], onSelect, onPlace, onExplore, inspectedPoint, pointContent, edgeContent, locationContent }: {
  points?: Point[]; edges?: Edge[]; onSelect?: (id: string) => void; onPlace?: (lat: number, lng: number) => void;
  onExplore?: (lat: number, lng: number) => void; inspectedPoint?: { lat: number; lng: number };
  pointContent?: (id: string) => ReactNode; edgeContent?: (index: number) => ReactNode; locationContent?: ReactNode;
}) {
  const [tileErrors, setTileErrors] = useState(0);
  points = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
  return <div className={`ct-campus-map${onPlace ? ' is-placing' : ''}`}><MapContainer className="ct-geo-map" center={CTU_CAMPUS.center} zoom={CTU_CAMPUS.zoom} scrollWheelZoom={false}>
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' eventHandlers={{ tileerror: () => setTileErrors(count => count + 1), tileload: () => setTileErrors(0) }} />
    <Bounds points={points} onPlace={onPlace} onExplore={onExplore} />
    {edges.map((edge, index) => { const from = points.find(point => point.id === edge.from), to = points.find(point => point.id === edge.to); return from && to ? <Fragment key={index}><Polyline
      positions={[[from.lat, from.lng], [to.lat, to.lng]]} pathOptions={{ color: edge.illustrative ? '#1b6c80' : edge.confirmed ? '#1d5fbf' : '#777', weight: 4, dashArray: edge.illustrative || !edge.confirmed ? '6 7' : undefined, bubblingMouseEvents: false }}><Tooltip>{from.name}{edge.directed ? ' → ' : ' ↔ '}{to.name} · {edge.illustrative ? 'Bố trí minh họa' : edge.confirmed ? 'Đã xác nhận' : 'AI gợi ý'}</Tooltip>{edgeContent ? <Popup>{edgeContent(index)}</Popup> : null}</Polyline>{edge.directed && edge.confirmed && !edge.illustrative ? <Direction from={from} to={to} /> : null}</Fragment> : null; })}
    {points.map((point, index) => <Marker key={point.id} position={[point.lat, point.lng]} title={point.name} alt={point.name} bubblingMouseEvents={false}
      icon={divIcon({ className: `ct-camera-map-pin${point.selected ? ' is-selected' : ''}${point.illustrative ? ' is-illustrative' : ''}`, iconSize: [30, 36], iconAnchor: [15, 34], html: `<span><b>${index + 1}</b></span>` })}
      eventHandlers={{ click: event => { DomEvent.stopPropagation(event.originalEvent); if (!pointContent) onSelect?.(point.id); } }}><Tooltip>{point.name}{point.illustrative ? ' · minh họa' : ''}</Tooltip>{pointContent ? <Popup>{pointContent(point.id)}</Popup> : null}</Marker>)}
    {inspectedPoint && locationContent ? <Popup key={`${inspectedPoint.lat}:${inspectedPoint.lng}`} position={[inspectedPoint.lat, inspectedPoint.lng]}>{locationContent}</Popup> : null}
  </MapContainer>{tileErrors >= 3 ? <p className="ct-map-unavailable" role="status">Chưa tải được nền bản đồ. <a href="https://www.openstreetmap.org/#map=16/10.03214/105.76763" target="_blank" rel="noreferrer">Mở OpenStreetMap</a></p> : null}</div>;
}

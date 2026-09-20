"use client";

import { Camera, MapPin, UserRound } from "lucide-react";
import type { DemoRoutePoint } from "@/lib/demo";

type RouteFilter = "all" | DemoRoutePoint["kind"];

type RouteGraphProps = {
  points: DemoRoutePoint[];
  selectedSequence: number;
  filter: RouteFilter;
  onSelect: (sequence: number) => void;
  onFilterChange: (filter: RouteFilter) => void;
};

const filters: { value: RouteFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "camera", label: "Camera" },
  { value: "interpolated", label: "Nội suy" },
];

export function RouteGraph({ points, selectedSequence, filter, onSelect, onFilterChange }: RouteGraphProps) {
  return (
    <section className="panel route-graph-panel" aria-labelledby="route-graph-title">
      <div className="panel-heading route-graph-heading">
        <div>
          <p className="section-kicker">Liên kết</p>
          <h2 id="route-graph-title">Đồ thị hành trình</h2>
          <p>Chọn một nút để xem vị trí và thời điểm tương ứng.</p>
        </div>
        <div className="route-graph-filters" role="group" aria-label="Lọc mốc trên đồ thị">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={filter === item.value ? "route-filter is-active" : "route-filter"}
              aria-pressed={filter === item.value}
              onClick={() => onFilterChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="route-graph-canvas">
        <svg className="route-graph-lines" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
          <path className="route-hub-line" d="M500 250 L250 120 M500 250 L750 120 M500 250 L250 380 M500 250 L750 380" />
          <path className="route-journey-line" d="M250 120 L750 120 L250 380 L750 380" />
        </svg>
        <div className="route-person-node" aria-label="Người cần tìm: DEMO-PERSON-001">
          <UserRound size={21} aria-hidden="true" />
          <span>Người cần tìm</span>
        </div>
        {points.map((point) => {
          const isSelected = point.sequence === selectedSequence;
          const isFilteredOut = filter !== "all" && point.kind !== filter;
          const isCamera = point.kind === "camera";
          return (
            <button
              key={point.sequence}
              type="button"
              className={`route-graph-node route-graph-node-${point.sequence}${isSelected ? " is-selected" : ""}${isFilteredOut ? " is-muted" : ""}`}
              aria-label={`Mốc ${point.sequence}, ${point.camera}, ${point.area}, ${point.time}${isSelected ? ", đang chọn" : ""}`}
              aria-pressed={isSelected}
              disabled={isFilteredOut}
              onClick={() => onSelect(point.sequence)}
            >
              <span className="route-node-top">
                <span className="route-node-icon">{isCamera ? <Camera size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}</span>
                <span>{point.time}</span>
              </span>
              <strong>{isCamera ? point.camera : `Mốc nội suy ${point.sequence - 1}`}</strong>
              <small>{point.area}</small>
            </button>
          );
        })}
      </div>
      <div className="route-graph-caption">
        <span>Đường nối: thứ tự di chuyển mô phỏng</span>
        <span>4 mốc · 2 camera</span>
      </div>
    </section>
  );
}

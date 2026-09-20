"use client";

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock3,
  MapPinned,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DEMO_QUERY, DEMO_ROUTE } from "@/lib/demo";

const CampusMap = dynamic(
  () => import("@/components/CampusMap").then((module) => module.CampusMap),
  {
    ssr: false,
    loading: () => <div className="campus-map-loading" role="status">Đang tải bản đồ vệ tinh…</div>,
  },
);

export function DemoResults() {
  return (
    <>
      <PageHeader
        eyebrow="Kết quả truy vấn"
        title="Hành trình người được nhận diện"
        description="Bản demo mô phỏng toàn bộ màn hình kết quả trước khi AI Worker được triển khai."
        action={
          <div className="header-actions">
            <Link className="button button-secondary" href="/search">
              <ArrowLeft size={17} aria-hidden="true" />
              Truy vấn mới
            </Link>
            <span className="demo-chip"><Sparkles size={15} aria-hidden="true" />Demo</span>
          </div>
        }
      />

      <div className="notice notice-demo" role="note">
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>Dữ liệu minh họa — chưa phải kết quả AI thật</strong>
          <p>Tuyến màu đỏ, các mốc camera và độ tương đồng 92% chỉ dùng để kiểm tra giao diện.</p>
        </div>
      </div>

      <section className="demo-metric-grid" aria-label="Tóm tắt kết quả demo">
        <DemoMetric label="Độ tương đồng" value="92%" detail="Vượt ngưỡng truy vấn" />
        <DemoMetric label="Camera đi qua" value="4" detail="2 camera · 2 mốc nội suy" />
        <DemoMetric label="Thời lượng" value={DEMO_QUERY.duration} detail="08:15:10 — 08:18:27" />
        <DemoMetric label="Định danh" value={DEMO_QUERY.personId} detail="Mô phỏng Re-ID" compact />
      </section>

      <div className="demo-query-strip panel">
        <div className="demo-query-person">
          <Image src="/demo/query_person.png" width={72} height={72} alt="Ảnh truy vấn demo người mặc áo xanh" />
          <div>
            <p className="section-kicker">Ảnh truy vấn</p>
            <h2>Người mặc áo xanh</h2>
            <p>{DEMO_QUERY.campus} · tìm trong khung giờ 08:00–09:00</p>
          </div>
        </div>
        <span className="result-status"><CheckCircle2 size={16} aria-hidden="true" />Đã hoàn tất</span>
      </div>

      <div className="demo-results-layout">
        <section className="panel demo-map-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Không gian</p>
              <h2>Đường đi trong Campus II</h2>
            </div>
            <span className="map-mode-label"><Route size={15} aria-hidden="true" />Vệ tinh</span>
          </div>
          <CampusMap points={DEMO_ROUTE} />
          <div className="map-legend" aria-label="Chú giải bản đồ">
            <span><i className="legend-dot legend-camera" />Camera thật</span>
            <span><i className="legend-dot legend-interpolated" />Mốc nội suy</span>
            <span><i className="legend-dot legend-last" />Vị trí cuối</span>
          </div>
        </section>

        <aside className="panel demo-trajectory-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Dòng thời gian</p>
              <h2>Các mốc di chuyển</h2>
            </div>
            <Clock3 size={18} aria-hidden="true" />
          </div>
          <ol className="demo-trajectory-list">
            {DEMO_ROUTE.map((point, index) => (
              <li key={point.sequence}>
                <span className={`demo-step-dot ${point.kind === "interpolated" ? "is-interpolated" : ""} ${index === DEMO_ROUTE.length - 1 ? "is-last" : ""}`}>
                  {point.sequence}
                </span>
                <div>
                  <strong>{point.camera}</strong>
                  <span><MapPinned size={13} aria-hidden="true" />{point.area}</span>
                  <small>{point.time} · {point.kind === "camera" ? "Camera" : "Nội suy"}</small>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="demo-footnote panel">
        <Camera size={18} aria-hidden="true" />
        <div>
          <strong>Khi AI Worker sẵn sàng</strong>
          <p>Màn hình này sẽ nhận kết quả thật từ `search_results` và `trajectory_points` trong Supabase, giữ nguyên cách trình bày để người vận hành không phải học lại.</p>
        </div>
      </section>
    </>
  );
}

function DemoMetric({ label, value, detail, compact = false }: { label: string; value: string; detail: string; compact?: boolean }) {
  return (
    <article className={`demo-metric ${compact ? "is-compact" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

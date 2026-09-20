"use client";

import {
  Camera,
  ChartNoAxesCombined,
  FileVideo,
  MapPinned,
  Menu,
  Radar,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const navigation = [
  { href: "/", label: "Tổng quan", icon: ChartNoAxesCombined },
  { href: "/cameras", label: "Camera", icon: Camera },
  { href: "/videos", label: "Video", icon: FileVideo },
  { href: "/search", label: "Tìm kiếm người", icon: Search },
  { href: "/results/demo", label: "Kết quả demo", icon: MapPinned },
];

function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Chuyển đến nội dung chính
      </a>

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Radar size={23} strokeWidth={1.8} />
          </span>
          <span>
            <strong>NCKH</strong>
            <small>OUTLIER RE-ID</small>
          </span>
        </div>

        <button
          className="mobile-close"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMenuOpen(false)}
        >
          <X size={22} />
        </button>

        <nav aria-label="Điều hướng chính">
          <p className="nav-label">Không gian làm việc</p>
          <ul className="nav-list">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isCurrentPath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    className={active ? "nav-link active" : "nav-link"}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-foot">
          <span className="pulse-dot" aria-hidden="true" />
          <div>
            <strong>Research prototype</strong>
            <small>Supabase · FastAPI · Next.js</small>
          </div>
        </div>
      </aside>

      {menuOpen ? (
        <button
          className="scrim"
          type="button"
          aria-label="Đóng menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            type="button"
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="topbar-title">
            <span>Hệ thống truy vết đa camera</span>
            <small>Phân tích người bất thường bằng Re-ID</small>
          </div>
          <ConnectionBadge />
        </header>

        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function ConnectionBadge() {
  const [state, setState] = useState<"checking" | "ready" | "setup" | "offline">("checking");

  useEffect(() => {
    let active = true;
    apiFetch<{ supabase_configured: boolean }>("/health")
      .then((health) => {
        if (active) setState(health.supabase_configured ? "ready" : "setup");
      })
      .catch(() => {
        if (active) setState("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  const labels = {
    checking: "Đang kiểm tra",
    ready: "Đã cấu hình Supabase",
    setup: "Chưa nối Supabase",
    offline: "API ngoại tuyến",
  };

  return (
    <div className={`connection-badge connection-${state}`} role="status">
      <span className="connection-dot" aria-hidden="true" />
      {labels[state]}
    </div>
  );
}

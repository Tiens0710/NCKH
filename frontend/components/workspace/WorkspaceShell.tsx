"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Camera, ChevronDown, Download, MapPinned, Menu, Search, Video, X, History, ScanLine, Settings2, FileText } from "lucide-react";
import { VIEW_NAMES, type WorkspaceView } from "@/lib/workspace-types";
import { downloadJson, useWorkspace } from "./WorkspaceProvider";
import { Modal } from "./Modal";

const icons = { overview: Camera, cameras: Camera, videos: Video, people: Search, journey: MapPinned, history: History };
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const app = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Đại học Cần Thơ · Khu II");
  async function create() {
    setBusy(true); app.setError("");
    try { await app.create(name); setSettings(false); }
    catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function restore(file?: File) {
    if (!file) return;
    setBusy(true); app.setError("");
    try { if (file.size > 4096) throw new Error("File không hợp lệ."); const saved = JSON.parse(await file.text());
      if (saved.kind !== "campus-trace-workspace") throw new Error("Chọn file sao lưu quyền truy cập Campus Trace.");
      await app.restore(saved); setSettings(false);
    } catch (failure) { app.setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="ct-app ct-operator">
    <a className="ct-skip" href="#main-content">Đến nội dung chính</a>
    <header className="ct-header"><div className="ct-header-inner">
      <Link href="/workspace" className="ct-brand"><ScanLine size={24} strokeWidth={1.6} /><span>Campus Trace<small>Đại học Cần Thơ</small></span></Link>
      <div className="ct-header-actions"><span className="ct-gpu" role="status"><i className={app.online ? "online" : ""} />{app.online === null ? "Đang kết nối" : app.online ? "Phân tích sẵn sàng" : "Phân tích đang tắt"}</span>
        <button className="ct-workspace-switch" onClick={() => setSettings(true)}><span>{app.data?.name ?? "Không gian riêng"}</span><ChevronDown size={14} /></button>
        <button className="ct-mobile-menu" aria-label={menu ? "Đóng điều hướng" : "Mở điều hướng"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></div>
    </div></header>
    <nav className={`ct-navigation ${menu ? "is-open" : ""}`} aria-label="Chức năng chính"><div><span className="ct-nav-label">Giám sát</span>{(['overview', 'people'] as WorkspaceView[]).map(view => {
      const href = "/workspace", Icon = icons[view];
      const active = view === "people" ? path === "/workspace/people" || path === "/workspace" && app.searchOpen : path === "/workspace" && !app.searchOpen;
      return <Link key={view} href={href} aria-current={active ? "page" : undefined} onClick={() => { setMenu(false); app.setSearchOpen(view === "people"); }}><Icon size={16} strokeWidth={1.6} />{VIEW_NAMES[view]}</Link>;
    })}<Link href="/workspace/journey" aria-current={path === '/workspace/journey' ? 'page' : undefined} onClick={() => setMenu(false)}><MapPinned size={16} />Hành trình & đối chiếu</Link>
    <details className="ct-nav-tools" key={path} open={['/workspace/videos','/workspace/cameras','/workspace/history'].includes(path)}><summary><Settings2 size={16} />Quản lý<ChevronDown size={14} /></summary><div>{(['videos','cameras','history'] as WorkspaceView[]).map(view => { const Icon = icons[view]; return <Link key={view} href={`/workspace/${view}`} aria-current={path === `/workspace/${view}` ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={15} />{view === 'videos' ? 'Nguồn video & phân tích' : view === 'cameras' ? 'Kết nối & vị trí camera' : 'Lịch sử & xuất dữ liệu'}</Link>; })}</div></details>
    <div className="ct-nav-tail"><Link href="/workspace/report" aria-current={path === '/workspace/report' ? 'page' : undefined} onClick={() => setMenu(false)}><FileText size={16} />Báo cáo hệ thống</Link><button className="ct-nav-settings" onClick={() => { setMenu(false); setSettings(true); }}>Không gian & quyền truy cập</button><small>Khu II · Cần Thơ</small></div></div></nav>
    <main id="main-content" className="ct-main">
      {app.error ? <div className="ct-message ct-error" role="alert"><span>{app.error}</span><button onClick={() => { app.setError(""); void app.refresh().catch(failure => app.setError(failure.message)); }}>Thử lại</button></div> : null}
      {app.replay && path !== '/workspace' ? <div className="ct-message ct-sample-notice"><span><strong>Kết quả mẫu MARS</strong> · Chưa có tọa độ trường.</span><Link href="/workspace/videos">Phân tích video mới</Link></div> : null}
      {children}
    </main>
    {settings ? <Modal titleId="workspace-settings-title" onClose={() => !busy && setSettings(false)}>
      <div className="ct-section-head"><h2 id="workspace-settings-title">Không gian riêng tư</h2><button aria-label="Đóng" onClick={() => setSettings(false)}><X size={18} /></button></div>
      {app.access ? <><p>{app.data?.name ?? "Không gian đang mở"}. Camera, lịch sử và ghi chú được lưu trên máy chủ. Trình duyệt chỉ giữ quyền truy cập.</p>
        <button className="ct-button ct-primary" onClick={() => downloadJson({ kind: "campus-trace-workspace", ...app.access }, "campus-trace-access.json")}><Download size={16} />Sao lưu quyền truy cập</button>
        <p className="ct-muted">Giữ file này riêng tư. Nó cho phép mở dữ liệu của không gian trên máy khác. Không gian hiện chưa phân vai người quản trị.</p></> : null}
      {!app.access ? <><label>Tên không gian<input value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
        <button className="ct-button ct-primary" disabled={busy || !name.trim()} onClick={create}>{busy ? "Đang tạo…" : "Tạo không gian riêng"}</button></> : null}
      <label className="ct-file-control">Mở từ file sao lưu<input type="file" accept="application/json,.json" disabled={busy} onChange={event => { void restore(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      <p className="ct-muted">Mỗi không gian có quyền truy cập riêng. Không gửi file quyền truy cập hoặc mật khẩu camera vào bài báo.</p>
    </Modal> : null}
  </div>;
}

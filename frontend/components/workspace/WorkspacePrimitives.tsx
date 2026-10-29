"use client";
import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FolderOpen, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "./WorkspaceProvider";

export function ScreenTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="ct-title-row"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return <div className="ct-empty"><Icon size={24} strokeWidth={1.4} /><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function NeedWorkspace() {
  const app = useWorkspace();
  const [name, setName] = useState('Đại học Cần Thơ · Khu II');
  const [busy, setBusy] = useState(false);
  return <section className="ct-onboarding"><div><FolderOpen size={20} /><h2>Lưu camera và video của bạn</h2><p>Camera, lịch sử và quyết định đối chiếu được lưu riêng trên máy chủ.</p></div>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); void app.create(name).catch(failure => app.setError(failure.message)).finally(() => setBusy(false)); }}>
      <label className="ct-sr-only" htmlFor="new-workspace-name">Tên không gian</label><input id="new-workspace-name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} />
      <button className="ct-button ct-primary" disabled={busy || app.loading}>{busy || app.loading ? 'Đang mở…' : 'Bắt đầu'}</button>
    </form></section>;
}
export function NoResult() {
  const app = useWorkspace(), router = useRouter();
  return <EmptyState icon={Play} title={app.job && app.job.status !== 'completed' ? app.job.stage : 'Chưa mở kết quả'} text="Phân tích video mới hoặc mở kết quả mẫu đã xử lý trước để xem cách đối chiếu người và hành trình."
    action={<div className="ct-inline-actions"><Link className="ct-button ct-primary" href="/workspace/videos">Chọn video</Link><button className="ct-button" onClick={() => void app.showReplay().then(() => router.push('/workspace/people')).catch(failure => app.setError(failure.message))}>Xem kết quả mẫu</button></div>} />;
}

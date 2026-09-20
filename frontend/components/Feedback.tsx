import { AlertCircle, Inbox } from "lucide-react";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
      <div>
        <strong>Chưa lấy được dữ liệu</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state" role="status">
      <Inbox size={28} strokeWidth={1.6} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="loading-stack" aria-label="Đang tải dữ liệu" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  );
}


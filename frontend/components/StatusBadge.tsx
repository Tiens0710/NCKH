const labels: Record<string, string> = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  failed: "Thất bại",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true" />
      {labels[status] ?? status}
    </span>
  );
}


// Production uses Next.js rewrites so the browser stays on one origin.
// Local development can still point directly at FastAPI through .env.local.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = init?.method === "POST" ? 120_000 : 15_000,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted) forwardAbort();
  init?.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : Array.isArray(body?.detail)
            ? body.detail
                .map((item) =>
                  typeof item?.msg === "string"
                    ? item.msg
                    : "Dữ liệu không hợp lệ",
                )
                .join("; ")
            : "Yêu cầu API không thành công.";
      const needsSupabaseKey =
        response.status === 503 &&
        (detail.includes("SUPABASE_SECRET_KEY") ||
          detail.includes("SUPABASE_SERVICE_ROLE_KEY"));
      throw new ApiError(
        needsSupabaseKey
          ? "Backend đã chạy nhưng chưa có SUPABASE_SECRET_KEY trong tệp .env."
          : detail,
        response.status,
      );
    }
    return (await response.json().catch(() => {
      throw new ApiError(
        "API trả về dữ liệu không hợp lệ. Hãy kiểm tra log backend.",
        502,
      );
    })) as T;
  } catch (reason) {
    if (init?.signal?.aborted) throw reason;
    if (controller.signal.aborted)
      throw new ApiError(
        "API phản hồi quá lâu. Hãy kiểm tra backend và thử lại.",
        408,
      );
    if (reason instanceof ApiError) throw reason;
    throw new ApiError(
      "Không kết nối được API. Hãy kiểm tra backend FastAPI đang chạy.",
      0,
    );
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", forwardAbort);
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

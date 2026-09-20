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
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Không kết nối được API. Hãy kiểm tra backend FastAPI đang chạy.",
      0,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    const needsSupabaseKey =
      response.status === 503 &&
      (body?.detail?.includes("SUPABASE_SECRET_KEY") ||
        body?.detail?.includes("SUPABASE_SERVICE_ROLE_KEY"));
    throw new ApiError(
      needsSupabaseKey
        ? "Backend đã chạy nhưng chưa có SUPABASE_SECRET_KEY trong tệp .env."
        : body?.detail ?? "Yêu cầu API không thành công.",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

import { failure, jobAuth, QueueError } from "@/lib/demo-queue";
import { understandPersonQuery } from "@/lib/gemini-person-search";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const job = await jobAuth(request, (await context.params).id);
    if (job.status !== "completed") throw new QueueError("Đợi video xử lý xong trước khi tìm người.", 409);
    const raw = await request.text();
    if (raw.length > 4096) throw new QueueError("Mô tả quá dài.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new QueueError("Mô tả không hợp lệ."); }
    return Response.json({ intent: await understandPersonQuery(body?.query) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

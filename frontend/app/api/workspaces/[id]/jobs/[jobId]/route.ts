import { deleteJob, failure, jsonBody, QueueError, resumeUploadTargets, submit, view, type Job } from "@/lib/demo-queue";
import { ownedJob, removeJobIndex, reviews, workspaceAuth } from "@/lib/workspace-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; jobId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id, jobId } = await context.params, owner = await workspaceAuth(request, id);
    const job = await ownedJob(owner, jobId);
    const [data, notes] = await Promise.all([view(job), reviews(owner, jobId)]);
    return Response.json({ ...data, reviews: notes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id, jobId } = await context.params, owner = await workspaceAuth(request, id);
    const job = await ownedJob(owner, jobId);
    const body = request.headers.get("content-type")?.includes("application/json") ? await jsonBody(request) : {};
    return Response.json(body?.action === "uploads" ? { uploads: await resumeUploadTargets(job) } : await submit(job), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id, jobId } = await context.params, owner = await workspaceAuth(request, id);
    let job: Job;
    try { job = await ownedJob(owner, jobId); }
    catch (error) {
      // If deletion succeeded before a transport failure, retry only cleans this owner's index.
      if (error instanceof QueueError && error.status === 404) { await removeJobIndex(owner, jobId); return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }); }
      throw error;
    }
    if (job.status === "processing" && Date.now() - job.updated_at < 120000) return Response.json({ error: "Đợi phiên đang xử lý hoàn thành trước khi xóa." }, { status: 409 });
    await deleteJob(job);
    await removeJobIndex(owner, jobId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

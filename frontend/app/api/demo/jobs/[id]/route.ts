import { deleteJob, failure, jobAuth, submit, view } from "@/lib/demo-queue";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: Context) {
  try { return Response.json(await deleteJob(await jobAuth(request, (await context.params).id))); }
  catch (error) { return failure(error); }
}
export async function GET(request: Request, context: Context) {
  try { return Response.json(await view(await jobAuth(request, (await context.params).id)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try { return Response.json(await submit(await jobAuth(request, (await context.params).id))); }
  catch (error) { return failure(error); }
}

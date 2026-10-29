import { failure, jsonBody } from "@/lib/demo-queue";
import { mutateWorkspace, snapshot, workspaceAuth } from "@/lib/workspace-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await snapshot(await workspaceAuth(request, (await context.params).id)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try { const owner = await workspaceAuth(request, (await context.params).id); return Response.json(await mutateWorkspace(request, owner, await jsonBody(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

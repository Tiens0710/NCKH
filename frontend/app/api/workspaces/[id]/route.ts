import { failure, jsonBody } from "@/lib/demo-queue";
import { mutateWorkspace, snapshot, workspaceAuth } from "@/lib/workspace-store";
import { logOperation } from "@/lib/workspace-operations";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return Response.json(await snapshot(await workspaceAuth(request, (await context.params).id)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try { const owner = await workspaceAuth(request, (await context.params).id); const body = await jsonBody(request); const data = await mutateWorkspace(request, owner, body); await logOperation(owner, String(body.action), String(data.id ?? "")).catch(() => {}); return Response.json(data, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

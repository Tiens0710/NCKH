import { failure, jsonBody } from "@/lib/demo-queue";
import { createWorkspace } from "@/lib/workspace-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const body = await jsonBody(request); return Response.json(await createWorkspace(request, body?.name), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

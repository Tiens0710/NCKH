import { createJob, failure, heartbeat, jsonBody } from "@/lib/demo-queue";
export const runtime = "nodejs";
export async function GET() {
  try { return Response.json({ worker_online: await heartbeat() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await createJob(request, await jsonBody(request))); }
  catch (error) { return failure(error); }
}

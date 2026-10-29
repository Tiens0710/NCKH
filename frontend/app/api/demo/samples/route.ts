import { createSampleJob, failure, jsonBody } from "@/lib/demo-queue";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json(await createSampleJob(request, (await jsonBody(request)).sample_id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

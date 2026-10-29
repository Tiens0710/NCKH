import { failure, jsonBody, workerAction, workerAuth } from "@/lib/demo-queue";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { workerAuth(request); return Response.json(await workerAction(await jsonBody(request))); }
  catch (error) { return failure(error); }
}

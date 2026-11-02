import { failure, jsonBody, QueueError } from '@/lib/demo-queue';
import { ownedJob, workspaceAuth } from '@/lib/workspace-store';
import { understandPersonQuery } from '@/lib/gemini-person-search';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{id:string;jobId:string}>}){try{const {id,jobId}=await context.params;const owner=await workspaceAuth(request,id);const job=await ownedJob(owner,jobId);if(job.status!=='completed')throw new QueueError('Phiên chưa hoàn thành.',409);const body=await jsonBody(request);return Response.json({intent:await understandPersonQuery(body.query)},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}

import { failure, jsonBody } from '@/lib/demo-queue';
import { workspaceAuth } from '@/lib/workspace-store';
import { mutateOperations, operationsSnapshot } from '@/lib/workspace-operations';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{return Response.json(await operationsSnapshot(await workspaceAuth(request,(await context.params).id)),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{return Response.json(await mutateOperations(await workspaceAuth(request,(await context.params).id),await jsonBody(request)),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { listStorageObjects, read, write, QueueError } from './demo-queue';
import { ownedJob, workspaceAuth } from './workspace-store';
import type { PublicDemoResult } from './public-demo';
import type { SavedSubject, Incident, CampusZone, AuditEvent, OperationsSnapshot } from './operations-types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Owner=Awaited<ReturnType<typeof workspaceAuth>>;
const base=(owner: Owner)=>`workspaces/${owner.id}/operations`;
function text(value:unknown,max:number,optional=false){if(typeof value!=='string'||value.length>max||!optional&&!value.trim())throw new QueueError('Nội dung không hợp lệ.');return value.trim();}
function id(value:unknown){if(typeof value!=='string'||!uuid.test(value))throw new QueueError('Mã dữ liệu không hợp lệ.');return value;}
async function list<T>(prefix:string,cap=200):Promise<T[]>{const names:string[]=[];for(let offset=0;offset<cap;offset+=100){const page=await listStorageObjects(prefix,100,offset,"desc");names.push(...page.filter(p=>uuid.test(p.name.replace(/\.json$/,''))).map(p=>p.name));if(page.length<100)break;}const data:T[]=[];for(let i=0;i<names.length;i+=8){const values=await Promise.all(names.slice(i,i+8).map(name=>read<T>(`${prefix}/${name}`)));data.push(...values.filter((v):v is Awaited<T>=>v!==null));}return data;}
export async function logOperation(owner:Owner,action:string,target=''){const event:AuditEvent={id:randomUUID(),action:action.slice(0,80),target:target.slice(0,120),at:Date.now(),actor:'workspace-access'};await write(`${base(owner)}/audit/${event.id}.json`,event,false);}
export async function operationsSnapshot(owner:Owner):Promise<OperationsSnapshot>{const [subjects,incidents,zones,audit]=await Promise.all([list<SavedSubject>(`${base(owner)}/subjects`),list<Incident>(`${base(owner)}/incidents`),list<CampusZone>(`${base(owner)}/zones`,100),list<AuditEvent>(`${base(owner)}/audit`,500)]);return {subjects:subjects.sort((a,b)=>b.updated_at-a.updated_at),incidents:incidents.sort((a,b)=>b.updated_at-a.updated_at),zones:zones.filter(z=>!z.archived),audit:audit.sort((a,b)=>b.at-a.at)};}
async function evidence(owner:Owner,jobId:unknown,trackKey:unknown){const job=await ownedJob(owner,id(jobId));if(job.status!=='completed')throw new QueueError('Phiên chưa hoàn thành.',409);const result=await read<PublicDemoResult>(`jobs/${job.id}/outputs/result.json`);const key=text(trackKey,100);const track=result?.tracks.find(t=>t.track_key===key);if(!track)throw new QueueError('Đoạn theo dõi không thuộc phiên.');const camera=result?.cameras?.find(c=>c.camera_id===track.camera_id);const times=camera?.frames?.filter(f=>f.detections.some(d=>d.local_track_id===track.local_track_id)).map(f=>f.time_seconds).filter(Number.isFinite)??[];return {job_id:job.id,track_key:key,camera_id:track.camera_id,time_seconds:times.length?Math.min(...times):0};}
export async function mutateOperations(owner:Owner,body:Record<string,unknown>){const action=String(body.action),now=Date.now();let target='';
 if(action==='save_subject'){
  const recordId=body.id?id(body.id):randomUUID(),old=body.id?await read<SavedSubject>(`${base(owner)}/subjects/${recordId}.json`):null;
  if(body.id&&!old)throw new QueueError('Không tìm thấy hồ sơ.',404);
  if(!old&&(await list(`${base(owner)}/subjects`)).length>=200)throw new QueueError('Đã đạt giới hạn 200 hồ sơ.',409);
  const ref=old?{job_id:old.job_id,track_key:old.track_key,camera_id:old.camera_id,time_seconds:old.time_seconds}:await evidence(owner,body.job_id,body.track_key);
  if(typeof body.watched!=='boolean'||typeof body.archived!=='boolean')throw new QueueError('Trạng thái hồ sơ không hợp lệ.');
  const record:SavedSubject={...ref,id:recordId,label:text(body.label,80),note:text(body.note??'',1000,true),watched:body.watched,archived:body.archived,created_at:old?.created_at??now,updated_at:now};await write(`${base(owner)}/subjects/${recordId}.json`,record);target=recordId;
 }else if(action==='save_incident'){
  const recordId=body.id?id(body.id):randomUUID(),old=body.id?await read<Incident>(`${base(owner)}/incidents/${recordId}.json`):null;
  if(body.id&&!old)throw new QueueError('Không tìm thấy sự kiện.',404);
  if(!old&&(await list(`${base(owner)}/incidents`)).length>=200)throw new QueueError('Đã đạt giới hạn 200 sự kiện.',409);
  if(!['normal','high'].includes(String(body.priority))||!['open','reviewing','closed'].includes(String(body.status)))throw new QueueError('Trạng thái sự kiện không hợp lệ.');
  const ref=old?{job_id:old.job_id,track_key:old.track_key}:body.job_id?await evidence(owner,body.job_id,body.track_key):{};
  const record:Incident={...ref,id:recordId,title:text(body.title,120),note:text(body.note??'',2000,true),priority:body.priority as Incident['priority'],status:body.status as Incident['status'],created_at:old?.created_at??now,updated_at:now};await write(`${base(owner)}/incidents/${recordId}.json`,record);target=recordId;
 }else if(action==='archive_zone'){
  const recordId=id(body.id),old=await read<CampusZone>(`${base(owner)}/zones/${recordId}.json`);if(!old)throw new QueueError('Không tìm thấy vùng.',404);await write(`${base(owner)}/zones/${recordId}.json`,{...old,archived:true,updated_at:now});target=recordId;
 }else if(action==='save_zone'){
  const recordId=body.id?id(body.id):randomUUID(),old=body.id?await read<CampusZone>(`${base(owner)}/zones/${recordId}.json`):null;
  if(body.id&&!old)throw new QueueError('Không tìm thấy vùng.',404);
  if(!old&&(await list(`${base(owner)}/zones`,100)).length>=32)throw new QueueError('Tối đa 32 vùng.',409);
  if(!Array.isArray(body.points)||body.points.length<3||body.points.length>64)throw new QueueError('Vùng cần 3–64 điểm.');
  const points: [number,number][]=body.points.map(point=>{if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>90||Math.abs(point[1])>180)throw new QueueError('Tọa độ vùng không hợp lệ.');return [point[0],point[1]];});
  const area=Math.abs(points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0));if(area<1e-12)throw new QueueError('Các điểm không tạo thành vùng hợp lệ.');
  await write(`${base(owner)}/zones/${recordId}.json`,{id:recordId,name:text(body.name,80),points,created_at:old?.created_at??now,updated_at:now});target=recordId;
 }else throw new QueueError('Thao tác không được hỗ trợ.');
 let warning:string|undefined;try{await logOperation(owner,action,target);}catch{warning='Dữ liệu đã được lưu nhưng chưa ghi được nhật ký. Vui lòng kiểm tra kết nối.';}return {ok:true,id:target,warning};
}

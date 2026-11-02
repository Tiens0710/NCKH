import type { PublicDemoResult } from './public-demo';
export function sessionStats(result:PublicDemoResult|null|undefined,cameraId='') {
 const cameras=(result?.cameras??[]).filter(c=>!cameraId||c.camera_id===cameraId);
 const frames=cameras.flatMap(c=>c.frames.filter(f=>Number.isFinite(f.time_seconds)).map(f=>({...f,cameraId:c.camera_id})));
 const total=frames.reduce((n,f)=>n+f.detections.length,0),withPeople=frames.filter(f=>f.detections.length>0).length;
 const duration=Math.max(0,...cameras.map(c=>c.duration_seconds));
 const buckets=Array.from({length:10},(_,i)=>({start:duration*i/10,end:duration*(i+1)/10,count:0}));
 for(const f of frames){const index=duration?Math.min(9,Math.max(0,Math.floor(f.time_seconds/duration*10))):0;buckets[index].count+=f.detections.length;}
 const byCamera=cameras.map(c=>({id:c.camera_id,name:c.name,frames:c.frames.length,detections:c.frames.reduce((n,f)=>n+f.detections.length,0),tracks:result?.tracks.filter(t=>t.camera_id===c.camera_id).length??0,located:!!c.location}));
 return {cameras:cameras.length,frames:frames.length,detections:total,withPeople,tracks:byCamera.reduce((n,c)=>n+c.tracks,0),duration,buckets,byCamera,synchronized:cameras.length>0&&cameras.every(c=>c.timeline_known===true)};
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const objects = new Map(), modules = new Map(); let order = 0;
  const response = (body, status = 200) => Response.json(body, { status });
  const fetch = async (url, init = {}) => {
    const route = new URL(url).pathname.replace('/storage/v1', '');
    const body = init.body ? JSON.parse(init.body) : null;
    if (route === '/object/list/multicam-demo') return response([...objects].filter(([key]) => key.startsWith(body.prefix + '/') && !key.slice(body.prefix.length + 1).includes('/'))
      .sort((a, b) => a[1].order - b[1].order).slice(body.offset ?? 0, (body.offset ?? 0) + body.limit)
      .map(([key, value]) => ({ name: key.slice(body.prefix.length + 1), metadata: value.metadata })));
    if (route.startsWith('/object/sign/') || route.startsWith('/object/upload/sign/')) return response({ url: route + '?token=test', signedURL: route + '?token=test' });
    if (route.startsWith('/object/authenticated/')) {
      const key = route.replace('/object/authenticated/multicam-demo/', '');
      return objects.has(key) ? response(objects.get(key).value) : response({}, 404);
    }
    if (route === '/object/multicam-demo' && init.method === 'DELETE') { body.prefixes.forEach(key => objects.delete(key)); return response([]); }
    const key = route.replace('/object/multicam-demo/', '');
    if (objects.has(key) && init.headers['x-upsert'] === 'false') return response({ error: 'Duplicate', statusCode: '409' }, 409);
    objects.set(key, { value: body, order: order++ }); return response({ Key: key });
  };
  function load(filename) {
    const absolute = path.resolve(filename);
    if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const target = { exports: {} }; modules.set(absolute, target);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: target, exports: target.exports,
      require: name => name === 'server-only' ? {} : name.startsWith('@/') ? load(path.resolve(name.replace('@/', '') + '.ts')) : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name.endsWith('.json') ? name : name + '.ts')) : require(name),
      process: { env: { SUPABASE_URL: 'https://storage.test', SUPABASE_SECRET_KEY: 'admin-test', MULTICAM_WORKER_TOKEN: 'worker-test' } },
      fetch, Response, Request, AbortSignal, Buffer, console, URL,
    });
    return target.exports;
  }
  return { load, store: load('lib/workspace-store.ts'), ops: load('lib/workspace-operations.ts'), objects }; 
}
const req = token => new Request('https://app.test/api/workspaces',{headers:{Authorization:`Bearer ${token??''}`,'x-vercel-forwarded-for':'192.0.2.10'}});
async function owners(f){const a=await f.store.createWorkspace(req(),'A'),b=await f.store.createWorkspace(req(),'B');return {a:await f.store.workspaceAuth(req(a.token),a.id),b:await f.store.workspaceAuth(req(b.token),b.id)};}
const jobId='0a36c39c-e3cc-4d14-ae33-361e8ee40882';
function seed(f,owner){f.objects.set(`workspaces/${owner.id}/jobs/${jobId}.json`,{value:{id:jobId},order:1});f.objects.set(`jobs/${jobId}/state.json`,{value:{id:jobId,status:'completed'},order:2});f.objects.set(`jobs/${jobId}/outputs/result.json`,{value:{tracks:[{track_key:'CAM-1:1',camera_id:'CAM-1'}]},order:3});}
test('subjects require owned completed evidence and remain isolated across workspaces',async()=>{const f=fixture(),{a,b}=await owners(f);seed(f,a);const body={action:'save_subject',job_id:jobId,track_key:'CAM-1:1',label:'Đối tượng tham chiếu',note:'Ghi chú riêng',watched:true,archived:false};await assert.rejects(f.ops.mutateOperations(b,body),e=>e.status===404);await assert.rejects(f.ops.mutateOperations(a,{...body,track_key:'invented'}));const saved=await f.ops.mutateOperations(a,body);const data=await f.ops.operationsSnapshot(a);assert.equal(data.subjects.length,1);assert.equal(data.audit.length,1);assert.equal((await f.ops.operationsSnapshot(b)).subjects.length,0);await assert.rejects(f.ops.mutateOperations(b,{...body,id:saved.id}));await f.ops.mutateOperations(a,{...body,id:saved.id,archived:true});assert.equal((await f.ops.operationsSnapshot(a)).subjects[0].archived,true);assert.ok(!JSON.stringify(data.audit).includes('Ghi chú riêng'));});
test('incident workflow persists statuses without inventing AI matches or permitting foreign links',async()=>{const f=fixture(),{a,b}=await owners(f);seed(f,a);const body={action:'save_incident',title:'Cần đối chiếu',note:'Nội dung',priority:'high',status:'open'};const saved=await f.ops.mutateOperations(a,body);await f.ops.mutateOperations(a,{...body,id:saved.id,status:'closed'});assert.equal((await f.ops.operationsSnapshot(a)).incidents[0].status,'closed');await assert.rejects(f.ops.mutateOperations(a,{...body,status:'dispatched'}));await assert.rejects(f.ops.mutateOperations(b,{...body,job_id:jobId,track_key:'CAM-1:1'}));assert.equal((await f.ops.operationsSnapshot(b)).incidents.length,0);});
test('zones validate polygon geometry and bounded coordinates before storage',async()=>{const f=fixture(),{a}=await owners(f);const body={action:'save_zone',name:'Vùng A',points:[[10,105],[10.001,105],[10.001,105.001]]};await assert.rejects(f.ops.mutateOperations(a,{...body,points:[[10,105],[10,105]]}));await assert.rejects(f.ops.mutateOperations(a,{...body,points:[[10,105],[10,105],[10,105]]}));await assert.rejects(f.ops.mutateOperations(a,{...body,points:[[99,105],[10,105],[10,106]]}));await f.ops.mutateOperations(a,body);assert.equal((await f.ops.operationsSnapshot(a)).zones.length,1);});
test('session statistics derive counts from observations and conserve histogram totals',()=>{const target={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/session-analytics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:target,exports:target.exports});const s=target.exports.sessionStats({cameras:[{camera_id:'a',name:'A',duration_seconds:10,timeline_known:false,frames:[{time_seconds:0,detections:[{},{}]},{time_seconds:10,detections:[{}]}]}],tracks:[{camera_id:'a'}]});assert.equal(s.frames,2);assert.equal(s.detections,3);assert.equal(s.tracks,1);assert.equal(s.synchronized,false);assert.equal(s.buckets.reduce((n,b)=>n+b.count,0),3);assert.equal(target.exports.sessionStats(null).detections,0);});

test('operations and natural-language endpoints authenticate ownership before reading data or calling AI',async()=>{const f=fixture();const a=await f.store.createWorkspace(req(),'A');const operations=f.load('app/api/workspaces/[id]/operations/route.ts');const context={params:Promise.resolve({id:a.id})};assert.equal((await operations.GET(req(),context)).status,401);assert.equal((await operations.POST(new Request('https://app.test',{method:'POST',body:JSON.stringify({action:'save_incident'})}),context)).status,401);const search=f.load('app/api/workspaces/[id]/jobs/[jobId]/search/route.ts');const ctx={params:Promise.resolve({id:a.id,jobId})};assert.equal((await search.POST(new Request('https://app.test',{method:'POST',body:'{}'}),ctx)).status,401);assert.equal((await search.POST(new Request('https://app.test',{method:'POST',headers:{Authorization:`Bearer ${a.token}`},body:'{}'}),ctx)).status,404);});

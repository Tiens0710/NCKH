const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const objects = new Map();
  const output = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('lib/demo-queue.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const response = (value, status = 200) => Response.json(value, { status });
  const fetchMock = async (url, init = {}) => {
    const route = new URL(url).pathname.replace('/storage/v1', '');
    const body = init.body ? JSON.parse(init.body) : null;
    if (route === '/object/list/multicam-demo') return response([...objects].filter(([path]) => path.startsWith(body.prefix + '/'))
      .map(([path, value]) => ({ name: path.slice(body.prefix.length + 1), metadata: value.metadata })));
    if (route.startsWith('/object/upload/sign/') || route.startsWith('/object/sign/'))
      return response({ url: route + '?token=fake', signedURL: route + '?token=fake' });
    if (route.startsWith('/object/authenticated/')) {
      const path = route.replace('/object/authenticated/multicam-demo/', '');
      return objects.has(path) ? response(objects.get(path).value) : response({}, 404);
    }
    if (route === '/object/multicam-demo' && init.method === 'DELETE') {
      body.prefixes.forEach(path => objects.delete(path)); return response([]);
    }
    const path = route.replace('/object/multicam-demo/', '');
    if (objects.has(path) && init.headers['x-upsert'] === 'false') return response({ statusCode: '409', error: 'Duplicate' }, 400);
    objects.set(path, { value: body }); return response({ Key: path });
  };
  vm.runInNewContext(source, { module: output, exports: output.exports,
    require: name => {
      if (name === 'server-only') return {};
      if (name === './demo-samples') {
        const data = { exports: {} };
        vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/demo-samples.ts','utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText, { module: data, exports: data.exports,
          require: moduleName => moduleName === './demo-open-datasets.generated.json' ? JSON.parse(fs.readFileSync('lib/demo-open-datasets.generated.json','utf8')) : require(moduleName) });
        return data.exports;
      }
      return require(name);
    },
    process: { env: { SUPABASE_URL: 'https://storage.test', SUPABASE_SECRET_KEY: 'test-admin', MULTICAM_WORKER_TOKEN: 'test-worker' } },
    fetch: fetchMock, Response, Request, AbortSignal, Buffer, console });
  return { queue: output.exports, objects };
}
const guest = token => new Request('https://demo.test/api/demo/jobs', { headers: { authorization: `Bearer ${token}`, 'x-vercel-forwarded-for': '192.0.2.1' } });
const files = [{ name: 'one.mp4', size: 1000 }, { name: 'two.mp4', size: 2000 }];

test('recording metadata survives queue and view without guessed times or positions', async () => {
  const { queue, objects } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  const created = await queue.createJob(guest(''), { consent: true, files: [
    { ...files[0], camera_name: 'Gate', timeline_start_seconds: 15, location: { lat: 10, lng: 105 }, source_kind: 'rtsp_capture' }, files[1],
  ] });
  const job = await queue.jobAuth(guest(created.token), created.id);
  assert.equal(job.inputs[0].timeline_known, true);
  assert.equal(job.inputs[1].timeline_known, false);
  assert.equal(job.inputs[1].timeline_start_seconds, 0);
  assert.equal(job.inputs[1].location, undefined);
  job.inputs.forEach(input => objects.set(`jobs/${job.id}/${input.path}`, { metadata: { size: input.size } }));
  await queue.submit(job);
  const { job: claimed } = await queue.workerAction({ action: 'claim' });
  assert.equal(claimed.simulation, false);
  assert.equal(claimed.inputs[0].name, 'Gate');
  const result = { cameras: job.inputs.map(input => ({ camera_id: input.camera_id, location: { lat: 0, lng: 0 } })), tracks: [], links: [] };
  job.inputs.forEach(input => objects.set(`jobs/${job.id}/outputs/${input.camera_id}.mp4`, { metadata: { size: 10 } }));
  await queue.workerAction({ action: 'complete', id: job.id, claim: claimed.claim, result });
  const saved = objects.get(`jobs/${job.id}/outputs/result.json`).value;
  assert.equal(saved.cameras[0].location.lat, 10);
  assert.equal(saved.cameras[1].location, undefined);
  const view = await queue.view(await queue.jobAuth(guest(created.token), created.id));
  assert.equal(view.result.cameras[0].source_kind, 'rtsp_capture');
  assert.equal(view.result.cameras[1].timeline_known, false);
});

test('invalid offsets and camera coordinates cannot enter the GPU queue', async () => {
  const { queue } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  for (const fields of [ { timeline_start_seconds: NaN }, { timeline_start_seconds: -1 }, { timeline_start_seconds: true },
    { location: { lat: 91, lng: 1 } }, { location: { lat: 0, lng: Infinity } }, { location: null }, { camera_name: ' ' }, { source_kind: 'http' } ]) {
    await assert.rejects(queue.createJob(guest(''), { consent: true, files: [{ ...files[0], ...fields }, files[1]] }));
  }
});

test('durable history does not leave expired uploading or queued jobs spinning forever', async () => {
  const { queue } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  const created = await queue.createJob(guest(''), { consent: true, files });
  const job = await queue.jobAuth(guest(created.token), created.id);
  job.created_at = Date.now() - 3600001;
  assert.equal((await queue.view(job)).status, 'failed');
  job.status = 'queued'; job.created_at = Date.now() - 86400001;
  assert.equal((await queue.view(job)).status, 'failed');
});

test('legacy API proxy is fallback-only so native dynamic job routes win', async () => {
  const compiled = ts.transpileModule(fs.readFileSync('next.config.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const target = { exports: {} };
  vm.runInNewContext(compiled, { module: target, exports: target.exports, process: { env: {} } });
  const rules = await target.exports.default.rewrites();
  assert.equal(Array.isArray(rules), false);
  assert.equal(rules.afterFiles, undefined);
  assert.equal(rules.fallback.some(rule => rule.source === '/api/:path*'), true);
});

test('rejects offline uploads and invalid worker credentials', async () => {
  const { queue } = fixture();
  await assert.rejects(queue.createJob(guest(''), { consent: true, files }), /ngoại tuyến/);
  assert.throws(() => queue.workerAuth(guest('bad')), /Unauthorized/);
  assert.doesNotThrow(() => queue.workerAuth(guest('test-worker')));
});
test('rejects oversized, missing-consent and invalid camera counts before allocation', async () => {
  const { queue, objects } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  for (const body of [{ files, consent: false }, { files: [files[0]], consent: true },
    { files: [{ name: 'bad.exe', size: 1000 }, files[0]], consent: true },
    { files: [{ name: 'large.mp4', size: 49 * 1024 * 1024 }, files[0]], consent: true }]) {
    await assert.rejects(queue.createJob(guest(''), body));
  }
  assert.equal(objects.size, 1);
});
test('full queue lifecycle, access isolation, claim fencing and result signing', async () => {
  const { queue, objects } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  const created = await queue.createJob(guest(''), { consent: true, files });
  await assert.rejects(queue.jobAuth(guest('wrong'), created.id), /Không tìm thấy/);
  const job = await queue.jobAuth(guest(created.token), created.id);
  await assert.rejects(queue.submit(job), /chưa được tải/);
  job.inputs.forEach(input => objects.set(`jobs/${job.id}/${input.path}`, { metadata: { size: input.size } }));
  await queue.submit(job);
  const { job: claimed } = await queue.workerAction({ action: 'claim' });
  assert.equal(claimed.id, job.id);
  assert.equal((await queue.workerAction({ action: 'claim' })).job, null);
  assert.equal(objects.has(`pending/${job.id}.json`), false);
  await assert.rejects(queue.workerAction({ action: 'progress', id: job.id, claim: 'wrong' }), /Invalid claim/);
  await queue.workerAction({ action: 'progress', id: job.id, claim: claimed.claim, progress: .5, stage: 'tracking' });
  const result = { cameras: job.inputs.map(input => ({ camera_id: input.camera_id })), tracks: [], links: [], metrics: {} };
  await assert.rejects(queue.workerAction({ action: 'complete', id: job.id, claim: claimed.claim, result }), /Missing result videos/);
  job.inputs.forEach(input => objects.set(`jobs/${job.id}/outputs/${input.camera_id}.mp4`, { metadata: { size: 100 } }));
  await queue.workerAction({ action: 'complete', id: job.id, claim: claimed.claim, result });
  const view = await queue.view(await queue.jobAuth(guest(created.token), job.id));
  assert.equal(view.status, 'completed');
  assert.match(view.result.cameras[0].media_path, /^https:\/\/storage.test/);
  assert.equal(view.token_hash, undefined);
  assert.equal(view.claim, undefined);
  await queue.deleteJob(await queue.jobAuth(guest(created.token), job.id));
  await assert.rejects(queue.jobAuth(guest(created.token), job.id));
});
test('durable per-IP quota limits public GPU use', async () => {
  const { queue } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  for (let index = 0; index < 20; index++) await queue.createJob(guest(''), { consent: true, files });
  await assert.rejects(queue.createJob(guest(''), { consent: true, files }), error => error.status === 429 && /20 lượt/.test(error.message));
});

test('global daily quota still caps requests across different IPs at thirty', async () => {
  const { queue } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  const request = index => new Request('https://demo.test/api/demo/jobs', {
    headers: { 'x-vercel-forwarded-for': `192.0.2.${index}` },
  });
  for (let index = 1; index <= 30; index++) await queue.createJob(request(index), { consent: true, files });
  await assert.rejects(queue.createJob(request(31), { consent: true, files }), error => error.status === 429 && /30 lượt/.test(error.message));
});

test('sample selection queues fresh raw inputs, never saved results or arbitrary URLs', async () => {
  const { queue, objects } = fixture();
  await queue.workerAction({ action: 'heartbeat' });
  await assert.rejects(queue.createSampleJob(guest(''), 'https://untrusted.test/video'), /không hợp lệ/);
  await assert.rejects(queue.createSampleJob(guest(''), 'hallway-two'), /chưa sẵn sàng/);
  for (const [index,size] of [[1,172471],[2,159780],[3,172372]]) objects.set(`samples/hallway-v1/CAM-${index}.mp4`, { metadata: { size } });
  const first = await queue.createSampleJob(guest(''), 'hallway-two');
  const second = await queue.createSampleJob(guest(''), 'hallway-two');
  assert.notEqual(first.id, second.id);
  const state = await queue.jobAuth(guest(first.token), first.id);
  assert.equal(state.status, 'queued');
  assert.equal(state.sample_id, 'hallway-two');
  assert.equal((await queue.view(state)).result, null);
  const claim = (await queue.workerAction({ action: 'claim' })).job;
  assert.equal(claim.inputs.length, 2);
  assert.match(claim.inputs[0].url, /samples\/hallway-v1\/CAM-1.mp4/);
  assert.equal(objects.has(`jobs/${first.id}/outputs/result.json`), false);
});

test('private EPFL samples stay excluded from the public catalog', async () => {
  const { queue, objects } = fixture();
  const sample = JSON.parse(fs.readFileSync('lib/demo-datasets.generated.json', 'utf8'))[0];
  await queue.workerAction({ action: 'heartbeat' });
  sample.cameras.forEach(camera => objects.set(`samples/${camera.file}`, { metadata: { size: camera.size } }));
  await assert.rejects(queue.createSampleJob(guest(''), sample.id), error => error.status === 400);
  assert.equal(sample.simulation, false);
  assert.equal(sample.source_name, 'CVLab – EPFL');
  assert.equal(sample.cameras.every(input => input.timeline_start_seconds === 0), true);
  assert.equal((await queue.workerAction({ action: 'claim' })).job, null);
});

test('CC licensed real-camera sample preserves synchronization and attribution', async () => {
  const { queue, objects } = fixture();
  const sample = JSON.parse(fs.readFileSync('lib/demo-open-datasets.generated.json','utf8')).find(item=>item.id==='icsens-0004');
  await queue.workerAction({ action: 'heartbeat' });
  sample.cameras.forEach(camera=>objects.set(`samples/${camera.file}`,{metadata:{size:camera.size}}));
  const created = await queue.createSampleJob(guest(''),sample.id);
  const claim = (await queue.workerAction({action:'claim'})).job;
  assert.equal(claim.id,created.id);
  assert.equal(claim.simulation,false);
  assert.equal(claim.inputs.every(input=>input.timeline_start_seconds===0),true);
  assert.equal(claim.source.license_url,'https://creativecommons.org/licenses/by-nc/3.0/');
  assert.match(claim.source.attribution,/Uyen Nguyen/);
});

test('P-DESTRE campus clips are default raw inputs and independent sessions never acquire synchronized timestamps', async () => {
 const {queue,objects}=fixture();const sample=JSON.parse(fs.readFileSync('lib/demo-open-datasets.generated.json','utf8'))[0];
 assert.equal(sample.id,'pdestre-campus');assert.equal(sample.synchronized,false);assert.equal(sample.cameras.length,3);
 assert.equal(sample.license_url,'https://creativecommons.org/licenses/by-nc-sa/4.0/');
 await queue.workerAction({action:'heartbeat'});
 sample.cameras.forEach(camera=>{assert.equal(fs.statSync('public/demo/samples/'+camera.file).size,camera.size);objects.set('samples/'+camera.file,{metadata:{size:camera.size}});});
 const created=await queue.createSampleJob(guest(''),sample.id);
 const job=await queue.jobAuth(guest(created.token),created.id);
 assert.equal(job.inputs.every(input=>input.timeline_known===false),true);
 assert.equal((await queue.view(job)).result,null);
});

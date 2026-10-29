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
      require: name => name === 'server-only' ? {} : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name.endsWith('.json') ? name : name + '.ts')) : require(name),
      process: { env: { SUPABASE_URL: 'https://storage.test', SUPABASE_SECRET_KEY: 'admin-test', MULTICAM_WORKER_TOKEN: 'worker-test' } },
      fetch, Response, Request, AbortSignal, Buffer, console,
    });
    return target.exports;
  }
  return { store: load('lib/workspace-store.ts'), queue: load('lib/demo-queue.ts'), objects };
}
const request = token => new Request('https://app.test/api/workspaces', { headers: { Authorization: `Bearer ${token ?? ''}`, 'x-vercel-forwarded-for': '192.0.2.10' } });
const camera = { name: 'Cổng chính', zone: 'Khu A', role: 'gate', source: 'recorded', position: { x: .2, y: .7 }, location: { lat: 10, lng: 105 } };
async function setup(f) {
  const access = await f.store.createWorkspace(request(), 'Khuôn viên thử nghiệm');
  return { access, owner: await f.store.workspaceAuth(request(access.token), access.id) };
}
async function attach(f, owner, access) {
  await f.queue.workerAction({ action: 'heartbeat' });
  const job = await f.queue.createJob(request(), { consent: true, files: [{ name: 'a.mp4', size: 10 }, { name: 'b.mp4', size: 20 }] });
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'attach_job', ...job, name: 'Phiên camera' });
  return job;
}
test('workspace access is isolated and snapshots never expose bearer secrets', async () => {
  const f = fixture(), a = await setup(f), b = await setup(f);
  await assert.rejects(f.store.workspaceAuth(request(b.access.token), a.access.id), error => error.status === 401);
  await assert.rejects(f.store.workspaceAuth(request(), '../escape'), error => error.status === 404);
  const data = await f.store.snapshot(a.owner);
  assert.equal(data.name, 'Khuôn viên thử nghiệm');
  assert.equal(JSON.stringify(data).includes(a.access.token), false);
  assert.equal('token_hash' in data, false);
  assert.equal(data.jobs.length, 0);
});
test('camera edits are durable independent records, with strict coordinates and no forged update IDs', async () => {
  const f = fixture(), { access, owner } = await setup(f);
  const saved = await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera });
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera: { ...camera, name: 'Lối đi' } });
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera: { ...saved.camera, name: 'Cổng đã sửa' } });
  assert.equal((await f.store.snapshot(owner)).cameras.length, 2);
  assert.equal((await f.store.snapshot(owner)).cameras.some(item => item.name === 'Cổng đã sửa'), true);
  await assert.rejects(f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera: { ...camera, location: { lat: 91, lng: 0 } } }));
  await assert.rejects(f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera: { ...camera, id: '00000000-0000-4000-8000-000000000001' } }), error => error.status === 404);
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'delete_camera', id: saved.camera.id });
  assert.equal((await f.store.snapshot(owner)).cameras.length, 1);
});
test('history requires job proof and durable ownership survives guest expiry', async () => {
  const f = fixture(), a = await setup(f), b = await setup(f);
  const job = await attach(f, a.owner, a.access);
  await assert.rejects(f.store.ownedJob(b.owner, job.id), error => error.status === 404);
  await assert.rejects(f.store.mutateWorkspace(request(b.access.token), b.owner, { action: 'attach_job', id: job.id, token: 'wrong' }), error => error.status === 404);
  const state = f.objects.get(`jobs/${job.id}/state.json`).value;
  state.created_at = Date.now() - 2 * 86400000;
  await assert.rejects(f.queue.jobAuth(request(job.token), job.id), error => error.status === 410);
  assert.equal((await f.store.ownedJob(a.owner, job.id)).id, job.id);
  const snapshot = await f.store.snapshot(a.owner);
  assert.equal(snapshot.jobs.length, 1); assert.equal(JSON.stringify(snapshot).includes(job.token), false);
});
test('camera geometry in historical jobs remains a snapshot after editing the camera', async () => {
  const f = fixture(), { access, owner } = await setup(f);
  const { camera: saved } = await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera });
  await f.queue.workerAction({ action: 'heartbeat' });
  const job = await f.queue.createJob(request(), { consent: true, files: [{ name: 'a.mp4', size: 10 }, { name: 'b.mp4', size: 20 }] });
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'attach_job', ...job, name: 'Lịch sử', camera_ids: { 'CAM-1': saved.id } });
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera: { ...saved, position: { x: .9, y: .9 } } });
  assert.equal((await f.store.snapshot(owner)).jobs[0].camera_snapshots['CAM-1'].position.x, .2);
});
test('manual reviews require actual cross-camera tracks; entry marks require valid video times', async () => {
  const f = fixture(), { access, owner } = await setup(f), job = await attach(f, owner, access);
  f.objects.get(`jobs/${job.id}/state.json`).value.status = 'completed';
  f.objects.set(`jobs/${job.id}/outputs/result.json`, { value: { tracks: [ { track_key: 'A', camera_id: 'CAM-1' }, { track_key: 'B', camera_id: 'CAM-2' }, { track_key: 'C', camera_id: 'CAM-1' } ], cameras: [{ camera_id: 'CAM-1', duration_seconds: 10 }] } });
  const save = fields => f.store.mutateWorkspace(request(access.token), owner, { action: 'review', job_id: job.id, track_key: 'A', ...fields });
  await assert.rejects(save({ decision: 'same', other_track_key: 'C' }));
  await assert.rejects(save({ decision: 'same', other_track_key: 'invented' }));
  await save({ decision: 'same', other_track_key: 'B', note: 'Kiểm tra video' });
  await assert.rejects(save({ decision: 'entry', time_seconds: 20 }));
  await save({ decision: 'entry', time_seconds: 2.5 });
  const notes = await f.store.reviews(owner, job.id);
  assert.equal(notes.length, 2); assert.equal(notes.some(note => note.time_seconds === 2.5), true);
});
test('basic workspace creation and camera CRUD do not require an online GPU', async () => {
  const f = fixture(), { owner, access } = await setup(f);
  assert.equal(await f.queue.heartbeat(), false);
  await f.store.mutateWorkspace(request(access.token), owner, { action: 'save_camera', camera });
  assert.equal((await f.store.snapshot(owner)).cameras.length, 1);
});

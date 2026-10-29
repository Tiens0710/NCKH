import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { jobAuth, listStorageObjects, QueueError, read, removeStorageObjects, write, type Job } from "./demo-queue";
import type { JobIndex, Review, SiteCamera, WorkspaceSnapshot } from "./workspace-types";
import { cameraConnection } from './camera-connection';

type Owner = { id: string; token_hash: string; name: string; created_at: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (id: string) => `workspaces/${id}`;
function string(value: unknown, max: number, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || !allowEmpty && !value.trim()) throw new QueueError(`${label} không hợp lệ.`);
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QueueError("Dữ liệu không hợp lệ.");
  return value as Record<string, unknown>;
}
function identifier(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value)) throw new QueueError("Mã dữ liệu không hợp lệ.");
  return value;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new QueueError("Vị trí camera không hợp lệ.");
  return value;
}
async function records<T>(prefix: string, cap: number): Promise<Awaited<T>[]> {
  const items = [];
  for (let offset = 0; offset <= cap; offset += 100) {
    const page = await listStorageObjects(prefix, 100, offset);
    items.push(...page.filter(item => uuid.test(item.name.replace(/\.json$/, ""))).map(item => item.name));
    if (page.length < 100) break;
    if (items.length > cap) throw new QueueError("Không gian đạt giới hạn lưu trữ nghiên cứu. Hãy xuất và dọn các phiên cũ.", 409);
  }
  const values: Awaited<T>[] = [];
  // Bound Storage fan-out; each record is independent so unrelated edits do not overwrite.
  for (let i = 0; i < items.length; i += 8) {
    const batch = await Promise.all(items.slice(i, i + 8).map(name => read<T>(`${prefix}/${name}`)));
    for (const value of batch) if (value !== null) values.push(value);
  }
  return values;
}
export async function createWorkspace(request: Request, name: unknown) {
  const secret = process.env.MULTICAM_WORKER_TOKEN;
  if (!secret) throw new QueueError("Máy chủ chưa cấu hình không gian riêng.", 503);
  const title = string(name, 80, "Tên không gian");
  const ip = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const owner = createHmac("sha256", secret).update(ip).digest("hex");
  const day = new Date().toISOString().slice(0, 10);
  for (const [scope, limit] of [[owner, 5], ["global", 100]] as const) {
    let reserved = false;
    for (let index = 0; index < limit; index++) {
      if (await write(`workspace-quota/${day}/${scope}/${index}.json`, { at: Date.now() }, false)) { reserved = true; break; }
    }
    if (!reserved) throw new QueueError("Đã đạt giới hạn tạo không gian hôm nay. Hãy mở lại không gian đã lưu.", 429);
  }
  const id = randomUUID(), token = randomBytes(32).toString("base64url");
  await write(`${key(id)}/owner.json`, { id, token_hash: digest(token), name: title, created_at: Date.now() }, false);
  return { id, token };
}
export async function workspaceAuth(request: Request, id: string): Promise<Owner> {
  if (!uuid.test(id)) throw new QueueError("Không tìm thấy không gian.", 404);
  const owner = await read<Owner>(`${key(id)}/owner.json`);
  const candidate = digest((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  if (!owner || !timingSafeEqual(Buffer.from(candidate), Buffer.from(owner.token_hash)))
    throw new QueueError("Không có quyền mở không gian này. Hãy nhập file sao lưu quyền truy cập.", 401);
  return owner;
}
export async function snapshot(owner: Owner): Promise<WorkspaceSnapshot> {
  const [cameras, jobs] = await Promise.all([
    records<SiteCamera>(`${key(owner.id)}/cameras`, 64), records<JobIndex>(`${key(owner.id)}/jobs`, 200),
  ]);
  return { id: owner.id, name: owner.name, created_at: owner.created_at,
    cameras: cameras.sort((a, b) => a.name.localeCompare(b.name)), jobs: jobs.sort((a, b) => b.created_at - a.created_at) };
}
export async function ownedJob(owner: Owner, jobId: string): Promise<Job> {
  identifier(jobId);
  if (!await read<JobIndex>(`${key(owner.id)}/jobs/${jobId}.json`)) throw new QueueError("Phiên không thuộc không gian này.", 404);
  const job = await read<Job>(`jobs/${jobId}/state.json`);
  if (!job) throw new QueueError("Phiên đã bị xóa hoặc không còn trong kho lưu trữ.", 404);
  // Durable workspace ownership replaces the 24-hour guest capability expiry.
  return job;
}
export async function reviews(owner: Owner, jobId: string) {
  await ownedJob(owner, jobId);
  return (await records<Review>(`${key(owner.id)}/reviews/${jobId}`, 500)).sort((a, b) => b.created_at - a.created_at);
}
export async function mutateWorkspace(request: Request, owner: Owner, raw: unknown) {
  const body = object(raw);
  if (body.action === "save_camera") {
    const source = object(body.camera);
    const id = source.id ? identifier(source.id) : randomUUID();
    if (source.id && !await read<SiteCamera>(`${key(owner.id)}/cameras/${id}.json`)) throw new QueueError("Camera không còn tồn tại.", 404);
    const position = object(source.position);
    if (!["gate", "walkway", "yard", "other"].includes(String(source.role)) || !["recorded", "rtsp", "hls"].includes(String(source.source)))
      throw new QueueError("Loại camera không hợp lệ.");
    if (!source.id && (await records<SiteCamera>(`${key(owner.id)}/cameras`, 64)).length >= 32)
      throw new QueueError("Mỗi không gian nghiên cứu hỗ trợ tối đa 32 camera.", 409);
    const camera: SiteCamera = { id, name: string(source.name, 80, "Tên camera"), zone: string(source.zone, 80, "Khu vực", true),
      role: source.role as SiteCamera["role"], source: source.source as SiteCamera["source"],
      position: { x: number(position.x, 0, 1), y: number(position.y, 0, 1) }, updated_at: Date.now() };
    try { camera.connection = cameraConnection(camera.source, source.connection); }
    catch (failure) { throw new QueueError((failure as Error).message); }
    if (source.location !== undefined) {
      const location = object(source.location);
      camera.location = { lat: number(location.lat, -90, 90), lng: number(location.lng, -180, 180) };
    }
    await write(`${key(owner.id)}/cameras/${id}.json`, camera);
    return { camera };
  }
  if (body.action === "delete_camera") {
    await removeStorageObjects([`${key(owner.id)}/cameras/${identifier(body.id)}.json`]);
    return { ok: true };
  }
  if (body.action === "rename") {
    await write(`${key(owner.id)}/owner.json`, { ...owner, name: string(body.name, 80, "Tên không gian") });
    return { ok: true };
  }
  if (body.action === "attach_job") {
    const id = identifier(body.id), token = string(body.token, 100, "Quyền truy cập phiên");
    const job = await jobAuth(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }), id);
    const mapping = object(body.camera_ids ?? {});
    const cameraIds: Record<string, string> = {};
    const cameraSnapshots: Record<string, SiteCamera> = {};
    for (const [inputId, cameraId] of Object.entries(mapping)) {
      if (!job.inputs.some(input => input.camera_id === inputId)) throw new QueueError("Camera không thuộc phiên.");
      const selected = identifier(cameraId);
      const camera = await read<SiteCamera>(`${key(owner.id)}/cameras/${selected}.json`);
      if (!camera) throw new QueueError("Camera không thuộc không gian.");
      cameraIds[inputId] = selected;
      cameraSnapshots[inputId] = camera;
    }
    if ((await records<JobIndex>(`${key(owner.id)}/jobs`, 200)).length >= 100 &&
        !await read<JobIndex>(`${key(owner.id)}/jobs/${id}.json`)) throw new QueueError("Đã đạt 100 phiên. Hãy xuất và xóa phiên không cần giữ.", 409);
    const entry: JobIndex = { id, name: string(body.name ?? "Phiên xử lý", 120, "Tên phiên"), created_at: job.created_at, camera_ids: cameraIds, camera_snapshots: cameraSnapshots };
    await write(`${key(owner.id)}/jobs/${id}.json`, entry, false);
    return { id };
  }
  if (body.action === "review") {
    const jobId = identifier(body.job_id);
    const job = await ownedJob(owner, jobId);
    if (job.status !== "completed") throw new QueueError("Phiên chưa hoàn thành.", 409);
    const result = await read<{ tracks: { track_key: string; camera_id: string }[]; cameras: { camera_id: string; duration_seconds: number }[] }>(`jobs/${jobId}/outputs/result.json`);
    const trackKey = string(body.track_key, 100, "Track");
    const track = result?.tracks.find(track => track.track_key === trackKey);
    if (!track) throw new QueueError("Track không có trong kết quả.");
    const decision = String(body.decision);
    if (!["same", "different", "uncertain", "entry", "exit", "presence"].includes(decision)) throw new QueueError("Quyết định không hợp lệ.");
    const review: Review = { id: randomUUID(), job_id: jobId, track_key: trackKey,
      decision: decision as Review["decision"], note: string(body.note ?? "", 1000, "Ghi chú", true), created_at: Date.now() };
    if (["same", "different", "uncertain"].includes(decision)) {
      const other = result?.tracks.find(item => item.track_key === body.other_track_key);
      if (!other || other.track_key === trackKey || other.camera_id === track.camera_id) throw new QueueError("Chọn track ở camera khác để đối chiếu.");
      review.other_track_key = other.track_key;
    } else {
      const camera = result?.cameras.find(camera => camera.camera_id === track.camera_id);
      review.time_seconds = number(body.time_seconds, 0, camera?.duration_seconds ?? 0);
    }
    if ((await reviews(owner, jobId)).length >= 200) throw new QueueError("Phiên đã đạt giới hạn 200 ghi chú.", 409);
    await write(`${key(owner.id)}/reviews/${jobId}/${review.id}.json`, review, false);
    return { review };
  }
  throw new QueueError("Thao tác không được hỗ trợ.");
}
export async function removeJobIndex(owner: Owner, jobId: string) {
  identifier(jobId);
  const notes = await records<Review>(`${key(owner.id)}/reviews/${jobId}`, 500);
  await removeStorageObjects([`${key(owner.id)}/jobs/${jobId}.json`, ...notes.map(note => `${key(owner.id)}/reviews/${jobId}/${note.id}.json`)]);
}

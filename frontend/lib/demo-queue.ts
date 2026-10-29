import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DEMO_SAMPLES } from "./demo-samples";

const BUCKET = "multicam-demo";
const DAILY_IP_LIMIT = 20;
const DAILY_GLOBAL_LIMIT = 30;
export const LIMIT_BYTES = 48 * 1024 * 1024;
type Input = { name: string; size: number; type: string; camera_id: string; path: string; source_path?: string;
  timeline_start_seconds?: number; timeline_known?: boolean; location?: { lat: number; lng: number }; source_kind?: "upload" | "rtsp_capture" };
export type Job = {
  id: string; token_hash: string; status: "uploading" | "queued" | "processing" | "completed" | "failed";
  created_at: number; updated_at: number; stage: string; progress: number;
  inputs: Input[]; claim?: string; message?: string;
  sample_id?: string;
};
export class QueueError extends Error { constructor(message: string, public status = 400) { super(message); } }
function config() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !process.env.MULTICAM_WORKER_TOKEN) throw new QueueError("Chưa cấu hình máy chủ tải video.", 503);
  return { url: url.replace(/\/$/, "") + "/storage/v1", key };
}
async function storage(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  return fetch(url + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } });
}
async function checked(response: Response) {
  if (!response.ok) throw new QueueError("Không truy cập được kho lưu trữ. Vui lòng thử lại.", 503);
  return response.json();
}
export async function read<T>(path: string): Promise<T | null> {
  const response = await storage(`/object/authenticated/${BUCKET}/${path}`);
  if (response.status === 400 || response.status === 404) return null;
  return checked(response);
}
export async function write(path: string, value: unknown, overwrite = true) {
  const response = await storage(`/object/${BUCKET}/${path}`, { method: "POST",
    headers: { "x-upsert": String(overwrite) }, body: JSON.stringify(value) });
  if (!overwrite && !response.ok) {
    const failure = await response.json().catch(() => ({}));
    if (response.status === 409 || String(failure.statusCode) === "409" || failure.error === "Duplicate") return false;
    throw new QueueError("Không tạo được dữ liệu hàng đợi.", 503);
  }
  await checked(response); return true;
}
export async function listStorageObjects(prefix: string, limit = 100, offset = 0) {
  return checked(await storage(`/object/list/${BUCKET}`, { method: "POST", body: JSON.stringify({
    prefix, limit, offset, sortBy: { column: "created_at", order: "asc" },
  }) })) as Promise<{ name: string; metadata?: { size: number } }[]>;
}
const list = (prefix: string) => listStorageObjects(prefix);
async function signed(path: string, upload = false) {
  const data = await checked(await storage(`/object/${upload ? "upload/sign" : "sign"}/${BUCKET}/${path}`, {
    method: "POST", body: JSON.stringify(upload ? {} : { expiresIn: 3600 }),
  }));
  return config().url + (data.url ?? data.signedURL);
}
export async function removeStorageObjects(paths: string[]) {
  if (paths.length) await checked(await storage(`/object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: paths }) }));
}
const remove = removeStorageObjects;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function matches(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export function workerAuth(request: Request) {
  const token = process.env.MULTICAM_WORKER_TOKEN;
  if (!token || !matches(request.headers.get("authorization") ?? "", `Bearer ${token}`)) throw new QueueError("Unauthorized", 401);
}
export async function jobAuth(request: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new QueueError("Không tìm thấy yêu cầu.", 404);
  const job = await read<Job>(`jobs/${id}/state.json`);
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!job || !matches(hash(token), job.token_hash)) throw new QueueError("Không tìm thấy yêu cầu.", 404);
  if (Date.now() - job.created_at > 86400000) throw new QueueError("Yêu cầu đã hết hạn sau 24 giờ.", 410);
  return job;
}
export async function heartbeat() {
  const state = await read<{ updated_at: number }>("worker.json");
  return !!state && Date.now() - state.updated_at < 45000;
}
export async function createJob(request: Request, body: { files?: { name: string; size: number; type: string;
  camera_name?: string; timeline_start_seconds?: number; location?: { lat: number; lng: number }; source_kind?: string }[]; consent?: boolean }) {
  if (!body.consent || !Array.isArray(body.files) || body.files.length < 2 || body.files.length > 3)
    throw new QueueError("Chọn 2–3 video và đồng ý xử lý dữ liệu.");
  if (!await heartbeat()) throw new QueueError("Kaggle đang ngoại tuyến. Bạn vẫn có thể xem demo có sẵn; hãy thử tải lên khi worker hoạt động.", 503);
  const inputs: Input[] = body.files.map((file, index) => {
    if (typeof file.name !== "string" || !/\.(mp4|mov|avi|mkv|webm)$/i.test(file.name) ||
        !Number.isSafeInteger(file.size) || file.size < 1 || file.size > LIMIT_BYTES)
      throw new QueueError("Mỗi video phải có định dạng hỗ trợ và không quá 48 MB.");
    const extension = file.name.split(".").pop()!.toLowerCase();
    if (file.timeline_start_seconds !== undefined && (typeof file.timeline_start_seconds !== "number" ||
        !Number.isFinite(file.timeline_start_seconds) || file.timeline_start_seconds < 0 || file.timeline_start_seconds > 86400))
      throw new QueueError("Mốc bắt đầu phải từ 0 đến 86400 giây so với cùng một mốc ghi hình.");
    if (file.camera_name !== undefined && (typeof file.camera_name !== "string" || !file.camera_name.trim() || file.camera_name.length > 120))
      throw new QueueError("Tên camera cần có từ 1 đến 120 ký tự.");
    if (file.location !== undefined && (!file.location || typeof file.location.lat !== "number" || typeof file.location.lng !== "number" ||
        !Number.isFinite(file.location.lat) || !Number.isFinite(file.location.lng) || Math.abs(file.location.lat) > 90 || Math.abs(file.location.lng) > 180))
      throw new QueueError("Tọa độ camera không hợp lệ.");
    if (file.source_kind !== undefined && !["upload", "rtsp_capture"].includes(file.source_kind))
      throw new QueueError("Nguồn camera không hợp lệ.");
    return { name: file.name.slice(0, 120), size: file.size, type: "application/octet-stream",
      camera_id: `CAM-${index + 1}`, path: `inputs/CAM-${index + 1}.${extension}`,
      ...(file.camera_name ? { name: file.camera_name.trim() } : {}),
      timeline_start_seconds: file.timeline_start_seconds ?? 0, timeline_known: file.timeline_start_seconds !== undefined,
      ...(file.location ? { location: { lat: file.location.lat, lng: file.location.lng } } : {}),
      source_kind: file.source_kind === "rtsp_capture" ? "rtsp_capture" : "upload" };
  });
  return allocateJob(request, inputs);
}
async function allocateJob(request: Request, inputs: Input[], sampleId?: string) {
  // Durable atomic quotas; raising the limit preserves slots already used today.
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const digest = createHmac("sha256", process.env.MULTICAM_WORKER_TOKEN!).update(ip).digest("hex");
  for (const [scope, limit] of [[digest, DAILY_IP_LIMIT], ["global", DAILY_GLOBAL_LIMIT]] as const) {
    let reserved = false;
    for (let index = 0; index < limit; index++) {
      if (await write(`quota/${day}/${scope}/${index}.json`, { at: Date.now() }, false)) { reserved = true; break; }
    }
    if (!reserved) throw new QueueError(scope === "global"
      ? `Toàn bộ demo đã đạt giới hạn ${DAILY_GLOBAL_LIMIT} lượt hôm nay. Giới hạn đặt lại lúc 07:00 (giờ Việt Nam).`
      : `IP của bạn đã đạt giới hạn ${DAILY_IP_LIMIT} lượt hôm nay. Giới hạn đặt lại lúc 07:00 (giờ Việt Nam).`, 429);
  }
  const id = randomUUID(), token = randomBytes(32).toString("base64url");
  const job: Job = { id, token_hash: hash(token), status: "uploading", created_at: Date.now(),
    updated_at: Date.now(), inputs, stage: "Đang tải video", progress: 0 };
  if (sampleId) {
    job.sample_id = sampleId; job.status = "queued"; job.stage = "Đang chờ Kaggle xử lý video mẫu";
    await write(`jobs/${id}/state.json`, job, false);
    await write(`pending/${id}.json`, { id });
    return { id, token, uploads: [] };
  }
  await write(`jobs/${id}/state.json`, job, false);
  const uploads = await Promise.all(inputs.map(async (input) => ({ ...input, url: await signed(`jobs/${id}/${input.path}`, true) })));
  return { id, token, uploads };
}
export async function createSampleJob(request: Request, sampleId: unknown) {
  const sample = DEMO_SAMPLES.find(item => item.id === sampleId);
  if (!sample) throw new QueueError("Bộ video mẫu không hợp lệ.");
  // Research-only distribution must not silently become a public anonymous service.
  // Enable only after authenticated research access or public replay permission is resolved.
  if (sample.research_only) throw new QueueError("Bộ này dành cho nghiên cứu riêng tư; chưa mở quyền phát lại công khai.", 403);
  if (!await heartbeat()) throw new QueueError("Kaggle đang ngoại tuyến. Hãy bật worker trước khi chạy AI.", 503);
  const prefixes = [...new Set(sample.cameras.map(camera => `${sample.storage_prefix}/${camera.file}`.split("/").slice(0, -1).join("/")))];
  const entries = await Promise.all(prefixes.map(async prefix => ({ prefix, objects: await list(prefix) })));
  if (!sample.cameras.every(camera => entries.some(entry => entry.objects.some(object =>
      `${entry.prefix}/${object.name}` === `${sample.storage_prefix}/${camera.file}` && object.metadata?.size === camera.size))))
    throw new QueueError("Bộ video đầu vào chưa sẵn sàng trên máy chủ.", 503);
  return allocateJob(request, sample.cameras.map((camera, index) => ({
    name: camera.name, size: camera.size, type: "video/mp4", camera_id: `CAM-${index + 1}`,
    path: `inputs/CAM-${index + 1}.mp4`, source_path: `${sample.storage_prefix}/${camera.file}`,
    timeline_start_seconds: camera.timeline_start_seconds ?? (sample.simulation ? index * 30 : 0),
    timeline_known: camera.timeline_start_seconds !== undefined || sample.simulation,
  })), sample.id);
}
export async function submit(job: Job) {
  if (job.status !== "uploading") return { status: job.status };
  if (Date.now() - job.created_at > 3600000) throw new QueueError("Phiên tải lên đã hết hạn.", 410);
  const objects = await list(`jobs/${job.id}/inputs`);
  if (!job.inputs.every(input => objects.some(object => object.name === input.path.split("/").pop() &&
      object.metadata?.size === input.size))) throw new QueueError("Video chưa được tải lên đầy đủ.");
  job.status = "queued"; job.stage = "Đang chờ Kaggle"; job.updated_at = Date.now();
  await write(`jobs/${job.id}/state.json`, job);
  await write(`pending/${job.id}.json`, { id: job.id });
  return { status: job.status };
}
export async function resumeUploadTargets(job: Job) {
  if (job.status !== "uploading" || Date.now() - job.created_at > 3600000) throw new QueueError("Phiên tải không còn mở. Hãy tạo phiên mới.", 409);
  return Promise.all(job.inputs.map(async input => ({ camera_id: input.camera_id, name: input.name, size: input.size,
    url: await signed(`jobs/${job.id}/${input.path}`, true) })));
}
export async function deleteJob(job: Job) {
  if (job.status === "processing" && Date.now() - job.updated_at < 120000)
    throw new QueueError("Đợi AI xử lý xong trước khi xóa.", 409);
  const paths = [`pending/${job.id}.json`, `claims/${job.id}.json`];
  for (const folder of ["inputs", "outputs"]) {
    for (const object of await list(`jobs/${job.id}/${folder}`)) paths.push(`jobs/${job.id}/${folder}/${object.name}`);
  }
  paths.push(`jobs/${job.id}/state.json`);
  await remove(paths); return { ok: true };
}
export async function view(job: Job) {
  const online = await heartbeat();
  const stalled = job.status === "processing" && Date.now() - job.updated_at > 120000;
  const expired = job.status === "uploading" && Date.now() - job.created_at > 3600000 || job.status === "queued" && Date.now() - job.created_at > 86400000;
  let result = null;
  if (job.status === "completed") {
    result = await read<Record<string, unknown>>(`jobs/${job.id}/outputs/result.json`);
    if (result && Array.isArray(result.cameras)) result.cameras = await Promise.all(result.cameras.map(async camera => ({
      ...camera, media_path: await signed(`jobs/${job.id}/outputs/${camera.camera_id}.mp4`),
      // Authoritative metadata comes from the submitted job, never a guessed campus position.
      ...cameraMetadata(job, camera.camera_id),
      raw_media_path: camera.raw_media_path === `${camera.camera_id}-raw.mp4`
        ? await signed(`jobs/${job.id}/outputs/${camera.camera_id}-raw.mp4`) : undefined,
    })));
  }
  return { id: job.id, sample_id: job.sample_id, created_at: job.created_at, updated_at: job.updated_at,
    status: stalled || expired ? "failed" : job.status, stage: stalled ? "Worker mất kết nối" : expired ? "Phiên chờ đã hết hạn" : job.stage,
    progress: job.progress, message: stalled ? "Kaggle đã ngừng phản hồi; yêu cầu này không còn tiến triển." : expired ? "Phiên tải quá 1 giờ hoặc chờ xử lý quá 24 giờ. Hãy xóa phiên này và gửi video trong phiên mới." : job.message,
    worker_online: online, result };
}
export async function workerAction(body: Record<string, unknown>) {
  await write("worker.json", { updated_at: Date.now() });
  if (body.action === "claim") {
    for (const entry of await list("pending")) {
      const id = entry.name.replace(/\.json$/, "");
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      const job = await read<Job>(`jobs/${id}/state.json`);
      if (!job || job.status !== "queued" || Date.now() - job.created_at > 86400000) {
        await remove([`pending/${id}.json`]); continue;
      }
      const claim = randomUUID();
      if (!await write(`claims/${id}.json`, { claim }, false)) continue;
      job.claim = claim; job.status = "processing"; job.stage = "Kaggle đã nhận video"; job.updated_at = Date.now();
      await write(`jobs/${id}/state.json`, job);
      await remove([`pending/${id}.json`]);
      const inputs = await Promise.all(job.inputs.map(async input => ({ ...input, url: await signed(input.source_path ?? `jobs/${id}/${input.path}`) })));
      const outputs = await Promise.all([...inputs.flatMap(input => [`${input.camera_id}.mp4`, `${input.camera_id}-raw.mp4`]), "overview.jpg"].map(async name => ({
        name, url: await signed(`jobs/${id}/outputs/${name}`, true),
      })));
      const sample = DEMO_SAMPLES.find(item => item.id === job.sample_id);
      return { job: { id, claim, inputs, outputs, simulation: sample?.simulation ?? false,
        provenance: sample ? `${sample.source_name}: ${sample.title}; ${sample.duration_seconds}s raw clips` : "User-provided camera recordings; capture metadata supplied by operator",
        source: sample ? { name: sample.source_name, url: sample.source_url, license: sample.license,
          license_url: sample.license_url, attribution: sample.attribution, changes: sample.changes }
          : { name: "Video khách tải lên", url: "" } } };
    }
    return { job: null };
  }
  if (body.action === "heartbeat") return { ok: true };
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new QueueError("Invalid job");
  const job = await read<Job>(`jobs/${id}/state.json`);
  if (!job || job.status !== "processing" || !matches(String(body.claim ?? ""), job.claim ?? "")) throw new QueueError("Invalid claim", 409);
  if (body.action === "complete") {
    const result = body.result as Record<string, unknown>;
    if (!result || !Array.isArray(result.cameras) || result.cameras.length !== job.inputs.length ||
        result.cameras.some((camera: { camera_id: string }) => !job.inputs.some(input => input.camera_id === camera.camera_id)))
      throw new QueueError("Invalid result");
    const sample = DEMO_SAMPLES.find(item => item.id === job.sample_id);
    if (sample) result.source = { name: sample.source_name, url: sample.source_url, license: sample.license,
      license_url: sample.license_url, attribution: sample.attribution,
      changes: `${sample.changes ?? ""} Output adds estimated bounding boxes, temporary track IDs and clothing-color labels; no biometric identity verification.` };
    result.cameras = result.cameras.map((camera: { camera_id: string }) => ({ ...camera, ...cameraMetadata(job, camera.camera_id) }));
    const objects = await list(`jobs/${id}/outputs`);
    if (!job.inputs.every(input => objects.some(object => object.name === `${input.camera_id}.mp4` && (object.metadata?.size ?? 0) > 0)))
      throw new QueueError("Missing result videos");
    await write(`jobs/${id}/outputs/result.json`, result);
    job.status = "completed"; job.progress = 1; job.stage = "Đã xử lý xong";
  } else if (body.action === "fail") {
    job.status = "failed"; job.stage = "Xử lý không thành công";
    job.message = String(body.message ?? "Worker failed").slice(0, 300);
  } else if (body.action === "progress") {
    job.progress = Math.max(0, Math.min(0.99, Number(body.progress) || 0));
    job.stage = String(body.stage ?? "Đang xử lý").slice(0, 120);
  } else throw new QueueError("Invalid action");
  job.updated_at = Date.now(); await write(`jobs/${id}/state.json`, job);
  return { ok: true };
}
function cameraMetadata(job: Job, cameraId: string) {
  const input = job.inputs.find(item => item.camera_id === cameraId);
  if (!input) return {};
  return { timeline_known: input.timeline_known ?? !!job.sample_id,
    timeline_start_seconds: input.timeline_start_seconds ?? 0,
    location: input.location,
    ...(input.source_kind ? { source_kind: input.source_kind } : {}) };
}
export async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 2500000) throw new QueueError("Request too large", 413);
  try { return JSON.parse(text); } catch { throw new QueueError("Invalid JSON"); }
}
export function failure(error: unknown) {
  return Response.json({ error: error instanceof QueueError ? error.message : "Máy chủ gặp lỗi. Vui lòng thử lại." },
    { status: error instanceof QueueError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}

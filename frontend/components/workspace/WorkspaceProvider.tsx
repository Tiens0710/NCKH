"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { JobView, Review, WorkspaceAccess, WorkspaceSnapshot } from "@/lib/workspace-types";
import type { PublicDemoResult } from "@/lib/public-demo";

const ACCESS_KEY = "campus-trace-workspace-v1";
const REPLAY_KEY = "campus-trace-replay-v1";
type Selection = { trackKey: string; cameraId: string; seconds: number; revision: number; trackId?: number } | null;
type State = {
  access: WorkspaceAccess | null; data: WorkspaceSnapshot | null; jobId: string; job: JobView | null; notes: Review[];
  replay: boolean; loading: boolean; error: string; online: boolean | null; selection: Selection;
  setSelection: (value: Selection) => void; setError: (message: string) => void;
  create: (name: string) => Promise<void>; restore: (value: WorkspaceAccess) => Promise<void>;
  refresh: () => Promise<void>; mutate: (body: unknown) => Promise<void>; selectJob: (id: string) => void;
  showReplay: () => Promise<void>; refreshJob: () => Promise<void>; jobAction: (method: "POST" | "DELETE") => Promise<void>;
  attach: (job: WorkspaceAccess, name: string, cameraIds?: Record<string, string>) => Promise<void>;
};
const Context = createContext<State | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider missing");
  return context;
}
export async function jsonApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => { throw new Error(`Máy chủ trả phản hồi không hợp lệ (HTTP ${response.status}). Hãy thử lại.`); });
  if (!response.ok) throw new Error(body.error ?? "Không kết nối được máy chủ.");
  return body;
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function replayResult() {
  const result = await jsonApi<PublicDemoResult>("/demo/mars/result.json");
  result.cameras = result.cameras.map(camera => ({ ...camera, name: `MARS · Camera ${camera.camera_id.replace(/^CAM-/, '')}`, media_path: `/demo/mars/${camera.media_path}`,
    raw_media_path: camera.raw_media_path ? `/demo/mars/${camera.raw_media_path}` : undefined, timeline_known: false }));
  return result;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [data, setData] = useState<WorkspaceSnapshot | null>(null);
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [notes, setNotes] = useState<Review[]>([]);
  const [replay, setReplay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const loadGeneration = useRef(0);
  const headers = useCallback(() => ({ Authorization: `Bearer ${access?.token ?? ""}`, "Content-Type": "application/json" }), [access]);
  const refresh = useCallback(async () => {
    if (!access) return;
    const snapshot = await jsonApi<WorkspaceSnapshot>(`/api/workspaces/${access.id}`, { headers: headers() });
    setData(snapshot);
  }, [access, headers]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? "null");
        if (saved && typeof saved.id === "string" && typeof saved.token === "string") setAccess(saved);
        else setLoading(false);
        if (sessionStorage.getItem(REPLAY_KEY) === '1') void replayResult().then(result => {
          if (cancelled) return;
          setReplay(true); setJob({ id: "sample-replay", status: "completed", stage: "Kết quả mẫu lưu sẵn", progress: 1, worker_online: false, created_at: 0, updated_at: 0, result });
        }).catch(failure => { if (!cancelled) setError(failure.message); });
      } catch { setLoading(false); }
    });
    async function health() {
      try { const state = await jsonApi<{ worker_online: boolean }>("/api/demo/jobs", { signal: controller.signal }); if (!cancelled) setOnline(state.worker_online); }
      catch { if (!cancelled) setOnline(false); }
    }
    void health(); const timer = setInterval(health, 20000);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    const controller = new AbortController();
    void jsonApi<WorkspaceSnapshot>(`/api/workspaces/${access.id}`, { headers: headers(), signal: controller.signal })
      .then(snapshot => {
        if (cancelled) return;
        setData(snapshot); setError("");
        const previous = localStorage.getItem(`campus-trace-active-${access.id}`);
        if (previous && snapshot.jobs.some(item => item.id === previous)) setJobId(previous);
        else if (snapshot.jobs[0]) setJobId(snapshot.jobs[0].id);
      }).catch(failure => { if (!cancelled) setError((failure as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [access, headers]);
  useEffect(() => {
    if (!access || !jobId || replay) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const generation = ++loadGeneration.current;
    async function poll() {
      try {
        const current = await jsonApi<JobView & { reviews: Review[] }>(`/api/workspaces/${access!.id}/jobs/${jobId}`, { headers: headers(), signal: controller.signal });
        if (cancelled || generation !== loadGeneration.current) return;
        setJob(current); setNotes(current.reviews); setError("");
        // Renew signed media links while a completed session is open.
        if (current.status !== "failed") timer = setTimeout(poll, ["uploading", "queued", "processing"].includes(current.status) ? 5000 : 25 * 60 * 1000);
      } catch (failure) {
        if (!cancelled) { setError((failure as Error).message); timer = setTimeout(poll, 30000); }
      }
    }
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [access, jobId, replay, headers]);

  async function restore(value: WorkspaceAccess) {
    if (!/^[0-9a-f-]{36}$/.test(value.id) || !/^[A-Za-z0-9_-]{43}$/.test(value.token)) throw new Error("File quyền truy cập không hợp lệ.");
    const snapshot = await jsonApi<WorkspaceSnapshot>(`/api/workspaces/${value.id}`, { headers: { Authorization: `Bearer ${value.token}` } });
    localStorage.setItem(ACCESS_KEY, JSON.stringify(value)); setAccess(value); setData(snapshot);
    sessionStorage.removeItem(REPLAY_KEY);
    setReplay(false); setJob(null); setJobId(""); setNotes([]); setSelection(null); setError("");
  }
  async function create(name: string) {
    const value = await jsonApi<WorkspaceAccess>("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    // Persist access immediately: a failed follow-up read must never lose the new workspace.
    localStorage.setItem(ACCESS_KEY, JSON.stringify(value)); setAccess(value); setReplay(false); setJob(null); setJobId(""); setNotes([]); setSelection(null);
    sessionStorage.removeItem(REPLAY_KEY);
  }
  async function mutate(body: unknown) {
    if (!access) throw new Error("Tạo hoặc mở không gian riêng trước khi lưu dữ liệu.");
    await jsonApi(`/api/workspaces/${access.id}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    await refresh();
  }
  function selectJob(id: string) {
    if (id === jobId && !replay) return;
    loadGeneration.current++; setJob(null); setNotes([]); setSelection(null); setReplay(false); setJobId(id); setError("");
    sessionStorage.removeItem(REPLAY_KEY);
    if (access) localStorage.setItem(`campus-trace-active-${access.id}`, id);
  }
  async function refreshJob() {
    if (!access || !jobId || replay) return;
    const generation = loadGeneration.current;
    const current = await jsonApi<JobView & { reviews: Review[] }>(`/api/workspaces/${access.id}/jobs/${jobId}`, { headers: headers() });
    if (generation === loadGeneration.current) { setJob(current); setNotes(current.reviews); }
  }
  async function attach(value: WorkspaceAccess, name: string, cameraIds: Record<string, string> = {}) {
    await mutate({ action: "attach_job", ...value, name, camera_ids: cameraIds });
    selectJob(value.id);
  }
  async function jobAction(method: "POST" | "DELETE") {
    if (!access || !jobId || replay) return;
    await jsonApi(`/api/workspaces/${access.id}/jobs/${jobId}`, { method, headers: headers() });
    if (method === "DELETE") {
      loadGeneration.current++; setJob(null); setJobId(""); setNotes([]); setSelection(null); await refresh();
    } else await refreshJob();
  }
  async function showReplay() {
    const generation = ++loadGeneration.current;
    const result = await replayResult();
    if (generation !== loadGeneration.current) return;
    loadGeneration.current++; setReplay(true); setJobId(""); setNotes([]); setSelection(null);
    sessionStorage.setItem(REPLAY_KEY, '1');
    setJob({ id: "sample-replay", status: "completed", stage: "Kết quả mẫu lưu sẵn", progress: 1, worker_online: online === true, created_at: 0, updated_at: 0, result });
  }
  return <Context.Provider value={{ access, data, jobId, job, notes, replay, loading, error, online, selection,
    setSelection, setError, create, restore, refresh, mutate, selectJob, showReplay, refreshJob, jobAction, attach }}>{children}</Context.Provider>;
}

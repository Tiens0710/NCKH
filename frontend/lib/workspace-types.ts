import type { PublicDemoResult } from "./public-demo";

export type WorkspaceAccess = { id: string; token: string };
export type SiteCamera = {
  id: string; name: string; zone: string; role: "gate" | "walkway" | "yard" | "other";
  source: "recorded" | "rtsp"; location?: { lat: number; lng: number };
  position: { x: number; y: number }; updated_at: number;
};
export type JobIndex = { id: string; name: string; created_at: number; camera_ids: Record<string, string>; camera_snapshots?: Record<string, SiteCamera> };
export type Review = {
  id: string; job_id: string; track_key: string; other_track_key?: string;
  decision: "same" | "different" | "uncertain" | "entry" | "exit" | "presence";
  note: string; created_at: number; time_seconds?: number;
};
export type WorkspaceSnapshot = {
  id: string; name: string; created_at: number; cameras: SiteCamera[]; jobs: JobIndex[];
};
export type JobView = {
  id: string; status: "uploading" | "queued" | "processing" | "completed" | "failed";
  stage: string; progress: number; worker_online: boolean; created_at: number; updated_at: number;
  message?: string; result: PublicDemoResult | null;
};
export const VIEW_NAMES = {
  overview: "Xem camera", people: "Tìm người", journey: "Hành trình", videos: "Video", cameras: "Thiết lập camera", history: "Lịch sử",
} as const;
export type WorkspaceView = keyof typeof VIEW_NAMES;

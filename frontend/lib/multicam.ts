export type RunStatus = {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progress: number;
  camera_id?: string;
  frames_processed?: number;
  elapsed_seconds?: number;
  updated_at?: string;
  message?: string;
  log_tail?: string;
};
export type Observation = {
  xyxy: number[];
  score: number;
  local_track_id: number | null;
  global_person_id: string | null;
  association_status: string;
};
export type CameraResult = {
  camera_id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  media_path: string;
  timeline_start_seconds: number;
  frames: {
    time_seconds: number;
    frame_index: number;
    detections: Observation[];
  }[];
};
export type MultiCameraResult = {
  simulation: boolean;
  provenance: string;
  detector: { name: string; device: string; fine_tuned: boolean };
  config: { frame_stride: number };
  appearance_method: string;
  cameras: CameraResult[];
  tracks: {
    track_key: string;
    camera_id: string;
    local_track_id: number;
    global_person_id: string | null;
    association_status: string;
    started_seconds: number;
    ended_seconds: number;
    sample_count: number;
    crop_path: string;
  }[];
  links: {
    from_track: string;
    to_track: string;
    global_person_id: string;
    similarity: number;
    gap_seconds: number;
  }[];
  metrics: {
    sampled_frames: number;
    processing_fps: number;
    processing_seconds: number;
  };
};
const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export function artifactUrl(runId: string, path: string) {
  return `${base}/api/multicam/runs/${encodeURIComponent(runId)}/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export function resultUrl(runId: string) {
  return `${base}/api/multicam/runs/${encodeURIComponent(runId)}/result`;
}

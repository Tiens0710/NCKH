export type DemoColor = {
  name: string;
  label: string;
  vote_fraction?: number;
  dominant_fraction?: number;
};

export type DemoClothing = {
  upper: DemoColor;
  lower: DemoColor;
  observations?: number;
};

export type DemoDetection = {
  xyxy: number[];
  score: number;
  local_track_id: number | null;
  global_person_id: string | null;
  clothing_colors: DemoClothing;
};

export type DemoCamera = {
  camera_id: string;
  name: string;
  media_path: string;
  raw_media_path?: string;
  width?: number;
  height?: number;
  duration_seconds: number;
  timeline_start_seconds: number;
  timeline_known?: boolean;
  location?: { lat: number; lng: number };
  source_kind?: "upload" | "rtsp_capture";
  frames_sampled: number;
  fps: number;
  frames: {
    frame_index: number;
    time_seconds: number;
    detections: DemoDetection[];
  }[];
};

export type DemoTrack = {
  face?: { status: "available" | "insufficient_quality" | "disabled"; accepted_samples: number; attempts: number };
  track_key: string;
  camera_id: string;
  local_track_id: number;
  global_person_id: string | null;
  association_status: string;
  sample_count: number;
  clothing_colors: DemoClothing;
};

export type PublicDemoResult = {
  face_analysis?: { enabled: boolean; detector?: string; recognizer?: string; tracks_with_face?: number; tracks_total?: number; threshold_calibrated?: boolean };
  mode: string;
  detector: { name: string; device: string; fine_tuned: boolean };
  source: { name: string; url: string };
  cameras: DemoCamera[];
  tracks: DemoTrack[];
  links: { from_track: string; to_track: string; similarity: number }[];
  metrics: { sampled_frames: number; processing_fps: number; inference_fps: number };
};

export const DEMO_ASSETS = "/demo/mars";
export const COLOR_SWATCHES: Record<string, string> = {
  black: "#323842", white: "#f1f1ec", gray: "#8e939b", red: "#e96161",
  orange: "#ef9340", brown: "#a87651", yellow: "#e5cd45", green: "#61bc86",
  blue: "#5299f6", purple: "#a181d0", pink: "#e39dbe", unknown: "#919aab",
};

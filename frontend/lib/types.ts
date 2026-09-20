export type Camera = {
  id: string;
  name: string;
  area: string | null;
  map_x: number | null;
  map_y: number | null;
  stream_url: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Video = {
  id: string;
  camera_id: string;
  storage_path: string;
  started_at: string;
  ended_at: string | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  status: "pending" | "processing" | "completed" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
  cameras?: Pick<Camera, "id" | "name" | "area">;
};

export type SearchResult = {
  id: string;
  query_id: string;
  tracklet_id: string;
  similarity_score: number;
  rank: number | null;
  is_accepted: boolean | null;
  tracklets?: {
    id: string;
    representative_image_path: string | null;
    started_at: string;
    ended_at: string | null;
    videos?: {
      camera_id: string;
      cameras?: Pick<Camera, "id" | "name" | "area" | "map_x" | "map_y">;
    };
  };
};

export type SearchDetail = {
  query: {
    id: string;
    query_image_path: string;
    status: "pending" | "processing" | "completed" | "failed";
    similarity_threshold: number;
    start_time: string | null;
    end_time: string | null;
    created_at: string;
  };
  results: SearchResult[];
  trajectory: Array<{
    id: string;
    sequence_number: number;
    appeared_at: string;
    map_x: number | null;
    map_y: number | null;
    cameras?: Pick<Camera, "id" | "name" | "area">;
  }>;
};


/** Raw inputs only. Never point these URLs at annotated output or saved result JSON. */
import datasets from "./demo-open-datasets.generated.json";

export type DemoSample = {
  id: string; title: string; description: string; challenge: string;
  source_name: string; source_url: string; license: string; simulation: boolean;
  duration_seconds: number; storage_prefix: string;
  research_only?: boolean;
  short_label?: string; synchronized?: boolean;
  license_url?: string; attribution?: string; changes?: string;
  cameras: { name: string; file: string; size: number; timeline_start_seconds?: number }[];
};
const hallway = [
  { id: "hallway-two", title: "Người đi bộ · 2 camera giả lập", description: "Hai góc cắt từ cùng video hành lang, cùng người xuất hiện. Clip ngắn để thử luồng xử lý; không phải hai camera thực.",
    cameras: [
      { name: "Camera 1", file: "CAM-1.mp4", size: 172471 },
      { name: "Camera 2", file: "CAM-2.mp4", size: 159780 },
    ] },
  { id: "hallway-three", title: "Người đi bộ · 3 camera giả lập", description: "Ba góc cắt của cùng cảnh hành lang. Dữ liệu đầu vào chưa vẽ khung bao; Kaggle chạy lại AI mỗi lần bấm.",
    cameras: [
      { name: "Camera 1", file: "CAM-1.mp4", size: 172471 },
      { name: "Camera 2", file: "CAM-2.mp4", size: 159780 },
      { name: "Camera 3", file: "CAM-3.mp4", size: 172372 },
    ] },
] as const;
export const SAMPLE_INPUT_PREFIX = "samples/hallway-v1";
export const DEMO_SAMPLES: DemoSample[] = [
  ...datasets.map(scene => ({ ...scene, storage_prefix: "samples", research_only: false })),
  ...hallway.map(scene => ({ ...scene, cameras: [...scene.cameras], source_name: "Hallway simulation",
    source_url: "https://github.com/intel-iot-devkit/sample-videos", license: "Research demo · source attribution",
    challenge: "Smoke test · một người · camera giả lập", simulation: true, duration_seconds: 3,
    storage_prefix: SAMPLE_INPUT_PREFIX })),
];

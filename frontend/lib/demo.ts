export type DemoRoutePoint = {
  sequence: number;
  camera: string;
  area: string;
  time: string;
  lat: number;
  lng: number;
  kind: "camera" | "interpolated";
};

export const DEMO_ROUTE: DemoRoutePoint[] = [
  {
    sequence: 1,
    camera: "CAM-DEMO-01",
    area: "Cổng chính Campus II",
    time: "08:15:10",
    lat: 10.03092,
    lng: 105.78255,
    kind: "camera",
  },
  {
    sequence: 2,
    camera: "MỐC-NỘI-SUY-01",
    area: "Trục đường nội khu",
    time: "08:16:02",
    lat: 10.03142,
    lng: 105.78334,
    kind: "interpolated",
  },
  {
    sequence: 3,
    camera: "MỐC-NỘI-SUY-02",
    area: "Khu giảng đường",
    time: "08:17:18",
    lat: 10.03208,
    lng: 105.78408,
    kind: "interpolated",
  },
  {
    sequence: 4,
    camera: "CAM-DEMO-02",
    area: "Khuôn viên trung tâm",
    time: "08:18:27",
    lat: 10.03162,
    lng: 105.78486,
    kind: "camera",
  },
];

export const DEMO_QUERY = {
  personId: "DEMO-PERSON-001",
  similarity: 0.92,
  duration: "03:17",
  campus: "Campus II · Đại học Cần Thơ",
};

import {
  Cpu,
  Database,
  GitBranch,
  Map,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";

const layers = [
  ["01", "Dữ liệu & đa cảm biến", "RTSP từ camera IP; BLE/IMU là hướng mở rộng."],
  ["02", "Phát hiện & tracking", "YOLOv8 + ByteTrack/StrongSORT duy trì tracklet nội camera."],
  ["03", "Đặc trưng Re-ID", "ResNet50-CBAM, ViT-base hoặc AlignedReID tạo embedding."],
  ["04", "Đối sánh vector", "Cosine similarity; bản hiện tại dùng Supabase pgvector."],
  ["05", "Handover camera", "Dự đoán camera kế tiếp và nối các đoạn hành trình."],
  ["06", "Quỹ đạo & giao diện", "Ghép mốc thời gian, nội suy và hiển thị trên bản đồ."],
] as const;

const technologies = [
  [Cpu, "Computer Vision", "YOLOv8 · OpenCV"],
  [GitBranch, "Tracking & Re-ID", "ByteTrack · embedding 512D"],
  [Database, "Dữ liệu", "FastAPI · Supabase · pgvector"],
  [Map, "Trực quan hóa", "Leafmap · bản đồ vệ tinh"],
] as const;

export function ResearchContext() {
  return (
    <section className="panel research-panel" aria-labelledby="research-heading">
      <div className="research-heading">
        <div>
          <p className="section-kicker">Theo đề cương bài báo</p>
          <h2 id="research-heading">Kiến trúc Outlier Re-ID</h2>
          <p>
            Hệ thống được thiết kế theo pipeline sáu lớp: từ thu nhận video, phát hiện người,
            Re-ID đến dựng lại hành trình trong khuôn viên.
          </p>
        </div>
        <div className="research-status">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Demo đang dùng dữ liệu mô phỏng</span>
        </div>
      </div>

      <div className="research-note" role="note">
        <strong>Phạm vi hiện tại</strong>
        <span>
          Camera, video, truy vấn, Supabase và bản đồ demo đã có. AI Worker, BLE/IMU và nhận
          dạng Re-ID thật vẫn là phần triển khai tiếp theo.
        </span>
      </div>

      <div className="architecture-layout">
        <figure className="research-figure">
          <Image
            src="/baibao/six_layer_architecture_1789182174999.jpg"
            alt="Sơ đồ kiến trúc sáu lớp của hệ thống Outlier Re-ID"
            width={1200}
            height={720}
          />
          <figcaption>Kiến trúc sáu lớp được rút gọn từ tài liệu nghiên cứu.</figcaption>
        </figure>

        <ol className="layer-list" aria-label="Sáu lớp xử lý">
          {layers.map(([number, title, detail]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <strong>{title}</strong>
                <small>{detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="research-flow">
        <div className="research-flow-copy">
          <p className="section-kicker">End-to-end data flow</p>
          <h3>Luồng dữ liệu chính</h3>
          <p>
            Camera IP → phát hiện/tracking → embedding Re-ID → tìm kiếm vector → nối mốc camera
            → cập nhật quỹ đạo và dashboard.
          </p>
          <div className="technology-grid">
            {technologies.map(([Icon, title, detail]) => (
              <div className="technology-item" key={title}>
                <Icon size={17} aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <figure className="research-figure research-figure-flow">
          <Image
            src="/baibao/data_flow_diagram_1789182470485.jpg"
            alt="Sơ đồ luồng dữ liệu end-to-end của hệ thống"
            width={1200}
            height={720}
          />
          <figcaption>Luồng dữ liệu end-to-end.</figcaption>
        </figure>
      </div>
    </section>
  );
}

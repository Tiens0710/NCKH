import type { Metadata } from "next";
import { LiveDemoUpload } from "@/components/LiveDemoUpload";
import "./public-demo.css";

export const metadata: Metadata = {
  title: "Demo đa camera · RF-DETR & StrongSORT",
  description: "Chọn video gốc, chạy RF-DETR và StrongSORT trên Kaggle, theo dõi tiến độ và xem kết quả mới.",
};

export default function DemoPage() {
  return <main id="main-content" className="pd-page">
    <a className="pd-skip-link" href="#upload-videos">Đến khu vực xử lý video</a>
    <header className="pd-topbar"><a className="pd-brand" href="/demo">OUTLIER <small>ĐA CAMERA</small></a><span className="pd-research-tag">Bản nghiên cứu</span></header>
    <section className="pd-live-intro"><h1>Theo dõi. <span>Tìm người.</span></h1>
      <p>Video ghi sẵn hoặc đoạn ghi camera · phát hiện, đối chiếu và xem các lần xuất hiện.</p></section>
    <LiveDemoUpload />
    <footer className="pd-live-footer">Nghiên cứu phi thương mại · Ngoại hình ước lượng, không xác minh danh tính.</footer>
  </main>;
}

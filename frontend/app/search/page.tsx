"use client";

import { ImagePlus, ScanSearch, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorNotice } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

type CreatedSearch = { id: string };

export default function SearchPage() {
  const router = useRouter();
  const [image, setImage] = useState<File | null>(null);
  const [threshold, setThreshold] = useState("0.65");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : ""), [image]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image) return;
    setSubmitting(true); setError("");
    const body = new FormData();
    body.append("image", image);
    body.append("similarity_threshold", threshold);
    if (startTime) body.append("start_time", new Date(startTime).toISOString());
    if (endTime) body.append("end_time", new Date(endTime).toISOString());
    try {
      const result = await apiFetch<CreatedSearch>("/api/searches", { method: "POST", body });
      router.push(`/results/${result.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tạo được truy vấn.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Truy vấn Re-ID"
        title="Tìm kiếm một người"
        description="Cung cấp ảnh rõ toàn thân hoặc nửa thân; hệ thống sẽ đối sánh trên các camera trong khoảng thời gian đã chọn."
        action={<Link className="button button-secondary" href="/results/demo">Xem kết quả demo</Link>}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <form className="search-layout" onSubmit={handleSubmit}>
        <section className="panel query-image-panel">
          <p className="section-kicker">Ảnh truy vấn</p><h2>Chọn ảnh tham chiếu</h2>
          <label className={`image-dropzone ${preview ? "has-preview" : ""}`}>
            <input type="file" accept="image/*" required onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            {preview ? <Image src={preview} alt="Ảnh người dùng đã chọn để tìm kiếm" width={720} height={720} unoptimized /> : <><ImagePlus size={34} strokeWidth={1.5} /><strong>Chọn hoặc kéo ảnh vào đây</strong><span>JPG, PNG hoặc WebP · tối đa 10 MB</span></>}
          </label>
          <div className="privacy-note"><ShieldCheck size={18} /><p><strong>Dữ liệu riêng tư</strong><span>Ảnh được lưu trong bucket riêng tư và chỉ backend có quyền truy cập.</span></p></div>
        </section>

        <aside className="panel form-panel">
          <p className="section-kicker">Điều kiện</p><h2>Phạm vi tìm kiếm</h2>
          <div className="stack-form">
            <label className="field"><span>Từ thời điểm</span><input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
            <label className="field"><span>Đến thời điểm</span><input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
            <label className="field range-field"><span>Ngưỡng tương đồng <output>{Math.round(Number(threshold) * 100)}%</output></span><input type="range" min="0.4" max="0.95" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
            <div className="threshold-guide"><span>Ít nghiêm ngặt</span><span>Cân bằng</span><span>Chính xác cao</span></div>
            <button className="button button-primary button-full" type="submit" disabled={!image || submitting}><ScanSearch size={18} />{submitting ? "Đang tạo truy vấn..." : "Bắt đầu tìm kiếm"}</button>
          </div>
        </aside>
      </form>
    </>
  );
}

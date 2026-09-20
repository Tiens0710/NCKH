"use client";

import { Camera as CameraIcon, MapPin, Plus, Radio } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorNotice, LoadingRows } from "@/components/Feedback";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch, formatDate } from "@/lib/api";
import type { Camera } from "@/lib/types";

const initialForm = { name: "", area: "", stream_url: "", map_x: "", map_y: "" };

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCameras = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCameras(await apiFetch<Camera[]>("/api/cameras"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được camera.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<Camera[]>("/api/cameras")
      .then((data) => {
        if (active) setCameras(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được camera.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch<Camera>("/api/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          area: form.area || null,
          stream_url: form.stream_url || null,
          map_x: form.map_x ? Number(form.map_x) : null,
          map_y: form.map_y ? Number(form.map_y) : null,
          metadata: {},
        }),
      });
      setForm(initialForm);
      setSuccess("Đã thêm camera vào hệ thống.");
      await loadCameras();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể thêm camera.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Nguồn dữ liệu" title="Quản lý camera" description="Khai báo vị trí và luồng camera để gắn video với đúng khu vực quan sát." />
      {error ? <ErrorNotice message={error} /> : null}
      {success ? <div className="notice notice-success" role="status"><Radio size={19} />{success}</div> : null}

      <div className="split-layout">
        <section className="panel">
          <div className="panel-heading"><div><p className="section-kicker">Danh sách</p><h2>{cameras.length} camera</h2></div></div>
          {loading ? <LoadingRows /> : cameras.length === 0 ? (
            <EmptyState title="Chưa có camera" description="Thêm camera đầu tiên bằng biểu mẫu bên cạnh." />
          ) : (
            <ul className="camera-list">
              {cameras.map((camera) => (
                <li key={camera.id}>
                  <span className="camera-icon"><CameraIcon size={20} /></span>
                  <div className="camera-main"><strong>{camera.name}</strong><span><MapPin size={14} />{camera.area || "Chưa đặt khu vực"}</span></div>
                  <div className="camera-meta"><span className={camera.is_active ? "online" : "offline"}>{camera.is_active ? "Hoạt động" : "Tạm dừng"}</span><small>{formatDate(camera.created_at)}</small></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel form-panel">
          <p className="section-kicker">Thiết lập</p><h2>Thêm camera</h2><p className="panel-copy">RTSP URL được lưu ở backend; không hiển thị công khai trên giao diện.</p>
          <form className="stack-form" onSubmit={handleSubmit}>
            <Field label="Tên camera" required><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: CAM-CONG-01" /></Field>
            <Field label="Khu vực"><input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Cổng chính" /></Field>
            <Field label="RTSP URL"><input value={form.stream_url} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} placeholder="rtsp://..." /></Field>
            <div className="field-row">
              <Field label="Tọa độ X"><input type="number" step="any" value={form.map_x} onChange={(e) => setForm({ ...form, map_x: e.target.value })} /></Field>
              <Field label="Tọa độ Y"><input type="number" step="any" value={form.map_y} onChange={(e) => setForm({ ...form, map_y: e.target.value })} /></Field>
            </div>
            <button className="button button-primary button-full" disabled={saving} type="submit"><Plus size={18} />{saving ? "Đang lưu..." : "Thêm camera"}</button>
          </form>
        </aside>
      </div>
    </>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required ? <em> *</em> : null}</span>{children}</label>;
}

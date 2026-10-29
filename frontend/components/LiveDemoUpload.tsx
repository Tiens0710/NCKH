"use client";

import { useEffect, useState } from "react";
import type { PublicDemoResult } from "@/lib/public-demo";
import { DEMO_SAMPLES } from "@/lib/demo-samples";
import { PersonSearchResults } from "./PersonSearchResults";

type Access = { id: string; token: string };
type Status = { status: string; stage: string; progress: number; worker_online: boolean; message?: string; result?: PublicDemoResult };
const SESSION = "multicam-demo-job-v1";
type CameraFields = { name: string; offset: string; lat: string; lng: string };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store", signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Không kết nối được máy chủ.");
  return data;
}

export function LiveDemoUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [cameraFields, setCameraFields] = useState<CameraFields[]>([]);
  const [consent, setConsent] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"sample" | "upload" | "rtsp">("sample");
  const [sampleId, setSampleId] = useState<string>(DEMO_SAMPLES[0].id);
  const [startedId, setStartedId] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const sample = DEMO_SAMPLES.find(item => item.id === sampleId)!;

  useEffect(() => {
    let cancelled = false;
    // Restore the browser-only capability after hydration, outside the effect's sync render path.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = JSON.parse(sessionStorage.getItem(SESSION) ?? "null");
        if (stored && typeof stored.id === "string" && typeof stored.token === "string") setAccess(stored);
      } catch { sessionStorage.removeItem(SESSION); }
    });
    async function check() {
      try { const data = await api("/api/demo/jobs"); if (!cancelled) setOnline(data.worker_online); }
      catch { if (!cancelled) setOnline(false); }
    }
    void check(); const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data: Status = await api(`/api/demo/jobs/${access!.id}`, { headers: { Authorization: `Bearer ${access!.token}` } });
        if (cancelled) return;
        setStatus(data); setOnline(data.worker_online);
        if (data.status === "queued" || data.status === "processing") setStartedId(access!.id);
        if (!["completed", "failed", "uploading"].includes(data.status)) timer = setTimeout(poll, 5000);
      } catch (failure) { if (!cancelled) { setError((failure as Error).message); timer = setTimeout(poll, 15000); } }
    }
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [access]);

  async function startSample() {
    setError(""); setBusy(true); setStatus(null); setAccess(null); setStartedId(null); setShowPrevious(false);
    setUpload("Đang gửi bộ video mẫu sang Kaggle…");
    try {
      const job: Access = await api("/api/demo/samples", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample_id: sampleId }) });
      sessionStorage.setItem(SESSION, JSON.stringify({ id: job.id, token: job.token }));
      setStartedId(job.id); setAccess({ id: job.id, token: job.token });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); setUpload(""); }
  }

  async function start() {
    if (files.length < 2 || files.length > 3 || files.some(file => file.size > 48 * 1024 * 1024)) {
      setError("Chọn 2–3 video, mỗi video tối đa 48 MB."); return;
    }
    const submittedFiles = files.map((file, index) => {
      const fields = cameraFields[index];
      return { name: file.name, size: file.size, type: file.type, camera_name: fields.name,
        ...(fields.offset.trim() ? { timeline_start_seconds: Number(fields.offset) } : {}),
        ...(fields.lat.trim() || fields.lng.trim() ? { location: { lat: Number(fields.lat), lng: Number(fields.lng) } } : {}) };
    });
    if (cameraFields.some(fields => !fields.name.trim() || (!!fields.lat.trim() !== !!fields.lng.trim())) ||
        submittedFiles.some(file => file.timeline_start_seconds !== undefined && (!Number.isFinite(file.timeline_start_seconds) || file.timeline_start_seconds < 0 || file.timeline_start_seconds > 86400) ||
          file.location && (!Number.isFinite(file.location.lat) || Math.abs(file.location.lat) > 90 || !Number.isFinite(file.location.lng) || Math.abs(file.location.lng) > 180))) {
      setError("Kiểm tra tên, mốc bắt đầu (0–86400 giây) và cặp vĩ độ/kinh độ của từng camera."); return;
    }
    setError(""); setBusy(true); setStatus(null); setAccess(null); setStartedId(null); setShowPrevious(false);
    let pendingAccess: Access | null = null;
    try {
      const job: Access & { uploads: { url: string }[] } = await api("/api/demo/jobs", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent,
          files: submittedFiles }) });
      sessionStorage.setItem(SESSION, JSON.stringify({ id: job.id, token: job.token }));
      pendingAccess = { id: job.id, token: job.token };
      setStartedId(job.id);
      setAccess(pendingAccess);
      // Direct signed uploads avoid sending large files through the web server.
      for (let index = 0; index < files.length; index++) {
        setUpload(`Đang tải camera ${index + 1}/${files.length}…`);
        const response = await fetch(job.uploads[index].url, { method: "PUT", body: files[index],
          headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`Tải video camera ${index + 1} thất bại. Hãy thử lại.`);
      }
      await api(`/api/demo/jobs/${job.id}`, { method: "POST", headers: { Authorization: `Bearer ${job.token}` } });
      setAccess({ id: job.id, token: job.token }); setUpload("");
    } catch (failure) {
      // A transport timeout can happen after Storage accepted all bytes.
      // Server verifies every stored size before enqueueing; never create a duplicate job.
      if (pendingAccess) {
        try {
          await api(`/api/demo/jobs/${pendingAccess.id}`, { method: "POST", headers: { Authorization: `Bearer ${pendingAccess.token}` } });
          setAccess({ ...pendingAccess });
          return;
        } catch { /* Keep the capability so the guest can retry finalization or delete. */ }
      }
      setError((failure as Error).name === "TimeoutError" ? "Kết nối hết thời gian chờ. Có thể video đã tải xong; hãy bấm Xác nhận lại bên dưới." : (failure as Error).message);
    }
    finally { setBusy(false); setUpload(""); }
  }
  async function resumeSubmit() {
    if (!access) return;
    setBusy(true); setError("");
    try {
      await api(`/api/demo/jobs/${access.id}`, { method: "POST", headers: { Authorization: `Bearer ${access.token}` } });
      setAccess({ ...access });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function openCameraJob(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 4096) throw new Error("File phiên camera không hợp lệ.");
      const receipt = JSON.parse(await file.text());
      if (receipt.kind !== "outlier-camera-job" || typeof receipt.id !== "string" || !/^[0-9a-f-]{36}$/.test(receipt.id) ||
          typeof receipt.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(receipt.token)) throw new Error("Chọn file access.json do bộ thu camera tạo ra.");
      sessionStorage.setItem(SESSION, JSON.stringify({ id: receipt.id, token: receipt.token }));
      setStatus(null); setStartedId(receipt.id); setShowPrevious(false); setAccess({ id: receipt.id, token: receipt.token });
    } catch (failure) { setError((failure as Error).message); }
  }

  function downloadResult() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(status?.result, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `multicam-${access?.id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function removeJob() {
    if (!access) return;
    if (!window.confirm("Xóa video và kết quả của lần chạy này khỏi máy chủ? Không thể khôi phục.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/demo/jobs/${access.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${access.token}` } });
      sessionStorage.removeItem(SESSION); setAccess(null); setStatus(null);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const processing = status?.status === "queued" || status?.status === "processing";
  const currentJob = startedId === access?.id;
  const visibleStatus = status && (currentJob || processing || showPrevious || status.status === "uploading");
  const visibleResult = status?.result && (currentJob || showPrevious);
  return <section className="pd-upload" id="upload-videos" aria-labelledby="upload-title">
    <div className="pd-upload-heading"><h2 id="upload-title">Không gian AI</h2>
      <span className={`pd-worker-badge ${online ? "is-online" : ""}`} role="status">{online === null ? "Đang kết nối…" : online ? "● GPU sẵn sàng" : "○ GPU ngoại tuyến"}</span></div>
    <details className="pd-input-panel" open={!visibleResult}><summary>Video đầu vào <span>Chọn nguồn & chạy AI</span></summary>
    <div className="pd-input-tabs" role="group" aria-label="Nguồn video">
      <button aria-pressed={mode === "sample"} disabled={busy || processing} onClick={() => { setMode("sample"); setStartedId(null); setShowPrevious(false); }}>Video mẫu</button>
      <button aria-pressed={mode === "upload"} disabled={busy || processing} onClick={() => { setMode("upload"); setStartedId(null); setShowPrevious(false); }}>Tải lên</button>
      <button aria-pressed={mode === "rtsp"} disabled={busy || processing} onClick={() => setMode("rtsp")}>Camera RTSP</button>
    </div>
    {mode === "sample" ? <div className="pd-sample-inputs">
      <label className="pd-dataset-label">Bộ video<select name="sample" value={sampleId} disabled={busy || processing} onChange={event => { setSampleId(event.target.value); setStartedId(null); setShowPrevious(false); }}>
        <optgroup label="Camera thật · i.c.sens">{DEMO_SAMPLES.filter(item => !item.simulation).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
        <optgroup label="Góc giả lập · PersonPath22 và mẫu cơ bản">{DEMO_SAMPLES.filter(item => item.simulation).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
      </select></label>
      <div className="pd-dataset-meta"><span>{sample.cameras.length} camera {sample.simulation ? "giả lập" : "thật"}</span><span>{sample.duration_seconds}s</span><span>Video gốc · chưa xử lý</span></div>
      <div className="pd-guest-grid pd-input-grid">{sample.cameras.map(camera => <article key={`${sample.id}-${camera.file}`}><h3>{camera.name}</h3>
        <video controls playsInline muted preload="metadata" poster={sample.attribution ? `/demo/samples/${camera.file.replace(/\.mp4$/, ".jpg")}` : undefined} src={`/demo/samples/${camera.file}`} />
      </article>)}</div>
      <details className="pd-source-notice"><summary>Nguồn & thông tin</summary>
        <p>{sample.description} · {sample.challenge}</p>
        <p><a href={sample.source_url} target="_blank" rel="noreferrer">{sample.source_name}</a> · {sample.license_url ? <a href={sample.license_url} target="_blank" rel="noreferrer">{sample.license}</a> : sample.license}</p>
        {sample.attribution ? <><p>{sample.attribution}</p><p>{sample.changes}</p><a href="/demo/samples/OPEN-DATA-ATTRIBUTION.json" download>Tải ghi nguồn</a></> : null}
        <p>Phi thương mại. Video từ dataset, không phải camera trực tiếp. Ghép ID là gợi ý từ ngoại hình và khuôn mặt khi đủ rõ, chưa xác minh danh tính. Mỗi lần chạy tạo kết quả mới trên Kaggle.</p>
      </details>
    </div> : mode === "rtsp" ? <div className="pd-source-notice">
      <h3>Đoạn ghi từ camera trực tiếp</h3>
      <p>Bộ thu chạy trên máy cùng mạng camera, ghi đoạn ngắn rồi gửi vào AI. Địa chỉ và mật khẩu RTSP được giữ ở máy thu.</p>
      <p>Chọn file access.json sau khi bộ thu gửi video để theo dõi tiến độ và xem kết quả tại đây. Hiện chưa có phát trực tiếp hoặc giám sát liên tục 24/7.</p>
      <label className="pd-file-label">Mở phiên camera<input type="file" accept="application/json,.json" disabled={busy || processing}
        onChange={event => { void openCameraJob(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    </div> : <>
    <p>2–3 video · tối đa 48 MB/video · xử lý 30 giây đầu.</p>
    <label className="pd-file-label">Chọn video camera
      <input type="file" multiple accept=".mp4,.mov,.avi,.mkv,.webm" disabled={busy || processing}
        onChange={event => { const selected = Array.from(event.target.files ?? []); setFiles(selected);
          setCameraFields(selected.map((_, index) => ({ name: `Camera ${index + 1}`, offset: "", lat: "", lng: "" })));
          setError(""); setStartedId(null); setShowPrevious(false); }} /></label>
    {files.length ? <ol>{files.map((file, index) => <li key={`${index}-${file.name}`}>Camera {index + 1}: {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ol> : null}
    {files.length ? <details className="pd-source-notice"><summary>Tên, thời gian & vị trí camera</summary>
      <p>Mốc bắt đầu tính bằng giây từ cùng một thời điểm ghi hình. Nếu không biết, để trống: hệ thống không suy ra thứ tự di chuyển. Tọa độ là vị trí camera, không phải GPS của người.</p>
      {files.map((file, index) => <fieldset key={`${index}-${file.name}`} className="pd-camera-fields"><legend>{file.name}</legend>
        {([['name', 'Tên camera'], ['offset', 'Mốc bắt đầu (giây)'], ['lat', 'Vĩ độ'], ['lng', 'Kinh độ']] as const).map(([field, label]) =>
          <label key={field}>{label}<input type={field === 'name' ? 'text' : 'number'} step={field === 'name' ? undefined : 'any'}
            maxLength={field === 'name' ? 120 : undefined} disabled={busy || processing} value={cameraFields[index]?.[field] ?? ''}
            onChange={event => setCameraFields(rows => rows.map((row, position) => position === index ? { ...row, [field]: event.target.value } : row))} /></label>)}
      </fieldset>)}
    </details> : null}
    <label className="pd-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || processing} />
      Tôi có quyền sử dụng video và đồng ý gửi tới Storage/Kaggle để xử lý.</label>
    <details className="pd-source-notice"><summary>Định dạng & quyền riêng tư</summary><p>MP4, MOV, AVI, MKV, WEBM. Phân tích tối đa 10 ảnh/giây tùy FPS nguồn. Không tải video riêng tư hoặc nhạy cảm. Kết quả truy cập trong phiên này; dữ liệu lưu trên máy chủ đến khi bạn xóa.</p></details>
    </>}
    {mode !== "rtsp" ? <button className="pd-primary" onClick={mode === "sample" ? startSample : start} disabled={busy || processing || (mode === "upload" && (!consent || files.length < 2 || files.length > 3)) || online !== true}>
      {busy ? upload || "Đang gửi…" : processing ? "Đang xử lý…" : "Chạy AI"}</button>
      : null}
    {online === false ? <p className="pd-inline-note">Bật worker Kaggle để chạy AI. Video gốc vẫn xem được.</p> : null}
    </details>
    {error ? <p role="alert" className="pd-upload-error">{error}</p> : null}
    {status?.status === "completed" && !currentJob && !showPrevious ? <div className="pd-previous"><span>Kết quả gần nhất</span><button onClick={() => setShowPrevious(true)}>Xem kết quả</button></div> : null}
    {visibleStatus && status.status !== "completed" ? <div className="pd-job-status" aria-live="polite"><strong>{status.stage}</strong>
      <progress value={status.progress} max="1" aria-label="Tiến độ xử lý AI" />
      <span>{Math.round(status.progress * 100)}%</span>
      {status.message ? <p>{status.message}</p> : null}
      {status.status === "uploading" ? <button onClick={resumeSubmit} disabled={busy || online !== true}>Xác nhận lại video đã tải lên</button> : null}
      {!processing ? <button onClick={removeJob} disabled={busy}>Xóa lần chạy</button> : null}
      {!status.worker_online && processing ? <p>Worker mất kết nối. Trang sẽ tự kiểm tra lại; đừng gửi video trùng.</p> : null}
    </div> : null}
    {visibleResult && status?.result ? <div className="pd-guest-result"><div className="pd-result-heading"><h3>Kết quả</h3><span>{currentJob ? "Đã xử lý" : "Lần chạy trước"}</span></div>
      {access ? <PersonSearchResults key={access.id} result={status.result} access={access} /> : null}
      <details className="pd-run-details"><summary>Chi tiết lần chạy</summary>
        <p>Mã: {access?.id} · {status.result.detector.name} · {status.result.detector.device}</p>
        <p>{status.result.tracks.length} track (không phải số người duy nhất) · {status.result.links.length} liên kết gợi ý · {status.result.metrics.processing_fps.toFixed(1)} FPS xử lý</p>
        {status.result.face_analysis?.enabled ? <p>Khuôn mặt: RetinaFace + AdaFace · {status.result.face_analysis.tracks_with_face ?? 0}/{status.result.face_analysis.tracks_total ?? status.result.tracks.length} track có ảnh mặt đủ rõ. Ghép ID là gợi ý, chưa xác minh danh tính.</p> : null}
        <div className="pd-run-actions"><button onClick={downloadResult}>Tải JSON</button><button className="pd-danger" onClick={removeJob} disabled={busy}>Xóa lần chạy</button></div>
      </details>
    </div> : null}
  </section>;
}

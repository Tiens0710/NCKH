"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Download, Play, Upload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TrackedVideo } from "@/components/TrackedVideo";
import { ApiError, apiFetch, formatDate } from "@/lib/api";
import {
  resultUrl,
  type MultiCameraResult,
  type RunStatus,
} from "@/lib/multicam";

const statuses = {
  queued: "Đang khởi động",
  running: "Đang xử lý",
  completed: "Hoàn thành",
  failed: "Xử lý thất bại",
};

export default function MultiCameraPage() {
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<RunStatus | null>(null);
  const [history, setHistory] = useState<RunStatus[]>([]);
  const [result, setResult] = useState<MultiCameraResult | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pollError, setPollError] = useState("");
  const [actionError, setActionError] = useState("");
  const error = actionError || pollError || historyError;
  const initialSelection = useRef(true);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refreshHistory() {
      try {
        const rows = await apiFetch<RunStatus[]>("/api/multicam/runs", {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHistoryError("");
        setHistory(rows);
        if (initialSelection.current && rows[0]) setRunId(rows[0].run_id);
        initialSelection.current = false;
        if (
          rows.some(
            (row) => row.status === "running" || row.status === "queued",
          )
        )
          timer = setTimeout(refreshHistory, 5000);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setHistoryError(
            reason instanceof Error ? reason.message : "Không tải được lịch sử",
          );
          timer = setTimeout(refreshHistory, 5000);
        }
      }
    }
    void refreshHistory();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [connectionAttempt]);
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const current = await apiFetch<RunStatus>(
          `/api/multicam/runs/${runId}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setPollError("");
        setRun(current);
        setHistory((rows) => [
          current,
          ...rows.filter((row) => row.run_id !== current.run_id),
        ]);
        if (current.status === "completed") {
          const data = await apiFetch<MultiCameraResult>(
            `/api/multicam/runs/${runId}/result`,
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) setResult(data);
        } else if (current.status !== "failed") timer = setTimeout(poll, 2000);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setPollError(
            reason instanceof Error
              ? reason.message
              : "Không tải được trạng thái",
          );
          if (
            !(
              reason instanceof ApiError &&
              [404, 409, 422].includes(reason.status)
            )
          )
            timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [runId, connectionAttempt]);
  function selectRun(id: string) {
    if (id === runId) return;
    initialSelection.current = false;
    setResult(null);
    setRun(null);
    setActionError("");
    setPollError("");
    setRunId(id);
  }
  async function start(demo: boolean) {
    initialSelection.current = false;
    setBusy(true);
    setActionError("");
    try {
      let init: RequestInit = { method: "POST" };
      if (!demo) {
        const data = new FormData();
        files.forEach((file) => data.append("files", file));
        data.append("offsets", JSON.stringify(offsets));
        init = { ...init, body: data };
      }
      const current = await apiFetch<RunStatus>(
        `/api/multicam/${demo ? "demo" : "upload"}`,
        init,
      );
      selectRun(current.run_id);
      setRun(current);
      setConnectionAttempt((value) => value + 1);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Không khởi động được phiên xử lý",
      );
    } finally {
      setBusy(false);
    }
  }
  function upload(event: FormEvent) {
    event.preventDefault();
    void start(false);
  }
  const active =
    history.some(
      (row) => row.status === "running" || row.status === "queued",
    ) ||
    run?.status === "running" ||
    run?.status === "queued";
  return (
    <div className="mc-page">
      <PageHeader
        eyebrow="THỬ NGHIỆM ĐA CAMERA"
        title="Một người, nhiều camera"
        description="Chạy demo ba video, xem khung bao và theo dõi những lần xuất hiện giữa các camera."
      />
      <section className="panel mc-launch">
        <div>
          <span className="mc-pill">
            <Camera size={14} />3 camera giả lập
          </span>
          <h2>Bắt đầu với video có sẵn</h2>
          <p>
            Cùng một đoạn video người đi bộ, thay đổi ánh sáng và lật hình. Mốc
            thời gian là giả lập; đây là demo luồng xử lý, chưa phải benchmark
            Re-ID.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={busy || active}
          onClick={() => void start(true)}
        >
          <Play size={17} />
          {busy ? "Đang gửi…" : "Chạy demo 3 camera"}
        </button>
      </section>
      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => { setActionError(""); setConnectionAttempt((value) => value + 1); }}
          >
            Thử kết nối lại
          </button>
        </div>
      ) : null}
      <details className="panel mc-upload">
        <summary>Dùng các video của bạn</summary>
        <form onSubmit={upload}>
          <p>
            Chọn 2–8 video, tối đa 48 MB/video. Nhập thời điểm bắt đầu tương đối
            với cùng một mốc; thứ tự chọn file tương ứng camera 1, 2…
          </p>
          <label>
            Video camera
            <input
              type="file"
              multiple
              accept=".mp4,.avi,.mov,.mkv,.webm"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                setFiles(selected);
                setOffsets(selected.map(() => 0));
              }}
            />
          </label>
          {files.map((file, index) => (
            <label className="mc-file" key={`${file.name}-${index}`}>
              <span>
                Camera {index + 1} · {file.name}
              </span>
              <span>
                Bắt đầu (giây)
                <input
                  type="number"
                  min="0"
                  max="86400"
                  step="0.1"
                  required
                  value={offsets[index] ?? 0}
                  onChange={(event) =>
                    setOffsets((values) =>
                      values.map((value, position) =>
                        position === index ? Number(event.target.value) : value,
                      ),
                    )
                  }
                />
              </span>
            </label>
          ))}
          <button
            className="button button-secondary"
            disabled={
              busy ||
              active ||
              files.length < 2 ||
              files.length > 8 ||
              files.some((file) => file.size > 48 * 1024 * 1024)
            }
          >
            <Upload size={16} />
            Xử lý các video
          </button>
          {files.some((file) => file.size > 48 * 1024 * 1024) ? (
            <p role="alert">Có video vượt quá 48 MB. Hãy chọn video nhỏ hơn.</p>
          ) : null}
          {files.length > 8 ? (
            <p role="alert">Mỗi phiên hỗ trợ tối đa 8 camera.</p>
          ) : null}
        </form>
      </details>
      <section className="panel mc-progress" aria-live="polite">
        <div className="mc-row">
          <h2>{run ? statuses[run.status] : "Sẵn sàng chạy"}</h2>
          <label>
            Phiên xử lý
            <select
              value={runId}
              onChange={(event) => selectRun(event.target.value)}
            >
              <option value="" disabled>
                Chọn phiên
              </option>
              {history.map((row) => (
                <option key={row.run_id} value={row.run_id}>
                  {formatDate(row.updated_at)} · {statuses[row.status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {run ? (
          <>
            <progress max="1" value={run.progress} aria-label="Tiến độ xử lý" />
            <p>
              {Math.round(run.progress * 100)}% · {run.camera_id ?? run.stage} ·{" "}
              {run.frames_processed ?? 0} frame đã xử lý
              {run.elapsed_seconds ? ` · ${run.elapsed_seconds}s` : ""}
            </p>
            {run.message ? (
              <p role={run.status === "failed" ? "alert" : undefined}>
                {run.message}
              </p>
            ) : null}
            <details>
              <summary>Log xử lý</summary>
              <pre className="mc-log">
                {run.log_tail ?? "Phiên chạy từ CLI; xem log trong terminal."}
              </pre>
            </details>
          </>
        ) : (
          <p>Bấm chạy demo để bắt đầu. Kết quả cập nhật tự động.</p>
        )}
      </section>
      {result && runId ? (
        <>
          <div className="notice notice-demo">
            {result.simulation
              ? "Dữ liệu camera giả lập từ cùng nguồn. "
              : "Video được cung cấp bởi người dùng. "}
            Liên kết dựa trên màu trang phục là ứng viên; dấu ? thể hiện chưa
            xác nhận danh tính.
          </div>
          <div className="mc-row">
            <h2>Kết quả xử lý thật</h2>
            <a
              className="button button-secondary"
              href={resultUrl(runId)}
              download
            >
              <Download size={16} />
              Tải JSON
            </a>
          </div>
          <div className="mc-stats">
            <div className="panel">
              <small>Mô hình</small>
              <strong>{result.detector.name}</strong>
              <span>
                {result.detector.fine_tuned ? "Fine-tuned" : "Pretrained"} ·{" "}
                {result.detector.device}
              </span>
            </div>
            <div className="panel">
              <small>Track / liên kết ứng viên</small>
              <strong>
                {result.tracks.length} / {result.links.length}
              </strong>
            </div>
            <div className="panel">
              <small>Tốc độ xử lý toàn luồng</small>
              <strong>{result.metrics.processing_fps} FPS</strong>
              <span>
                {result.metrics.sampled_frames} frame ·{" "}
                {result.metrics.processing_seconds}s · lấy 1/
                {result.config.frame_stride} frame nguồn
              </span>
            </div>
          </div>
          <div className="mc-camera-grid">
            {result.cameras.map((camera) => (
              <TrackedVideo
                key={`${runId}-${camera.camera_id}`}
                camera={camera}
                runId={runId}
                frameStride={result.config.frame_stride}
              />
            ))}
          </div>
          <section className="panel mc-table">
            <h2>Lịch sử xuất hiện</h2>
            <div className="mc-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Camera</th>
                    <th>ID local</th>
                    <th>ID liên camera?</th>
                    <th>Khoảng thời gian</th>
                    <th>Số mẫu</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tracks.map((track) => (
                    <tr key={track.track_key}>
                      <td>{track.camera_id}</td>
                      <td>L{track.local_track_id}</td>
                      <td>
                        {track.global_person_id
                          ? `${track.global_person_id}?`
                          : "Chưa ghép"}
                      </td>
                      <td>
                        {track.started_seconds.toFixed(2)}–
                        {track.ended_seconds.toFixed(2)}s
                      </td>
                      <td>{track.sample_count}</td>
                      <td>
                        {track.association_status === "candidate"
                          ? "Ứng viên cùng người"
                          : track.association_status === "new_candidate"
                            ? "Ứng viên mới"
                            : track.association_status === "ambiguous"
                              ? "Mơ hồ"
                              : "Chưa đủ mẫu"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.links.length ? (
              <div className="mc-links">
                {result.links.map((link) => (
                  <p key={link.to_track}>
                    {link.from_track} → {link.to_track} ·{" "}
                    {link.global_person_id}? · độ tương đồng{" "}
                    {(link.similarity * 100).toFixed(1)}% · cách{" "}
                    {link.gap_seconds.toFixed(1)}s
                  </p>
                ))}
              </div>
            ) : (
              <p>Chưa có cặp track đủ điều kiện liên kết giữa camera.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

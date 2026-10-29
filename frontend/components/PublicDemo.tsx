"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronRight, Copy, Download, Link2, Pause, Play, Radar, RotateCcw } from "lucide-react";
import { COLOR_SWATCHES, DEMO_ASSETS, type DemoCamera, type DemoColor, type PublicDemoResult } from "@/lib/public-demo";
import { LiveDemoUpload } from "@/components/LiveDemoUpload";

function ColorAttribute({ title, color }: { title: string; color: DemoColor }) {
  const agreement = Math.round((color.vote_fraction ?? 0) * 100);
  return (
    <div className="pd-attribute">
      <span className="pd-swatch" style={{ background: COLOR_SWATCHES[color.name] ?? COLOR_SWATCHES.unknown }} />
      <div><small>{title}</small><strong>{color.label}</strong></div>
      <div className="pd-agreement"><strong>{agreement}%</strong><small>đồng thuận</small></div>
      <div className="pd-meter" aria-hidden="true"><span style={{ width: `${agreement}%` }} /></div>
    </div>
  );
}

export function PublicDemo({ result }: { result: PublicDemoResult }) {
  const [selected, setSelected] = useState(result.cameras[0].camera_id);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const videos = useRef<Record<string, HTMLVideoElement | null>>({});
  const camera = result.cameras.find((item) => item.camera_id === selected) ?? result.cameras[0];
  const track = result.tracks.find((item) => item.camera_id === selected);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function togglePlayback() {
    const elements = Object.values(videos.current).filter((item): item is HTMLVideoElement => item !== null);
    setError("");
    if (playing) {
      elements.forEach((video) => video.pause());
      setPlaying(false);
      return;
    }
    const time = videos.current[selected]?.currentTime ?? 0;
    elements.forEach((video) => { video.currentTime = Math.min(time, Math.max(0, video.duration - .01)) || 0; });
    const outcomes = await Promise.allSettled(elements.map((video) => video.play()));
    if (outcomes.some((outcome) => outcome.status === "rejected")) {
      elements.forEach((video) => video.pause());
      setPlaying(false);
      setError("Chưa phát được video. Bạn có thể thử lại hoặc tải từng clip bên dưới.");
    } else setPlaying(true);
  }

  function restart() {
    Object.values(videos.current).forEach((video) => { if (video) video.currentTime = 0; });
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setError("");
    } catch {
      setError("Hãy sao chép địa chỉ trên thanh trình duyệt để chia sẻ demo.");
    }
  }

  return (
    <main id="main-content" className="pd-page">
      <a className="skip-link" href="#demo-cameras">Chuyển đến video demo</a>
      <header className="pd-topbar">
        <a className="pd-brand" href="/demo"><span><Radar size={23} /></span><div>OUTLIER<small>MULTI-CAMERA RESEARCH</small></div></a>
        <div className="pd-top-actions"><span className="pd-research-tag">BẢN DEMO NGHIÊN CỨU</span><button onClick={() => void share()} className="pd-button pd-ghost">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Đã sao chép" : "Chia sẻ demo"}</button></div>
      </header>

      <section className="pd-intro">
        <div><div className="pd-kicker"><span /> RF-DETR MEDIUM + STRONGSORT</div><h1>Một người.<br /><span>Ba góc nhìn.</span></h1><p>Khám phá cách hệ thống phát hiện, theo dõi và đối chiếu ngoại hình của một người giữa các camera.</p></div>
        <div className="pd-intro-note"><Camera size={22} /><strong>Kết quả AI thật, có dữ liệu đối chiếu.</strong><p>Video bên dưới là kết quả đã xử lý trên Kaggle. Bạn có thể phát lại, chọn camera và kiểm tra dữ liệu từng frame.</p><span>Ảnh MARS → clip camera giả lập</span></div>
      </section>

      <section className="pd-metrics" aria-label="Tóm tắt lần chạy">
        <div><span>CAMERA GIẢ LẬP</span><strong>{result.cameras.length.toString().padStart(2, "0")}</strong><small>Các góc nhìn từ dữ liệu MARS</small></div>
        <div><span>FRAME ĐÃ XỬ LÝ</span><strong>{result.metrics.sampled_frames}</strong><small>{result.cameras[0].frames_sampled} frame mỗi camera</small></div>
        <div><span>TRACK TRONG CAMERA</span><strong>{result.tracks.length.toString().padStart(2, "0")}</strong><small>ID tạm theo từng camera</small></div>
        <div><span>LIÊN KẾT ỨNG VIÊN</span><strong>{result.links.length.toString().padStart(2, "0")}</strong><small>Cần kiểm chứng cùng danh tính</small></div>
      </section>

      <section id="demo-cameras" aria-labelledby="pd-cameras-title">
        <div className="pd-section-head"><div><span className="pd-kicker">PHÒNG QUAN SÁT</span><h2 id="pd-cameras-title">Góc nhìn từ các camera</h2></div><span className="pd-recorded"><span /> Phát lại kết quả AI</span></div>
        <div className="pd-toolbar"><div><button className="pd-button pd-primary" onClick={() => void togglePlayback()}>{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? "Tạm dừng cả 3" : "Phát cả 3 camera"}</button><button className="pd-button pd-ghost" onClick={restart} aria-label="Phát lại từ đầu"><RotateCcw size={17} /><span>Từ đầu</span></button></div><label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Lặp lại clip</label></div>
        {error ? <p className="pd-error" role="alert">{error}</p> : null}
        <div className="pd-camera-grid">
          {result.cameras.map((item, index) => {
            const person = result.tracks.find((entry) => entry.camera_id === item.camera_id);
            return (
              <article key={item.camera_id} className={`pd-camera ${selected === item.camera_id ? "pd-selected" : ""}`}>
                <button className="pd-camera-head" onClick={() => setSelected(item.camera_id)} aria-pressed={selected === item.camera_id}><span><Camera size={16} />{item.camera_id}</span><small>GÓC NHÌN {index + 1}</small></button>
                <div className="pd-video-wrap"><video ref={(element) => { videos.current[item.camera_id] = element; }} controls muted playsInline loop={loop} preload="metadata" poster={`${DEMO_ASSETS}/${item.camera_id}.jpg`} src={`${DEMO_ASSETS}/${item.media_path}`} aria-label={`Video kết quả ${item.camera_id}`} onEnded={() => { if (!loop) setPlaying(false); }} onError={() => setError(`Không tải được video ${item.camera_id}. Hãy thử tải lại trang.`)} /><span className="pd-video-corner">RF-DETR · {item.fps} FPS nguồn</span></div>
                <div className="pd-camera-meta"><span>L{person?.local_track_id ?? "—"}<small>ID trong camera</small></span><span className="pd-person-id">{person?.global_person_id ? `${person.global_person_id}?` : "Chưa ghép"}<small>ID ứng viên</small></span><a href={`${DEMO_ASSETS}/${item.media_path}`} download aria-label={`Tải clip ${item.camera_id}`}><Download size={17} /></a></div>
                <div className="pd-mini-colors">{person ? [person.clothing_colors.upper, person.clothing_colors.lower].map((color, position) => <span key={position}><i style={{ background: COLOR_SWATCHES[color.name] }} />{position === 0 ? "Áo" : "Quần/váy"}: {color.label}</span>) : "Chưa có thuộc tính"}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pd-details-grid">
        <div className="pd-panel pd-inspector"><div className="pd-panel-head"><div><span className="pd-kicker">THUỘC TÍNH NGOẠI HÌNH</span><h2>Đọc màu trang phục</h2></div><span className="pd-camera-chip">{selected}</span></div>
          <div className="pd-camera-tabs" aria-label="Chọn camera để đối chiếu">{result.cameras.map((item) => <button key={item.camera_id} onClick={() => setSelected(item.camera_id)} aria-pressed={selected === item.camera_id}>{item.camera_id}</button>)}</div>
          {track ? <><ColorAttribute title="Áo / thân trên" color={track.clothing_colors.upper} /><ColorAttribute title="Quần, váy / thân dưới" color={track.clothing_colors.lower} /><p className="pd-footnote">Tổng hợp từ {track.sample_count} frame của track. Đồng thuận là tỷ lệ frame cùng nhãn màu, không phải xác suất nhận diện đúng người.</p></> : <p>Chưa có track để đối chiếu.</p>}
        </div>
        <div className="pd-panel"><div className="pd-panel-head"><div><span className="pd-kicker">ĐỐI CHIẾU LIÊN CAMERA</span><h2>Lần xuất hiện & liên kết</h2></div><Link2 size={20} /></div>
          <div className="pd-timeline">{result.cameras.map((item) => { const person = result.tracks.find((entry) => entry.camera_id === item.camera_id); return <div key={item.camera_id}><i /><span><strong>{item.camera_id}</strong><small>Mốc giả lập +{item.timeline_start_seconds}s</small></span><b>{person?.global_person_id ?? "—"}?</b></div>; })}</div>
          {result.links.map((link) => <div className="pd-link" key={`${link.from_track}-${link.to_track}`}><span>{link.from_track}<ChevronRight size={16} />{link.to_track}</span><strong>{(link.similarity * 100).toFixed(1)}% tương đồng</strong><small>Ứng viên từ đặc trưng màu; chưa xác minh danh tính.</small></div>)}
          <p className="pd-footnote">Ba clip lấy từ cùng một ID trong MARS. Hệ thống hiện tách CAM-2 thành ứng viên khác — đây là hạn chế của ghép dựa trên màu.</p>
        </div>
      </section>

      <FrameInspector camera={camera} />

      <footer className="pd-footer"><div><strong>OUTLIER / RESEARCH DEMO</strong><p>Nguồn: <a href={result.source.url} target="_blank" rel="noreferrer">{result.source.name}</a>. Ảnh người được ghép thành clip giả lập, có nhãn ước lượng màu. Đây là phát lại kết quả đã xử lý.</p></div><a className="pd-button pd-ghost" href={`${DEMO_ASSETS}/result.json`} download><Download size={16} />Tải toàn bộ JSON</a><small>RF-DETR Medium · StrongSORT · HSV · GPU {result.detector.device}</small></footer>
      <LiveDemoUpload />
    </main>
  );
}

function FrameInspector({ camera }: { camera: DemoCamera }) {
  const [index, setIndex] = useState(0);
  const frame = camera.frames[Math.min(index, camera.frames.length - 1)];
  return <details className="pd-panel pd-json"><summary><span><span className="pd-kicker">DỮ LIỆU ĐỐI CHIẾU</span><strong>Xem JSON theo frame · {camera.camera_id}</strong></span><span>Mở dữ liệu +</span></summary><label>Frame {frame.frame_index} · {frame.time_seconds.toFixed(2)} giây<input aria-label="Chọn frame để xem JSON" type="range" min={0} max={camera.frames.length - 1} value={Math.min(index, camera.frames.length - 1)} onChange={(event) => setIndex(Number(event.target.value))} /></label><pre>{JSON.stringify({ camera_id: camera.camera_id, ...frame }, null, 2)}</pre></details>;
}

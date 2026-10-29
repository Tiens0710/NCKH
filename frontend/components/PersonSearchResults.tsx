"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoCamera, DemoTrack, PublicDemoResult } from "@/lib/public-demo";
import { filterPeopleByIntent, validateIntent, type PersonIntent } from "@/lib/person-intent";
import { visibleDetections } from "@/lib/person-overlay";
import { searchPeople } from "@/lib/person-search";
import { PersonJourney, type JourneyFocus } from "./PersonJourney";

export function FocusVideo({ camera, matches, focus }: { camera: DemoCamera; matches: DemoTrack[] | null; focus: JourneyFocus | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [failure, setFailure] = useState("");
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!focus || focus.cameraId !== camera.camera_id || !video.current) return;
    const player = video.current;
    player.pause();
    const seek = () => { player.currentTime = focus.seconds; player.closest("article")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
    if (player.readyState >= 1) seek();
    else player.addEventListener("loadedmetadata", seek, { once: true });
    return () => player.removeEventListener("loadedmetadata", seek);
  }, [focus, camera.camera_id]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === wrapper.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function togglePlay() {
    const player = video.current;
    if (!player) return;
    setFailure("");
    if (!player.paused) { player.pause(); return; }
    if (player.ended) player.currentTime = 0;
    try { await player.play(); }
    catch (error) {
      if ((error as Error).name !== "AbortError") setFailure("Không phát được video. Hãy tải lại kết quả để làm mới liên kết video.");
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === wrapper.current) await document.exitFullscreen();
      else if (wrapper.current?.requestFullscreen) await wrapper.current.requestFullscreen();
      else setFailure("Trình duyệt này không hỗ trợ toàn màn hình. Bạn vẫn có thể xem và tua video bên dưới.");
    } catch { setFailure("Không mở được toàn màn hình. Hãy thử lại hoặc tiếp tục xem trong trang."); }
  }
  const allowedIds = useMemo(() => matches === null ? null : new Set(matches.filter(track => track.camera_id === camera.camera_id).map(track => track.local_track_id)), [matches, camera.camera_id]);
  useEffect(() => {
    const player = video.current;
    if (!allowedIds || !player) return;
    player.pause();
    const first = camera.frames.find(frame => frame.detections.some(item => item.local_track_id !== null && allowedIds.has(item.local_track_id)));
    if (!first) return;
    const seek = () => { player.currentTime = first.time_seconds; };
    if (player.readyState >= 1) seek();
    else player.addEventListener("loadedmetadata", seek, { once: true });
    return () => player.removeEventListener("loadedmetadata", seek);
  }, [allowedIds, camera]);
  useEffect(() => {
    const player = video.current, surface = canvas.current;
    if (!player || !surface || !camera.raw_media_path) return;
    let handle = 0;
    const paint = () => {
      const width = camera.width || player.videoWidth || 960, height = camera.height || player.videoHeight || 540;
      if (surface.width !== width || surface.height !== height) { surface.width = width; surface.height = height; }
      const ctx = surface.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        const detections = visibleDetections(camera, player.currentTime, null)
          .filter(detection => allowedIds === null || detection.local_track_id !== null && allowedIds.has(detection.local_track_id));
        ctx.lineWidth = 2; ctx.font = "16px sans-serif";
        for (const detection of detections) {
          const [x1, y1, x2, y2] = detection.xyxy;
          ctx.strokeStyle = "#69e4c6"; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          if (detection.local_track_id !== null) {
            const text = `L${detection.local_track_id}`, labelWidth = ctx.measureText(text).width + 8;
            const left = Math.max(0, Math.min(x1, width - labelWidth)), top = Math.max(0, y1 - 22);
            ctx.fillStyle = "#101b29"; ctx.fillRect(left, top, labelWidth, 22);
            ctx.fillStyle = "#ffffff"; ctx.fillText(text, left + 4, top + 17);
          }
        }
      }
      handle = requestAnimationFrame(paint);
    };
    handle = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(handle);
  }, [camera, allowedIds]);
  return <article><h4>{camera.name}</h4>
    {camera.raw_media_path ? <div ref={wrapper} className="pd-focus-player" style={{ "--video-aspect": (camera.width || 16) / (camera.height || 9) } as React.CSSProperties}>
      <div className="pd-focus-picture"><video ref={video} src={camera.raw_media_path} playsInline preload="metadata"
        onLoadedMetadata={() => setReady(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onError={() => { setReady(false); setFailure("Không tải được video. Hãy tải lại kết quả để làm mới liên kết."); }} />
        <canvas ref={canvas} aria-hidden="true" /></div>
      <div className="pd-focus-controls">
        <button type="button" className="pd-player-play" aria-label={`${playing ? "Tạm dừng" : "Phát"} ${camera.name}`} disabled={!ready} onClick={togglePlay}>
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span> {playing ? "Tạm dừng" : "Phát"}</button>
        <span className="pd-player-time">{time.toFixed(1)} / {camera.duration_seconds.toFixed(1)}s</span>
        <button type="button" className="pd-player-fullscreen" aria-label={`${fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} ${camera.name}`} onClick={toggleFullscreen}>
          <span aria-hidden="true">⛶</span><span className="pd-sr-only">{fullscreen ? "Thu nhỏ" : "Phóng to"}</span></button>
        <input className="pd-player-seek" aria-label={`Tua ${camera.name}`} type="range" min="0" max={camera.duration_seconds} step="0.05" disabled={!ready} value={Math.min(time, camera.duration_seconds)}
          onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)); }} />
      </div>
    </div> : <video ref={video} controls playsInline preload="auto" src={camera.media_path} onLoadedMetadata={() => setReady(true)}
      onError={() => setFailure("Không tải được video. Hãy làm mới liên kết hoặc mở lại phiên.")} />}
    {failure ? <p role="alert">{failure}</p> : null}
    {allowedIds !== null && allowedIds.size === 0 ? <p>Không có người khớp mô tả trong camera này.</p> : null}
  </article>;
}

export function PersonSearchResults({ result, access }: { result: PublicDemoResult; access: { id: string; token: string } }) {
  const [focus, setFocus] = useState<JourneyFocus | null>(null);
  const [localResults, setLocalResults] = useState<DemoTrack[] | null>(null);
  const useGemini = process.env.NEXT_PUBLIC_PERSON_SEARCH_ENGINE === "gemini";
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [intent, setIntent] = useState<PersonIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const matches = useMemo(() => loading || searchError ? [] : localResults ?? (intent ? filterPeopleByIntent(result.tracks, intent) : null),
    [result.tracks, intent, loading, searchError, localResults]);
  function clearSearch() {
    setFocus(null);
    setLocalResults(null);
    sequence.current++; pending.current?.abort();
    setQuery(""); setSubmittedQuery(""); setIntent(null); setSearchError(""); setLoading(false);
  }
  async function search() {
    if (!query.trim()) { clearSearch(); return; }
    setFocus(null);
    if (!useGemini) {
      setSearchError(""); setSubmittedQuery(query.trim()); setIntent(null);
      setLocalResults(searchPeople(result.tracks, query.trim()).map(item => item.track));
      return;
    }
    pending.current?.abort();
    const requestSequence = ++sequence.current;
    const controller = new AbortController(); pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55000);
    setLoading(true); setSearchError(""); setSubmittedQuery(query.trim()); setIntent(null);
    try {
      const response = await fetch(`/api/demo/jobs/${access.id}/search`, { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access.token}` }, body: JSON.stringify({ query: query.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Không kết nối được AI.");
      const nextIntent = validateIntent(body.intent);
      if (sequence.current === requestSequence) setIntent(nextIntent);
    } catch (error) {
      if (sequence.current === requestSequence) setSearchError(controller.signal.aborted ? "AI phản hồi chậm. Hãy thử lại." : (error as Error).message);
    } finally {
      clearTimeout(timeout);
      if (sequence.current === requestSequence) setLoading(false);
    }
  }
  const focusAvailable = result.cameras.every(camera => !!camera.raw_media_path);
  return <section className="pd-person-search" aria-label="Tìm người trong kết quả">
    <form className="pd-person-searchbar" role="search" onSubmit={event => { event.preventDefault(); if (!loading) void search(); }}>
      <label className="pd-sr-only" htmlFor="person-query">Tìm người bằng mô tả</label>
      <input id="person-query" name="person-query" autoComplete="off" type="search" maxLength={500} value={query} disabled={!focusAvailable} placeholder="Mô tả người cần tìm…"
        onChange={event => { setQuery(event.target.value); if (!event.target.value.trim()) clearSearch(); }} />
      <button type="submit" className="pd-primary" disabled={!focusAvailable || loading}>{loading ? "Đang hiểu…" : "Tìm kiếm"}</button>
      {submittedQuery ? <button type="button" onClick={clearSearch}>Xóa lọc</button> : null}
    </form>
    <p className="pd-search-privacy">{useGemini ? "Chỉ gửi mô tả tới Gemini, không gửi video." : "Lọc theo màu áo/quần đã phát hiện, ví dụ: áo trắng quần đen. Mô tả được xử lý ngay trong trình duyệt."}</p>
    {localResults !== null ? <p role="status">{localResults.length} track khớp mô tả. Màu sắc là ước lượng; chưa xác nhận danh tính.</p> : null}
    {searchError ? <p role="alert" className="pd-upload-error">{searchError}</p> : null}
    {loading ? <p role="status">Gemini đang hiểu yêu cầu…</p> : intent ? <p role="status">{intent.message}{intent.status === "ok" && matches?.length === 0 ? " Chưa có người khớp trong kết quả." : ""}</p> : null}
    {!focusAvailable ? <p>Hãy chạy AI lại để bật tìm kiếm trên video kết quả cũ này.</p> : null}
    <PersonJourney result={result} onFocus={setFocus} />
    {focus ? <p role="status">Đang đối chiếu {focus.cameraId} · L{focus.trackId}. <button type="button" onClick={() => setFocus(null)}>Xem tất cả track</button></p> : null}
    <div className="pd-guest-grid">{result.cameras.map(camera => <FocusVideo key={camera.camera_id} camera={camera} focus={focus}
      matches={focus ? result.tracks.filter(track => track.camera_id === focus.cameraId && track.local_track_id === focus.trackId) : matches} />)}</div>
  </section>;
}

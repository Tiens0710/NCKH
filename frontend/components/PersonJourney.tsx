"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { PublicDemoResult } from "@/lib/public-demo";
import { journeyObservations } from "@/lib/journey";

const JourneyMap = dynamic(() => import("./JourneyMap"), { ssr: false, loading: () => <p role="status">Đang mở bản đồ…</p> });
export type JourneyFocus = { cameraId: string; trackId: number; seconds: number; revision: number };
export function PersonJourney({ result, onFocus }: { result: PublicDemoResult; onFocus: (focus: JourneyFocus) => void }) {
  const [key, setKey] = useState("");
  const observations = useMemo(() => journeyObservations(result, key), [result, key]);
  const points = useMemo(() => {
    const cameras = new Map(observations.map(item => [item.camera.camera_id, item.camera]));
    return [...cameras.values()].filter(camera => camera.location).map(camera => ({ id: camera.camera_id, name: camera.name,
      lat: camera.location!.lat, lng: camera.location!.lng,
      selected: observations.some(item => item.camera.camera_id === camera.camera_id && item.track.track_key === key) }));
  }, [observations, key]);
  const synchronized = observations.length > 0 && observations.every(item => item.camera.timeline_known);
  function focus(item: typeof observations[number]) {
    onFocus({ cameraId: item.camera.camera_id, trackId: item.track.local_track_id, seconds: item.first, revision: Date.now() });
  }
  return <section className="pd-journey" aria-labelledby="journey-title">
    <div className="pd-journey-heading"><h3 id="journey-title">Các lần xuất hiện</h3>
      <label>Track cần đối chiếu<select value={key} onChange={event => setKey(event.target.value)}>
        <option value="">Chọn một track</option>
        {result.tracks.map(track => <option key={track.track_key} value={track.track_key}>{track.camera_id} · L{track.local_track_id}</option>)}
      </select></label></div>
    {!key ? <p>Chọn track để xem vị trí camera, thời gian và video đối chiếu.</p> : <>
      <p>Track đang chọn và những track liên kết trực tiếp là ứng viên cùng người, chưa xác nhận danh tính.</p>
      <div className="pd-journey-grid"><div>
        {points.length ? <JourneyMap points={points} onSelect={id => { const item = observations.find(row => row.camera.camera_id === id); if (item) focus(item); }} /> :
          <div className="pd-map-empty"><strong>Sơ đồ camera</strong><p>Chưa có tọa độ; sơ đồ này không thể hiện khoảng cách hay đường đi thực tế.</p>
            <div className="pd-camera-schematic">{result.cameras.map(camera => {
              const tracks = result.tracks.filter(track => track.camera_id === camera.camera_id);
              const selected = observations.some(item => item.camera.camera_id === camera.camera_id && item.track.track_key === key);
              return <button key={camera.camera_id} type="button" aria-pressed={selected} disabled={!tracks.length}
                onClick={() => setKey(tracks[0].track_key)}><strong>{camera.name}</strong><span>{tracks.length} track</span></button>;
            })}</div>
            <p>Đặt vị trí camera khi gửi video để chuyển sang bản đồ địa lý.</p></div>}
        {points.length ? <p className="pd-journey-note">Nét đứt nối các camera có track ứng viên; không phải đường đi thực tế giữa hai vị trí. {observations.some(item => !item.camera.location) ? "Có camera chưa được đặt vị trí." : ""}</p> : null}
      </div><div>
        <p>{synchronized ? "Thứ tự theo mốc ghi hình đã cung cấp" : "Chưa đồng bộ thời gian; không suy ra thứ tự di chuyển giữa camera."}</p>
        <ol className="pd-observation-list">{observations.map(item => <li key={item.track.track_key}>
          <button onClick={() => focus(item)}><strong>{item.camera.name} · L{item.track.local_track_id}</strong>
            <span>{item.first.toFixed(1)}–{item.last.toFixed(1)} giây trong video</span>
            {item.camera.timeline_known ? <span>Mốc chung: {(item.camera.timeline_start_seconds + item.first).toFixed(1)} giây</span> : null}
            <span>{item.track.track_key === key ? "Track đang chọn" : "Liên kết ứng viên"} · Mở video</span></button>
        </li>)}</ol>
        {!observations.length ? <p>Không tìm thấy frame tương ứng với track này.</p> : null}
      </div></div>
    </>}
  </section>;
}

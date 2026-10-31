"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { Appearance } from "@/lib/evidence";

const cache = new Map<string, string>();
const queues = new Map<string, Promise<void>>();
function crop(row: Appearance): Promise<string> {
  const src = row.camera.raw_media_path ?? row.camera.media_path;
  const key = `${src}|${row.track.track_key}|${row.portraitTime}|${row.box.join(',')}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  let resolve!: (value: string) => void, reject!: (reason: Error) => void;
  const result = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  const previous = queues.get(src) ?? Promise.resolve();
  const next = previous.then(() => new Promise<void>(done => {
    const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto';
    let ended = false;
    const finish = (error?: Error, value?: string) => {
      if (ended) return; ended = true; clearTimeout(timer); video.removeAttribute('src'); video.load();
      if (value) { if (cache.size >= 120) cache.delete(cache.keys().next().value!); cache.set(key, value); resolve(value); }
      else reject(error ?? new Error('Không có ảnh xem trước')); done();
    };
    const timer = setTimeout(() => finish(new Error('Tải ảnh chậm')), 15000);
    video.onerror = () => finish(new Error('Không tải được ảnh'));
    video.onloadedmetadata = () => { video.currentTime = Math.min(row.portraitTime, Math.max(0, video.duration - .01)); };
    video.onseeked = () => {
      try {
        const sx = video.videoWidth / (row.camera.width || video.videoWidth), sy = video.videoHeight / (row.camera.height || video.videoHeight);
        const [left, top, right, bottom] = row.box;
        const x = Math.max(0, left * sx), y = Math.max(0, top * sy), width = Math.min(video.videoWidth - x, (right - left) * sx), height = Math.min(video.videoHeight - y, (bottom - top) * sy);
        if (width < 1 || height < 1) return finish(new Error('Khung bao không hợp lệ'));
        const canvas = document.createElement('canvas'); canvas.width = 144; canvas.height = 176;
        const context = canvas.getContext('2d')!; context.fillStyle = '#ececec'; context.fillRect(0, 0, 144, 176);
        const scale = Math.min(144 / width, 176 / height); context.drawImage(video, x, y, width, height, (144 - width * scale) / 2, (176 - height * scale) / 2, width * scale, height * scale);
        finish(undefined, canvas.toDataURL('image/jpeg', .8));
      } catch { finish(new Error('Không đọc được ảnh xem trước')); }
    };
    video.src = src;
  }));
  queues.set(src, next);
  void next.finally(() => { if (queues.get(src) === next) queues.delete(src); });
  return result;
}
export function TrackPortrait({ row }: { row: Appearance }) {
  const identity = `${row.camera.raw_media_path ?? row.camera.media_path}|${row.track.track_key}|${row.portraitTime}|${row.box.join(',')}`;
  const [preview, setPreview] = useState({ key: '', image: '', failed: false });
  const image = preview.key === identity ? preview.image : '';
  const failed = preview.key === identity && preview.failed;
  useEffect(() => {
    let cancelled = false;
    void crop(row).then(value => { if (!cancelled) setPreview({ key: identity, image: value, failed: false }); }).catch(() => { if (!cancelled) setPreview({ key: identity, image: '', failed: true }); });
    return () => { cancelled = true; };
  }, [row, identity]);
  // A canvas-generated thumbnail from the selected video's actual detection, never a stock portrait.
  return <div className="ct-portrait">{image ? <Image src={image} width={144} height={176} unoptimized alt={`Ảnh trích từ ${row.camera.name}, track L${row.track.local_track_id}`} /> : <span>{failed ? 'Mở video để xem' : 'Đang lấy ảnh…'}</span>}</div>;
}

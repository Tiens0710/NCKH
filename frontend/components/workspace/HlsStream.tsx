"use client";
import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

/** Only the browser connects to HLS. Nothing proxies an arbitrary camera URL on Vercel. */
export function HlsStream({ src, name }: { src: string; name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'playing' | 'paused' | 'error' | 'ended'>('connecting');
  const [live, setLive] = useState(false);
  useEffect(() => {
    const player = video.current!;
    let cancelled = false, failed = false, engine: Hls | undefined;
    const timeout = setTimeout(() => { if (!cancelled && player.readyState < 2) { failed = true; setStatus('error'); engine?.destroy(); } }, 15000);
    function fail() { if (!cancelled) { clearTimeout(timeout); setStatus('error'); } }
    async function connect() {
      try {
        if (player.canPlayType('application/vnd.apple.mpegurl')) player.src = src;
        else {
          const { default: Hls } = await import('hls.js');
          if (cancelled || failed) return;
          if (!Hls.isSupported()) { fail(); return; }
          engine = new Hls({ enableWorker: true, lowLatencyMode: true, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1, fragLoadingMaxRetry: 1 });
          engine.on(Hls.Events.LEVEL_LOADED, (_, data) => { if (!cancelled) setLive(data.details.live); });
          engine.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) { fail(); engine?.destroy(); } });
          engine.loadSource(src); engine.attachMedia(player);
        }
        void player.play().catch(() => { if (!cancelled && player.readyState >= 2) setStatus('paused'); });
      } catch { fail(); }
    }
    const ready = () => { clearTimeout(timeout); if (!cancelled) { setStatus(player.paused ? 'paused' : 'playing'); if (!engine) setLive(player.duration === Infinity); } };
    player.addEventListener('loadeddata', ready); player.addEventListener('error', fail);
    void connect();
    return () => { cancelled = true; clearTimeout(timeout); engine?.destroy(); player.removeEventListener('loadeddata', ready); player.removeEventListener('error', fail); player.pause(); player.removeAttribute('src'); player.load(); };
  }, [src, attempt]);
  return <div className="ct-hls-stream" data-connection-state={status}>
    <div className="ct-trail-video"><video ref={video} className="ct-monitor-player" controls autoPlay muted playsInline preload="metadata" aria-label={`Luồng HLS ${name}`} onPlaying={() => setStatus('playing')} onWaiting={() => setStatus(previous => previous === 'error' ? previous : 'connecting')} onStalled={() => setStatus(previous => previous === 'error' ? previous : 'connecting')} onPause={() => setStatus(previous => previous === 'error' ? previous : 'paused')} onEnded={() => setStatus('ended')} /></div>
    <div className="ct-stream-status" role="status"><span>{status === 'playing' ? live ? 'Đang phát · HLS trực tiếp' : 'Đang phát · HLS' : status === 'paused' ? 'Đã tải luồng · bấm phát' : status === 'connecting' ? 'Đang kết nối HLS…' : status === 'ended' ? 'Luồng đã kết thúc' : 'Không mở được luồng. Kiểm tra HTTPS, codec và CORS trên gateway.'}</span>{status === 'error' || status === 'ended' ? <button type="button" onClick={() => { setStatus('connecting'); setLive(false); setAttempt(value => value + 1); }}>Kết nối lại</button> : null}</div>
  </div>;
}

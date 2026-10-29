"use client";
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DemoCamera } from '@/lib/public-demo';
import { trackTrail } from '@/lib/track-trail';

export type EvidenceCue = { seconds: number; until: number; revision: number };
export function CameraVideo({ src, poster, name, analysis, trackIds, showTrail, cue }: {
  src: string; poster?: string; name: string; analysis?: DemoCamera; trackIds: number[]; showTrail: boolean; cue?: EvidenceCue;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 640, height: 384 });
  const marker = useId().replaceAll(':', '');
  const trails = useMemo(() => showTrail && analysis ? trackIds.flatMap(id => trackTrail(analysis, id, time).map(points => ({ id, points }))) : [], [analysis, trackIds, time, showTrail]);
  useEffect(() => {
    const player = video.current;
    if (!cue || !player) return;
    const seek = () => { player.currentTime = Math.min(cue.seconds, Math.max(0, player.duration - .01)); void player.play().catch(() => { /* Native play control remains available. */ }); };
    if (player.readyState >= 1) seek(); else player.addEventListener('loadedmetadata', seek, { once: true });
    return () => player.removeEventListener('loadedmetadata', seek);
  }, [cue]);
  return <div className="ct-trail-video"><video ref={video} className="ct-monitor-player" src={src} poster={poster} controls autoPlay muted loop={!cue} playsInline preload="metadata" aria-label={`Video ${name}`}
    onLoadedMetadata={event => setDimensions({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
    onTimeUpdate={event => { setTime(event.currentTarget.currentTime); if (cue && event.currentTarget.currentTime >= cue.until) event.currentTarget.pause(); }} onSeeked={event => setTime(event.currentTarget.currentTime)} />
    {analysis && showTrail ? <svg className="ct-trail-overlay" viewBox={`0 0 ${analysis.width || dimensions.width} ${analysis.height || dimensions.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#39d8ff" /></marker></defs>
      {trails.map((trail, i) => <polyline key={`${trail.id}-${i}`} data-track-id={trail.id} points={trail.points.map(point => point.join(',')).join(' ')} fill="none" stroke="#39d8ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" markerEnd={`url(#${marker})`} />)}
    </svg> : null}
  </div>;
}

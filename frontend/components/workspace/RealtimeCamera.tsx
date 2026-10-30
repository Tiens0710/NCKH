"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { frameFresh, realtimeSnapshot, type RealtimeConnection, type RealtimeSnapshot } from '@/lib/realtime';

export function RealtimeCamera({ connection, name }: { connection: RealtimeConnection; name: string }) {
  const [state, setState] = useState<{ data: RealtimeSnapshot | null; at: number; error: string }>({ data: null, at: 0, error: '' });
  const [now, setNow] = useState(0);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(connection.url, { headers: { Authorization: `Bearer ${connection.token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]) });
        if (!response.ok) throw new Error(response.status === 401 ? 'Khóa đọc AI không hợp lệ.' : 'Gateway AI chưa sẵn sàng.');
        const text = await response.text();
        if (text.length > 1000000) throw new Error('Phản hồi gateway quá lớn.');
        const data = realtimeSnapshot(JSON.parse(text), connection.url);
        if (!disposed) setState({ data, at: performance.now(), error: '' });
      } catch (failure) {
        if (!disposed) setState({ data: null, at: 0, error: failure instanceof Error && failure.message.includes('Khóa đọc') ? failure.message : 'Mất kết nối AI · đang thử lại.' });
      } finally { if (!disposed) timer = setTimeout(poll, 500); }
    }
    void poll();
    const clock = setInterval(() => setNow(performance.now()), 250);
    return () => { disposed = true; controller.abort(); clearTimeout(timer); clearInterval(clock); };
  }, [connection.url, connection.token]);
  const fresh = frameFresh(state.data, now - state.at), frame = fresh ? state.data!.frame : null;
  const age = state.data ? Math.max(0, (state.data.age_ms ?? 0) + Math.max(0, now - state.at)) : 0;
  return <div className="ct-realtime-camera" data-ai-state={frame ? 'running' : state.error ? 'offline' : 'waiting'}>
    {frame ? <div className="ct-realtime-frame" style={{ aspectRatio: `${frame.width}/${frame.height}` }}>
      <Image src={`data:image/jpeg;base64,${frame.jpeg}`} width={frame.width} height={frame.height} unoptimized alt={`Frame AI ${name}`} />
      <svg viewBox={`0 0 ${frame.width} ${frame.height}`} aria-label={`Phát hiện ${frame.detections.length} người trong frame`}>
        {frame.detections.map((detection, index) => <g key={index}><rect x={detection.xyxy[0]} y={detection.xyxy[1]} width={detection.xyxy[2]-detection.xyxy[0]} height={detection.xyxy[3]-detection.xyxy[1]} fill="none" stroke="#43dcad" strokeWidth="2" vectorEffect="non-scaling-stroke" /><text x={detection.xyxy[0]+3} y={Math.max(14,detection.xyxy[1]-5)} fill="#43dcad" stroke="#10221a" strokeWidth="2" paintOrder="stroke" fontSize="14">Người {Math.round(detection.score*100)}%</text></g>)}
      </svg>
    </div> : <div className="ct-realtime-wait" role="status">{state.error || (state.data?.model_status === 'loading_model' ? 'Đang nạp RF-DETR…' : state.data?.model_status === 'model_error' ? 'Gateway chưa nạp được mô hình.' : state.data?.status === 'stale' || state.data?.frame ? 'Dữ liệu AI đã cũ · chờ frame mới.' : 'Đang chờ gateway AI tự động phát hiện…')}</div>}
    <div className="ct-stream-status" role="status"><span>{frame ? `${state.data?.simulation ? 'Mô phỏng video · ' : ''}AI đang chạy · ${frame.detections.length} người/frame` : 'AI chưa có dữ liệu mới'}</span>{frame ? <span>Trễ {(age/1000).toFixed(1)}s · {frame.inference_fps === null ? 'Đo FPS…' : `${frame.inference_fps.toFixed(1)} FPS`}</span> : null}</div>
    <p className="ct-ai-caption">Tự cập nhật · khung bao cùng frame đã xử lý. Chưa xác định danh tính liên camera.</p>
  </div>;
}

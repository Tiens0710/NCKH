import type { SiteCamera } from './workspace-types';

export function hlsUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u0020]/.test(raw.trim())) throw new Error('URL HLS không hợp lệ.');
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('Nhập URL HLS đầy đủ, bắt đầu bằng https://.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash)
    throw new Error('Luồng HLS cần HTTPS và không chứa tài khoản/mật khẩu trong URL.');
  return url.href;
}

/** Validate configuration only. Camera network requests happen in the browser/LAN gateway. */
export function cameraConnection(source: SiteCamera['source'], raw: unknown): SiteCamera['connection'] {
  if (source === 'recorded') return undefined;
  // Keep existing RTSP catalog entries editable before a gateway is configured.
  if (raw === undefined && source === 'rtsp') return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Chưa cấu hình kết nối camera.');
  const input = raw as Record<string, unknown>;
  if (input.protocol !== source) throw new Error('Giao thức camera không khớp cấu hình.');
  if (source === 'hls') return { protocol: 'hls', stream_url: hlsUrl(input.stream_url) };
  if (typeof input.rtsp_env !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(input.rtsp_env))
    throw new Error('Tên biến RTSP gồm chữ in hoa, số và dấu gạch dưới; ví dụ CAMPUS_GATE_RTSP.');
  return { protocol: 'rtsp', rtsp_env: input.rtsp_env,
    ...(input.stream_url ? { stream_url: hlsUrl(input.stream_url) } : {}) };
}

export function gatewayConfig(cameras: SiteCamera[], webUrl: string) {
  const selected = cameras.filter(camera => camera.source === 'rtsp' && camera.connection?.rtsp_env);
  if (selected.length < 2 || selected.length > 3) throw new Error('Gateway ghi clip hỗ trợ 2–3 camera RTSP đã cấu hình.');
  if (new Set(selected.map(camera => camera.connection!.rtsp_env)).size !== selected.length)
    throw new Error('Mỗi camera RTSP phải dùng một tên biến môi trường riêng.');
  const endpoint = new URL(webUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Mở web HTTPS đã triển khai để tải cấu hình gateway.');
  return { web_url: endpoint.origin, seconds: 15, consent: false,
    cameras: selected.map(camera => ({ name: camera.name, rtsp_url_env: camera.connection!.rtsp_env,
      ...(camera.location ? { location: camera.location } : {}) })) };
}

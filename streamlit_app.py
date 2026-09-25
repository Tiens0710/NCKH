from __future__ import annotations

import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen
from uuid import uuid4

import streamlit as st
import streamlit.components.v1 as components
import folium
import leafmap.foliumap as leafmap
from supabase import Client, create_client


st.set_page_config(
    page_title="Outlier Re-ID",
    page_icon="🔎",
    layout="wide",
    initial_sidebar_state="expanded",
)

MAX_UPLOAD_BYTES = 48 * 1024 * 1024
NAVIGATION_ITEMS = ["Tổng quan", "Video", "Kết quả", "Camera"]
KAGGLE_WORKER_URL = "https://www.kaggle.com/code/tiens0710/nckh-retinanet-worker/edit"
DEMO_VIDEO_PRESETS = {
    "people-detection.mp4 · Người đi bộ": {
        "key": "people-detection",
        "url": "https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/people-detection.mp4",
        "filename": "people-detection.mp4",
        "content_type": "video/mp4",
        "fps": 30,
        "width": 1920,
        "height": 1080,
        "description": "Video mẫu công khai có người đi bộ, dùng để thử RetinaNet.",
    },
}

# Tọa độ trung tâm Campus II, Đại học Cần Thơ. Tuyến bên dưới chỉ phục vụ
# trình diễn giao diện; không phải dữ liệu định vị hay kết quả AI thật.
CTU_CAMPUS_CENTER = (10.03183, 105.78380)
DEMO_ROUTE = [
    {
        "sequence": 1,
        "camera": "CAM-DEMO-01",
        "area": "Cổng chính Campus II",
        "time": "08:15:10",
        "location": (10.03092, 105.78255),
    },
    {
        "sequence": 2,
        "camera": "MỐC-NỘI-SUY-01",
        "area": "Trục đường nội khu",
        "time": "08:16:02",
        "location": (10.03142, 105.78334),
    },
    {
        "sequence": 3,
        "camera": "MỐC-NỘI-SUY-02",
        "area": "Khu giảng đường",
        "time": "08:17:18",
        "location": (10.03208, 105.78408),
    },
    {
        "sequence": 4,
        "camera": "CAM-DEMO-02",
        "area": "Khuôn viên trung tâm",
        "time": "08:18:27",
        "location": (10.03162, 105.78486),
    },
]


def demo_map() -> leafmap.Map:
    """Build a satellite map with a clearly labelled simulated trajectory."""
    route = [item["location"] for item in DEMO_ROUTE]
    campus_map = leafmap.Map(
        center=CTU_CAMPUS_CENTER,
        zoom=17,
        control_scale=True,
        draw_control=False,
        measure_control=False,
    )
    campus_map.add_basemap("SATELLITE")

    folium.PolyLine(
        route,
        color="#ef4444",
        weight=6,
        opacity=0.95,
        tooltip="Tuyến di chuyển mô phỏng · DEMO-PERSON-001",
    ).add_to(campus_map)

    for index, point in enumerate(DEMO_ROUTE):
        color = "green" if index == 0 else "red" if index == len(DEMO_ROUTE) - 1 else "blue"
        folium.Marker(
            location=point["location"],
            tooltip=f"{point['sequence']}. {point['camera']}",
            popup=(
                f"<b>{point['camera']}</b><br>"
                f"{point['area']}<br>Thời gian: {point['time']}<br>"
                "Dữ liệu mô phỏng"
            ),
            icon=folium.Icon(color=color, icon="video-camera", prefix="fa"),
        ).add_to(campus_map)

    folium.Marker(
        location=route[-1],
        tooltip="Vị trí cuối · DEMO-PERSON-001",
        icon=folium.Icon(color="purple", icon="user", prefix="fa"),
    ).add_to(campus_map)
    campus_map.fit_bounds(route, padding=(20, 20))
    return campus_map


def render_demo_results() -> None:
    """Render the optional UI-only Re-ID route demonstration."""
    st.subheader("Kết quả demo · DEMO-PERSON-001")
    st.warning(
        "Đây là kết quả mô phỏng để trình bày luồng sản phẩm. "
        "Chưa phải kết quả nhận dạng từ AI và không được ghi vào database."
    )

    metrics = st.columns(4)
    metrics[0].metric("Độ tương đồng", "92%")
    metrics[1].metric("Camera đi qua", len(DEMO_ROUTE))
    metrics[2].metric("Thời lượng", "03:17")
    metrics[3].metric("Trạng thái", "Demo")

    st.markdown("**Ảnh truy vấn mô phỏng:** người mặc áo xanh — mã `DEMO-PERSON-001`")
    st.markdown("**Hành trình trong khuôn viên Đại học Cần Thơ (Campus II)**")
    st.caption(
        "Lớp nền vệ tinh và tuyến màu đỏ là dữ liệu minh họa. "
        "Hai marker xanh lá/đỏ là CAM-DEMO-01 và CAM-DEMO-02; hai marker xanh dương "
        "là mốc nội suy, không phải camera thật."
    )
    demo_map().to_streamlit(height=620, add_layer_control=True)

    trajectory_display = [
        {
            "Thứ tự": item["sequence"],
            "Camera": item["camera"],
            "Khu vực": item["area"],
            "Thời gian": item["time"],
        }
        for item in DEMO_ROUTE
    ]
    st.dataframe(trajectory_display, use_container_width=True, hide_index=True)


def _camera_details(video: dict[str, Any]) -> dict[str, Any]:
    """Normalize the nested camera relation returned by Supabase."""
    camera = video.get("cameras") or {}
    if isinstance(camera, list):
        camera = camera[0] if camera else {}
    return camera if isinstance(camera, dict) else {}


def _download_storage_object(client: Client, bucket: str, path: str) -> bytes:
    """Download a private Storage object through the server-side Supabase key."""
    content = client.storage.from_(bucket).download(path)
    return content if isinstance(content, bytes) else bytes(content)


def _create_signed_storage_url(client: Client, bucket: str, path: str) -> str:
    """Create a short-lived URL so the browser can stream a private video."""
    response = client.storage.from_(bucket).create_signed_url(path, 900)
    url = response.get("signedURL") or response.get("signedUrl") if isinstance(response, dict) else None
    if not url:
        raise RuntimeError("Supabase không trả về signed URL cho video.")
    return str(url)


def _build_bbox_video_html(
    video_url: str,
    detection_payload: dict[str, Any],
    width: int,
    height: int,
) -> str:
    """Build a browser player that overlays the nearest sampled RetinaNet boxes."""
    safe_url = json.dumps(video_url).replace("<", "\\u003c")
    safe_payload = json.dumps(detection_payload, ensure_ascii=False, separators=(",", ":"))
    safe_payload = safe_payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    template = r"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #17232a; font: 14px/1.45 system-ui, sans-serif; }
    .player { position: relative; width: 100%; aspect-ratio: __WIDTH__ / __HEIGHT__; overflow: hidden; background: #101418; border-radius: 8px; }
    video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    video { display: block; object-fit: fill; }
    canvas { pointer-events: none; }
    .status { min-height: 1.5em; margin: 8px 2px 0; color: #52616b; }
  </style>
</head>
<body>
  <div id="player" class="player">
    <video id="video" controls playsinline preload="metadata" aria-label="Video đã phủ bounding box"></video>
    <canvas id="overlay" aria-hidden="true"></canvas>
  </div>
  <p id="status" class="status" role="status" aria-live="polite">Đang tải video…</p>
  <script>
    const VIDEO_URL = __VIDEO_URL__;
    const RESULT = __RESULT__;
    const video = document.getElementById("video");
    const player = document.getElementById("player");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");
    const status = document.getElementById("status");
    const frames = Array.isArray(RESULT.frames) ? RESULT.frames : [];

    function frameAt(time) {
      let low = 0, high = frames.length - 1, best = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const sampleTime = Number(frames[middle].time_seconds ?? 0);
        if (sampleTime <= time + 0.025) { best = middle; low = middle + 1; }
        else { high = middle - 1; }
      }
      return best < 0 ? null : frames[best];
    }

    function drawBoxes() {
      if (!video.videoWidth || !canvas.width) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sample = frameAt(video.currentTime);
      if (!sample) {
        status.textContent = "Chưa tới frame đầu tiên được RetinaNet phân tích.";
        return;
      }
      const boxes = Array.isArray(sample.detections) ? sample.detections : [];
      const sx = canvas.width / Number(RESULT.width || video.videoWidth);
      const sy = canvas.height / Number(RESULT.height || video.videoHeight);
      const lineWidth = Math.max(3, canvas.width / 480);
      const fontSize = Math.max(18, canvas.width / 75);
      ctx.lineWidth = lineWidth;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      for (const detection of boxes) {
        const box = detection.xyxy;
        if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) continue;
        const x1 = box[0] * sx, y1 = box[1] * sy;
        const x2 = box[2] * sx, y2 = box[3] * sy;
        const boxWidth = x2 - x1, boxHeight = y2 - y1;
        if (boxWidth <= 0 || boxHeight <= 0) continue;
        ctx.strokeStyle = "#ff5a24";
        ctx.strokeRect(x1, y1, boxWidth, boxHeight);
        const label = `Người · ${(Number(detection.score || 0) * 100).toFixed(1)}%`;
        const labelHeight = fontSize * 1.55;
        const labelWidth = ctx.measureText(label).width + fontSize;
        const labelY = Math.max(0, y1 - labelHeight);
        ctx.fillStyle = "#ff5a24";
        ctx.fillRect(x1, labelY, labelWidth, labelHeight);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x1 + fontSize / 2, labelY + fontSize * 1.12);
      }
      const sampleTime = Number(sample.time_seconds ?? 0).toFixed(2);
      status.textContent = boxes.length
        ? `Frame AI gần nhất: ${sampleTime}s · ${boxes.length} bounding box.`
        : `Frame AI gần nhất: ${sampleTime}s · không phát hiện người.`;
    }

    function startDrawing() {
      drawBoxes();
      if (!video.paused && !video.ended) requestAnimationFrame(startDrawing);
    }

    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      player.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      drawBoxes();
    });
    video.addEventListener("timeupdate", drawBoxes);
    video.addEventListener("seeked", drawBoxes);
    video.addEventListener("play", startDrawing);
    video.addEventListener("error", () => {
      status.textContent = "Không tải được video. Hãy tải lại trang kết quả rồi thử lại.";
    });
    video.src = VIDEO_URL;
  </script>
</body>
</html>"""
    return (
        template.replace("__WIDTH__", str(max(1, int(width))))
        .replace("__HEIGHT__", str(max(1, int(height))))
        .replace("__VIDEO_URL__", safe_url)
        .replace("__RESULT__", safe_payload)
    )


def render_live_detection_results(client: Client) -> None:
    """Render the actual RetinaNet output written by the Kaggle Worker."""
    st.subheader("Kết quả RetinaNet từ video đã xử lý")
    st.caption(
        "Dữ liệu bên dưới được đọc từ bảng videos và file JSON trong Storage, "
        "không còn là số liệu demo."
    )
    try:
        videos = (
            client.table("videos")
            .select(
                "id,camera_id,storage_path,started_at,fps,width,height,status,metadata,created_at,cameras(name,area)"
            )
            .eq("status", "completed")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
        )
    except Exception as exc:
        st.error(f"Không đọc được video đã xử lý: {exc}")
        return

    processed_videos: list[dict[str, Any]] = []
    for video in videos:
        metadata = video.get("metadata") or {}
        detection = metadata.get("detection") or {}
        if detection.get("status") == "completed" and detection.get("storage_path"):
            video["_detection"] = detection
            processed_videos.append(video)

    if not processed_videos:
        st.info(
            "Chưa có video RetinaNet hoàn tất. Gửi video ở mục **Video**; nếu Kaggle "
            "đang tắt, mở Worker và bấm **Run All**. Trang này sẽ tự hiện kết quả khi xong."
        )
        return

    def option_label(video: dict[str, Any]) -> str:
        camera = _camera_details(video)
        detection = video["_detection"]
        filename = (video.get("metadata") or {}).get("original_filename", "video")
        return (
            f"{video.get('started_at', '—')} · {camera.get('name') or video.get('camera_id', '—')} · "
            f"{filename} · {detection.get('person_boxes', 0)} khung bao · {str(video['id'])[:8]}"
        )

    labels = [option_label(video) for video in processed_videos]
    selected_label = st.selectbox(
        "Chọn video đã có kết quả",
        labels,
        key="processed_video_result",
    )
    video = processed_videos[labels.index(selected_label)]
    detection = video["_detection"]
    camera = _camera_details(video)
    metadata = video.get("metadata") or {}

    metrics = st.columns(5)
    metrics[0].metric("Khung bao người", detection.get("person_boxes", 0))
    metrics[1].metric("Frame đã lấy mẫu", detection.get("frames_sampled", 0))
    metrics[2].metric("Frame có người", detection.get("frames_with_people", 0))
    metrics[3].metric("Mô hình", detection.get("model", "RetinaNet"))
    metrics[4].metric("Thiết bị", detection.get("device", "—"))

    st.success(
        f"Đã xử lý xong video tại {camera.get('name') or video.get('camera_id', 'camera chưa xác định')}. "
        f"Ngưỡng phát hiện: {float(detection.get('score_threshold', 0.0)):.0%}."
    )
    st.caption(
        "Một khung bao là một người được phát hiện trong một frame; "
        "không phải số người duy nhất. RetinaNet hiện phát hiện người, chưa thực hiện Re-ID hoặc định vị GPS."
    )

    detection_payload: dict[str, Any] | None = None
    try:
        detection_bytes = _download_storage_object(
            client,
            "raw-detections",
            detection["storage_path"],
        )
        detection_payload = json.loads(detection_bytes.decode("utf-8"))
    except Exception as exc:
        st.warning(f"Không đọc được JSON RetinaNet: {exc}")

    with st.expander("Video có bounding box", expanded=True):
        if detection_payload:
            try:
                signed_video_url = _create_signed_storage_url(
                    client,
                    "raw-videos",
                    video["storage_path"],
                )
                video_width = int(video.get("width") or detection_payload.get("width") or 16)
                video_height = int(video.get("height") or detection_payload.get("height") or 9)
                components.html(
                    _build_bbox_video_html(
                        signed_video_url,
                        detection_payload,
                        video_width,
                        video_height,
                    ),
                    height=860,
                    scrolling=False,
                )
                st.caption(
                    "Khung màu cam là kết quả RetinaNet tại frame được lấy mẫu. "
                    "Mô hình lấy mẫu khoảng mỗi giây; khung được giữ đến lần lấy mẫu kế tiếp, "
                    "không phải tracking liên tục."
                )
            except Exception as exc:
                st.warning(f"Không tạo được video có bounding box: {exc}")
        else:
            st.info("Chưa tải được dữ liệu detection để phủ bounding box lên video.")

    with st.expander("Video gốc", expanded=False):
        try:
            video_bytes = _download_storage_object(client, "raw-videos", video["storage_path"])
            st.video(
                video_bytes,
                format=metadata.get("content_type") or "video/mp4",
            )
        except Exception as exc:
            st.warning(f"Không phát được video gốc từ Storage: {exc}")

    with st.expander("Bounding box theo từng frame", expanded=True):
        if detection_payload:
            rows: list[dict[str, Any]] = []
            for frame in detection_payload.get("frames", []):
                for person_box in frame.get("detections", []):
                    box = person_box.get("xyxy") or [None, None, None, None]
                    rows.append(
                        {
                            "Frame": frame.get("frame_index"),
                            "Thời gian (giây)": frame.get("time_seconds"),
                            "Độ tin cậy": f"{float(person_box.get('score', 0.0)):.1%}",
                            "X1": box[0],
                            "Y1": box[1],
                            "X2": box[2],
                            "Y2": box[3],
                        }
                    )
            if rows:
                st.dataframe(rows, use_container_width=True, hide_index=True)
            else:
                st.info("Không có bounding box người trong các frame đã lấy mẫu.")
            st.download_button(
                "Tải JSON kết quả RetinaNet",
                data=json.dumps(detection_payload, ensure_ascii=False, indent=2),
                file_name=f"retinanet-{video['id']}.json",
                mime="application/json",
                key=f"download_detection_{video['id']}",
            )


def read_secret(name: str) -> str:
    """Read Community Cloud secrets first, then local environment variables."""
    try:
        value = st.secrets.get(name, "")
    except FileNotFoundError:
        value = ""
    return str(value or os.getenv(name, "")).strip()


def require_login() -> None:
    expected = read_secret("APP_PASSWORD")
    if not expected:
        st.error("Ứng dụng chưa có APP_PASSWORD trong biến môi trường hoặc Streamlit Secrets.")
        st.stop()

    if st.session_state.get("authenticated"):
        return

    st.title("Outlier Re-ID")
    st.caption("Hệ thống tìm kiếm và truy vết người qua nhiều camera")
    with st.form("login"):
        password = st.text_input("Mật khẩu truy cập", type="password")
        submitted = st.form_submit_button("Đăng nhập", use_container_width=True)
    if submitted:
        st.session_state.authenticated = hmac.compare_digest(password, expected)
        if st.session_state.authenticated:
            st.rerun()
        st.error("Mật khẩu không đúng.")
    st.stop()


@st.cache_resource(show_spinner=False)
def get_client(url: str, key: str) -> Client:
    return create_client(url, key)


def supabase_client() -> Client:
    url = read_secret("SUPABASE_URL")
    key = read_secret("SUPABASE_SECRET_KEY") or read_secret("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        st.error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong biến môi trường hoặc Streamlit Secrets.")
        st.stop()
    return get_client(url, key)


def safe_filename(name: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name or fallback).strip("-.")
    return cleaned[:180] or fallback


def navigate_to(page: str) -> None:
    """Set the sidebar destination from a quick-action button."""
    st.session_state.navigation = page


def apply_ui_theme() -> None:
    """Add a small, consistent visual layer without changing Streamlit behavior."""
    st.markdown(
        """
        <style>
        [data-testid="stMetric"] {
            background: #ffffff;
            border: 1px solid rgba(15, 23, 42, 0.10);
            border-radius: 0.75rem;
            padding: 0.75rem 1rem;
        }
        [data-testid="stAlert"] { border-radius: 0.75rem; }
        div.stButton > button {
            border-radius: 0.5rem;
            min-height: 2.5rem;
        }
        [data-testid="stSidebar"] hr { margin: 0.75rem 0; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def upload_to_storage(
    client: Client,
    bucket: str,
    path: str,
    content: bytes,
    content_type: str,
) -> None:
    client.storage.from_(bucket).upload(
        path=path,
        file=content,
        file_options={"content-type": content_type, "upsert": "false"},
    )


def download_demo_video(url: str) -> bytes:
    """Download a small, allow-listed demo clip without trusting its size."""
    request = Request(url, headers={"User-Agent": "Outlier-ReID-demo/1.0"})
    with urlopen(request, timeout=60) as response:
        content = response.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Video mẫu vượt quá giới hạn 48 MB.")
    if not content:
        raise ValueError("Video mẫu không có dữ liệu.")
    return content


def dashboard(client: Client) -> None:
    st.header("Tổng quan")
    st.caption("Demo phát hiện người bằng RetinaNet · Campus II, Đại học Cần Thơ")
    metrics_to_show = [
        ("Camera", "cameras", None),
        ("Video", "videos", None),
        ("Đã xử lý", "videos", "completed"),
    ]
    counts: dict[str, int | str] = {}
    columns = st.columns(len(metrics_to_show))
    for column, (label, table, status) in zip(columns, metrics_to_show, strict=True):
        try:
            query = client.table(table).select("id", count="exact")
            if status:
                query = query.eq("status", status)
            response = query.limit(1).execute()
            count = response.count if response.count is not None else 0
        except Exception:
            count = "—"
        counts[label] = count
        column.metric(label, count)

    st.subheader("Bắt đầu nhanh")
    left, right = st.columns(2)
    left.button(
        "＋  Gửi video mới",
        key="quick_video",
        type="primary",
        use_container_width=True,
        on_click=navigate_to,
        args=("Video",),
    )
    right.button(
        "Xem kết quả đã chạy",
        key="quick_results",
        use_container_width=True,
        on_click=navigate_to,
        args=("Kết quả",),
    )
    st.info(
        "**Quy trình:** gửi video → mở Kaggle và bấm **Run All** một lần cho cả đợt "
        "(tối đa 20 video đang chờ). Kết quả tự cập nhật trên web. Nếu gửi thêm video "
        "sau khi notebook đã kết thúc, chạy **Run All** lần nữa."
    )
    st.link_button("Mở Kaggle Worker", KAGGLE_WORKER_URL)
    st.caption(
        f"Hiện có {counts['Camera']} camera, {counts['Video']} video; "
        f"{counts['Đã xử lý']} video đã hoàn tất."
    )


def camera_page(client: Client) -> None:
    st.header("Camera")
    st.caption("Cấu hình một lần; camera dùng để gắn nhãn các video đã gửi.")
    st.info("Tạo camera trước. Mỗi video sau đó sẽ được gắn với một camera cụ thể.")
    with st.expander("Thêm camera", expanded=False):
        with st.form("camera_form", clear_on_submit=True):
            name = st.text_input("Tên camera *")
            area = st.text_input("Khu vực")
            stream_url = st.text_input("RTSP / stream URL", type="password")
            map_x, map_y = st.columns(2)
            x = map_x.number_input("Tọa độ X", value=None)
            y = map_y.number_input("Tọa độ Y", value=None)
            active = st.checkbox("Đang hoạt động", value=True)
            submitted = st.form_submit_button("Lưu camera")
        if submitted:
            if not name.strip():
                st.error("Tên camera không được để trống.")
            else:
                row = {
                    "name": name.strip(),
                    "area": area.strip() or None,
                    "stream_url": stream_url.strip() or None,
                    "map_x": x,
                    "map_y": y,
                    "is_active": active,
                    "metadata": {},
                }
                try:
                    client.table("cameras").insert(row).execute()
                    st.success("Đã thêm camera.")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Không thể thêm camera: {exc}")

    try:
        rows = client.table("cameras").select("*").order("name").execute().data
        if rows:
            display = [
                {
                    "Tên": row.get("name"),
                    "Khu vực": row.get("area"),
                    "Hoạt động": row.get("is_active"),
                    "X": row.get("map_x"),
                    "Y": row.get("map_y"),
                }
                for row in rows
            ]
            st.dataframe(display, use_container_width=True, hide_index=True)
        else:
            st.info("Chưa có camera.")
    except Exception as exc:
        st.error(f"Không đọc được danh sách camera: {exc}")


def video_page(client: Client) -> None:
    st.header("Video")
    st.caption("Chọn video mẫu hoặc tải video của bạn, rồi gửi vào hàng chờ AI.")
    try:
        cameras = (
            client.table("cameras")
            .select("id,name,area")
            .eq("is_active", True)
            .order("name")
            .execute()
            .data
        )
    except Exception as exc:
        st.error(f"Không đọc được camera: {exc}")
        return

    if not cameras:
        st.warning("Chưa có camera. Thêm camera một lần để bắt đầu gửi video.")
        st.button(
            "Thêm camera",
            key="video_add_camera",
            on_click=navigate_to,
            args=("Camera",),
        )
    else:
        camera_labels = {
            f"{item['name']} — {item.get('area') or 'chưa có khu vực'}": item["id"]
            for item in cameras
        }
        source = st.radio(
            "Nguồn video",
            ["Video mẫu (khuyên dùng)", "Tải video của tôi"],
            horizontal=True,
            label_visibility="collapsed",
            key="video_source",
        )
        st.caption(
            "Gửi xong, web tự mở Kết quả. Sau đó bấm Run All trên Kaggle để xử lý video."
        )

        if source == "Video mẫu (khuyên dùng)":
            st.subheader("Thử nhanh bằng video mẫu")
            preset_label = st.selectbox(
                "Chọn video mẫu",
                list(DEMO_VIDEO_PRESETS),
                help="Video sẵn có, không cần chọn file từ máy.",
            )
            preset = DEMO_VIDEO_PRESETS[preset_label]
            st.caption(preset["description"])
            st.video(preset["url"], format=preset["content_type"], autoplay=False)
            preset_camera = st.selectbox(
                "Camera",
                list(camera_labels),
                key="demo_video_camera",
            )
            if st.button(
                "Gửi video mẫu đi xử lý",
                type="primary",
                use_container_width=True,
                key="use_demo_video",
            ):
                started_utc = datetime.now(timezone.utc)
                storage_path = (
                    f"{camera_labels[preset_camera]}/{started_utc:%Y/%m/%d}/"
                    f"{uuid4()}-{preset['filename']}"
                )
                try:
                    with st.spinner("Đang đưa video mẫu lên hàng chờ..."):
                        content = download_demo_video(preset["url"])
                        upload_to_storage(
                            client,
                            "raw-videos",
                            storage_path,
                            content,
                            preset["content_type"],
                        )
                        row = {
                            "camera_id": camera_labels[preset_camera],
                            "storage_path": storage_path,
                            "started_at": started_utc.isoformat(),
                            "fps": preset["fps"],
                            "width": preset["width"],
                            "height": preset["height"],
                            "status": "pending",
                            "metadata": {
                                "original_filename": preset["filename"],
                                "content_type": preset["content_type"],
                                "size_bytes": len(content),
                                "source": "built-in-demo",
                                "preset_key": preset["key"],
                            },
                        }
                        try:
                            inserted = client.table("videos").insert(row).execute()
                        except Exception:
                            client.storage.from_("raw-videos").remove([storage_path])
                            raise
                        video_id = (inserted.data or [{}])[0].get("id")
                    if video_id:
                        st.session_state["active_video_id"] = video_id
                    st.session_state.navigation = "Kết quả"
                    st.rerun()
                except Exception as exc:
                    st.error(f"Không thể gửi video mẫu: {exc}")
        else:
            st.subheader("Tải video của bạn")
            st.caption("MP4, MOV, AVI, MKV hoặc WEBM · tối đa 48 MB.")
            with st.form("video_upload", clear_on_submit=True):
                selected = st.selectbox("Camera", list(camera_labels))
                started_at = st.datetime_input("Thời gian bắt đầu", value=datetime.now())
                uploaded = st.file_uploader(
                    "Chọn video",
                    type=["mp4", "mov", "avi", "mkv", "webm"],
                )
                submitted = st.form_submit_button("Gửi video đi xử lý", type="primary")
            if submitted:
                if uploaded is None:
                    st.error("Chọn video trước nhé.")
                elif uploaded.size > MAX_UPLOAD_BYTES:
                    st.error("Video vượt quá giới hạn 48 MB.")
                else:
                    camera_id = camera_labels[selected]
                    started_utc = started_at.replace(tzinfo=timezone.utc)
                    filename = safe_filename(uploaded.name, "video.mp4")
                    storage_path = f"{camera_id}/{started_utc:%Y/%m/%d}/{uuid4()}-{filename}"
                    try:
                        content = uploaded.getvalue()
                        upload_to_storage(client, "raw-videos", storage_path, content, uploaded.type or "application/octet-stream")
                        row = {
                            "camera_id": camera_id,
                            "storage_path": storage_path,
                            "started_at": started_utc.isoformat(),
                            "status": "pending",
                            "metadata": {
                                "original_filename": uploaded.name,
                                "content_type": uploaded.type,
                                "size_bytes": len(content),
                            },
                        }
                        try:
                            inserted = client.table("videos").insert(row).execute()
                        except Exception:
                            client.storage.from_("raw-videos").remove([storage_path])
                            raise
                        video_id = (inserted.data or [{}])[0].get("id")
                        if video_id:
                            st.session_state["active_video_id"] = video_id
                        st.session_state.navigation = "Kết quả"
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Không thể gửi video: {exc}")

    with st.expander("Lịch sử video", expanded=False):
        try:
            rows = (
                client.table("videos")
                .select("id,started_at,status,storage_path,metadata,cameras(name,area)")
                .order("started_at", desc=True)
                .limit(30)
                .execute()
                .data
            )
            display = [
                {
                    "Tên video": (row.get("metadata") or {}).get("original_filename") or row.get("storage_path", "").split("/")[-1],
                    "Camera": (row.get("cameras") or {}).get("name"),
                    "Thời gian": row.get("started_at"),
                    "Trạng thái": {"pending": "Đang chờ", "processing": "Đang xử lý", "completed": "Hoàn tất", "failed": "Thất bại"}.get(row.get("status"), row.get("status")),
                }
                for row in rows
            ]
            st.dataframe(display, use_container_width=True, hide_index=True)
        except Exception as exc:
            st.error(f"Không đọc được lịch sử video: {exc}")


def search_page(client: Client) -> None:
    st.header("Tìm người")
    st.caption("Tính năng Re-ID chưa được nối với RetinaNet trong bản demo hiện tại.")
    st.info("Chọn ảnh, điều chỉnh ngưỡng tương đồng nếu cần, rồi bấm **Tạo truy vấn**.")
    with st.form("search_form", clear_on_submit=True):
        image = st.file_uploader("Ảnh truy vấn", type=["jpg", "jpeg", "png", "webp"])
        threshold = st.slider("Ngưỡng tương đồng", -1.0, 1.0, 0.65, 0.01)
        submitted = st.form_submit_button("Tạo truy vấn")
    if submitted:
        if image is None:
            st.error("Bạn chưa chọn ảnh.")
        elif image.size > 10 * 1024 * 1024:
            st.error("Ảnh vượt quá giới hạn 10 MB.")
        else:
            query_id = str(uuid4())
            now = datetime.now(timezone.utc)
            filename = safe_filename(image.name, "query.jpg")
            storage_path = f"{now:%Y/%m/%d}/{query_id}-{filename}"
            try:
                content = image.getvalue()
                upload_to_storage(
                    client,
                    "query-images",
                    storage_path,
                    content,
                    image.type or "image/jpeg",
                )
                row = {
                    "id": query_id,
                    "query_image_path": storage_path,
                    "similarity_threshold": threshold,
                    "filters": {
                        "original_filename": image.name,
                        "content_type": image.type,
                        "size_bytes": len(content),
                    },
                    "status": "pending",
                }
                try:
                    client.table("search_queries").insert(row).execute()
                except Exception:
                    client.storage.from_("query-images").remove([storage_path])
                    raise
                st.success(f"Đã tạo truy vấn {query_id}.")
            except Exception as exc:
                st.error(f"Tạo truy vấn thất bại: {exc}")

    try:
        rows = (
            client.table("search_queries")
            .select("id,created_at,status,similarity_threshold,query_image_path")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
        st.dataframe(rows, use_container_width=True, hide_index=True)
    except Exception as exc:
        st.error(f"Không đọc được truy vấn: {exc}")


@st.fragment(run_every="8s")
def render_active_video_status(client: Client, video_id: str) -> None:
    """Keep the submitted job status current while its result page is open."""
    try:
        rows = (
            client.table("videos")
            .select("id,status,metadata")
            .eq("id", video_id)
            .limit(1)
            .execute()
            .data
        )
        video = rows[0] if rows else None
    except Exception:
        st.warning("Chưa kiểm tra được tiến độ. Trang sẽ tự thử lại sau vài giây.")
        return

    if not video:
        st.session_state.pop("active_video_id", None)
        st.session_state["video_worker_notice"] = "Không còn tìm thấy video này trong dữ liệu."
        st.rerun()

    status = video.get("status")
    if status == "completed":
        st.session_state.pop("active_video_id", None)
        st.rerun()
    elif status == "processing":
        st.info("**RetinaNet đang xử lý video.** Kết quả sẽ tự hiện ở đây, không cần tải lại trang.")
    elif status == "pending":
        st.warning(
            "**Video đang chờ Kaggle.** Mở notebook và bấm **Run All**. Khi xử lý xong, "
            "trang này tự chuyển sang kết quả; không cần tải lại web."
        )
        st.link_button("Mở Kaggle Worker", KAGGLE_WORKER_URL)
    elif status == "failed":
        st.session_state.pop("active_video_id", None)
        st.session_state["video_worker_notice"] = (
            "AI xử lý video bị lỗi. Hãy kiểm tra log Kaggle hoặc gửi lại video để thử lại."
        )
        st.rerun()
    else:
        st.caption(f"Trạng thái video: {status or 'đang kiểm tra'}")


def results_page(client: Client) -> None:
    st.header("Kết quả")
    st.caption("Kết quả RetinaNet thật và dữ liệu demo được ghi nhãn riêng.")
    if notice := st.session_state.pop("video_worker_notice", None):
        st.error(notice)
    active_video_id = st.session_state.get("active_video_id")
    if not active_video_id:
        try:
            queued = (
                client.table("videos")
                .select("id,status")
                .in_("status", ["pending", "processing"])
                .order("created_at", desc=True)
                .limit(20)
                .execute()
                .data
            )
            if queued:
                active_video_id = next(
                    (row["id"] for row in queued if row["status"] == "processing"),
                    queued[0]["id"],
                )
                st.session_state["active_video_id"] = active_video_id
        except Exception:
            pass
    if active_video_id:
        render_active_video_status(client, str(active_video_id))
    render_live_detection_results(client)
    if st.checkbox("Hiện bản đồ demo và phần truy vấn Re-ID", key="show_results_extras"):
        render_demo_results()
        st.subheader("Kết quả truy vấn Re-ID từ Supabase")
        try:
            queries = (
                client.table("search_queries")
                .select("id,created_at,status")
                .order("created_at", desc=True)
                .limit(100)
                .execute()
                .data
            )
            if not queries:
                st.info("Chưa có truy vấn.")
                return
            labels = {
                f"{item['created_at']} · {item['status']} · {item['id'][:8]}": item["id"]
                for item in queries
            }
            selected = st.selectbox("Truy vấn", list(labels))
            query_id = labels[selected]
            results = (
                client.table("search_results")
                .select("rank,similarity_score,tracklets(*,videos(camera_id,started_at,cameras(name,area)))")
                .eq("query_id", query_id)
                .order("rank")
                .execute()
                .data
            )
            if results:
                st.dataframe(results, use_container_width=True, hide_index=True)
            else:
                st.info(
                    "Chưa có kết quả AI trong Supabase. Truy vấn thật vẫn đang pending; "
                    "phần phía trên là dữ liệu demo để xem trước giao diện."
                )
        except Exception as exc:
            st.error(f"Không đọc được kết quả: {exc}")


def main() -> None:
    require_login()
    client = supabase_client()
    apply_ui_theme()

    with st.sidebar:
        st.title("Outlier Re-ID")
        st.caption("Bản demo · Campus II Đại học Cần Thơ")
        st.markdown("**Demo RetinaNet**")
        if st.session_state.get("navigation") not in NAVIGATION_ITEMS:
            st.session_state["navigation"] = "Tổng quan"
        page = st.radio(
            "Điều hướng",
            NAVIGATION_ITEMS,
            label_visibility="collapsed",
            key="navigation",
        )
        st.caption("Gửi video → Kaggle Run All → Kết quả tự cập nhật")
        st.divider()
        if st.button("Đăng xuất", use_container_width=True):
            st.session_state.authenticated = False
            st.rerun()

    pages: dict[str, Any] = {
        "Tổng quan": dashboard,
        "Camera": camera_page,
        "Video": video_page,
        "Tìm người": search_page,
        "Kết quả": results_page,
    }
    pages[page](client)


if __name__ == "__main__":
    main()

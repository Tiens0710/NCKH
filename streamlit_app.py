from __future__ import annotations

import hmac
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen
from uuid import uuid4

import streamlit as st
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
NAVIGATION_ITEMS = ["Tổng quan", "Camera", "Video", "Tìm người", "Kết quả"]
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
    """Render a UI-only result until the AI Worker can generate real matches."""
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
    st.caption("Trang chính · Theo dõi nhanh tình trạng dữ liệu và chọn bước tiếp theo")
    table_names = ["cameras", "videos", "tracklets", "search_queries"]
    labels = ["Camera", "Video", "Tracklet", "Truy vấn"]
    counts: dict[str, int | str] = {}
    columns = st.columns(4)
    for column, table, label in zip(columns, table_names, labels, strict=True):
        try:
            response = client.table(table).select("id", count="exact").limit(1).execute()
            count = response.count if response.count is not None else 0
        except Exception:
            count = "—"
        counts[label] = count
        column.metric(label, count)

    st.info(
        "Database và Storage đã kết nối. Nếu bạn chỉ muốn xem bản trình diễn, "
        "chọn **Kết quả** ở thanh bên hoặc bấm nút bên dưới."
    )

    st.subheader("Bắt đầu nhanh")
    st.caption("Đi theo 4 bước dưới đây khi bạn muốn thử luồng dữ liệu mới.")
    quick_steps = [
        ("1", "Camera", "Khai báo vị trí camera", "Mở Camera"),
        ("2", "Video", "Tải video gắn với camera", "Mở Video"),
        ("3", "Tìm người", "Tải ảnh để tạo truy vấn", "Tạo truy vấn"),
        ("4", "Kết quả", "Xem kết quả và hành trình", "Xem kết quả"),
    ]
    quick_columns = st.columns(4)
    for column, (step, title, description, button_label) in zip(
        quick_columns, quick_steps, strict=True
    ):
        with column:
            st.markdown(f"**Bước {step} · {title}**")
            st.caption(description)
            st.button(
                button_label,
                key=f"quick_{title}",
                use_container_width=True,
                on_click=navigate_to,
                args=(title,),
            )

    st.subheader("Trạng thái hiện tại")
    st.caption(
        f"Đã có {counts['Camera']} camera, {counts['Video']} video và "
        f"{counts['Truy vấn']} truy vấn. Tracklet chỉ xuất hiện sau khi AI Worker xử lý."
    )


def camera_page(client: Client) -> None:
    st.header("Camera")
    st.caption("Bước 1 / 4 · Khai báo các điểm quan sát trong khuôn viên")
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
    st.caption("Bước 2 / 4 · Tải video và gắn vào camera")
    if notice := st.session_state.pop("demo_video_notice", None):
        st.success(notice)
    st.info(
        "Bạn có thể chọn video mẫu có sẵn để xem ngay hoặc đưa thẳng vào hàng chờ AI; "
        "video cá nhân vẫn tải bằng biểu mẫu bên dưới."
    )
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
        st.warning("Hãy thêm ít nhất một camera trước khi tải video.")
    else:
        camera_labels = {
            f"{item['name']} — {item.get('area') or 'chưa có khu vực'}": item["id"]
            for item in cameras
        }

        st.subheader("Video mẫu có sẵn")
        preset_label = st.selectbox(
            "Chọn video mẫu",
            list(DEMO_VIDEO_PRESETS),
            help="Video được lấy từ một kho mẫu công khai để bạn không cần tải file thủ công.",
        )
        preset = DEMO_VIDEO_PRESETS[preset_label]
        st.caption(preset["description"])
        st.caption(
            "Nút bên dưới sẽ lưu video vào Supabase với trạng thái **pending**. "
            "Sau đó cần chạy Kaggle Worker để RetinaNet chuyển sang **completed**."
        )
        autoplay = st.checkbox(
            "Tự động phát video mẫu (đã tắt tiếng)",
            value=True,
            key="demo_video_autoplay",
        )
        st.video(
            preset["url"],
            format=preset["content_type"],
            autoplay=autoplay,
            muted=autoplay,
            loop=False,
        )
        preset_camera = st.selectbox(
            "Camera cho video mẫu",
            list(camera_labels),
            key="demo_video_camera",
        )
        if st.button(
            "Thêm video mẫu vào hàng chờ AI",
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
                with st.spinner("Đang lấy video mẫu và lưu vào Supabase..."):
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
                    inserted_row = (inserted.data or [{}])[0]
                st.session_state["demo_video_notice"] = (
                    "Đã thêm video mẫu vào hàng chờ AI với trạng thái pending. "
                    "Mở Kaggle Worker và chạy notebook để RetinaNet xử lý. "
                    f"Mã video: {inserted_row.get('id', 'không xác định')}"
                )
                st.rerun()
            except Exception as exc:
                st.error(f"Không thể thêm video mẫu: {exc}")

        st.divider()
        st.subheader("Tải video của bạn")
        st.caption("Chọn camera, thời gian bắt đầu, chọn file rồi bấm **Tải video lên**.")
        with st.form("video_upload", clear_on_submit=True):
            selected = st.selectbox("Camera", list(camera_labels))
            started_at = st.datetime_input("Thời gian bắt đầu", value=datetime.now())
            uploaded = st.file_uploader(
                "Video (tối đa 48 MB)",
                type=["mp4", "mov", "avi", "mkv", "webm"],
            )
            submitted = st.form_submit_button("Tải video lên")
        if submitted:
            if uploaded is None:
                st.error("Bạn chưa chọn video.")
            elif uploaded.size > MAX_UPLOAD_BYTES:
                st.error("Video vượt quá giới hạn 48 MB.")
            else:
                camera_id = camera_labels[selected]
                started_utc = started_at.replace(tzinfo=timezone.utc)
                filename = safe_filename(uploaded.name, "video.mp4")
                storage_path = (
                    f"{camera_id}/{started_utc:%Y/%m/%d}/"
                    f"{uuid4()}-{filename}"
                )
                try:
                    content = uploaded.getvalue()
                    upload_to_storage(
                        client,
                        "raw-videos",
                        storage_path,
                        content,
                        uploaded.type or "application/octet-stream",
                    )
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
                        client.table("videos").insert(row).execute()
                    except Exception:
                        client.storage.from_("raw-videos").remove([storage_path])
                        raise
                    st.success("Đã tải video lên. AI Worker sẽ xử lý khi được triển khai.")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Tải video thất bại: {exc}")

    try:
        rows = (
            client.table("videos")
            .select("id,started_at,status,storage_path,cameras(name,area)")
            .order("started_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
        display = [
            {
                "Camera": (row.get("cameras") or {}).get("name"),
                "Bắt đầu": row.get("started_at"),
                "Trạng thái": row.get("status"),
                "Tệp": row.get("storage_path"),
            }
            for row in rows
        ]
        st.dataframe(display, use_container_width=True, hide_index=True)
    except Exception as exc:
        st.error(f"Không đọc được video: {exc}")


def search_page(client: Client) -> None:
    st.header("Tìm người")
    st.caption("Bước 3 / 4 · Tải ảnh rõ toàn thân hoặc nửa người để tạo truy vấn Re-ID.")
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


def results_page(client: Client) -> None:
    st.header("Kết quả")
    st.caption("Bước 4 / 4 · Xem người được tìm thấy và đường đi qua các mốc camera")
    render_demo_results()
    st.divider()
    st.subheader("Kết quả từ Supabase")
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
        st.markdown("**Quy trình sử dụng**")
        page = st.radio(
            "Điều hướng",
            NAVIGATION_ITEMS,
            label_visibility="collapsed",
            key="navigation",
        )
        st.caption("Camera → Video → Tìm người → Kết quả")
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

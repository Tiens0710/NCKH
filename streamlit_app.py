from __future__ import annotations

import hmac
import os
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import streamlit as st
from supabase import Client, create_client


st.set_page_config(
    page_title="Outlier Re-ID",
    page_icon="🔎",
    layout="wide",
    initial_sidebar_state="expanded",
)

MAX_UPLOAD_BYTES = 48 * 1024 * 1024


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
        st.error("Ứng dụng chưa có APP_PASSWORD trong Streamlit Secrets.")
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
        st.error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong Streamlit Secrets.")
        st.stop()
    return get_client(url, key)


def safe_filename(name: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name or fallback).strip("-.")
    return cleaned[:180] or fallback


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


def dashboard(client: Client) -> None:
    st.header("Tổng quan")
    table_names = ["cameras", "videos", "tracklets", "search_queries"]
    labels = ["Camera", "Video", "Tracklet", "Truy vấn"]
    columns = st.columns(4)
    for column, table, label in zip(columns, table_names, labels, strict=True):
        try:
            response = client.table(table).select("id", count="exact").limit(1).execute()
            count = response.count if response.count is not None else 0
        except Exception:
            count = "—"
        column.metric(label, count)

    st.info(
        "Database và Storage đã sẵn sàng. Phần AI Worker (phát hiện, tracking và "
        "Re-ID embedding) vẫn cần triển khai để sinh kết quả nhận dạng thực tế."
    )


def camera_page(client: Client) -> None:
    st.header("Camera")
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
    st.caption("Tải ảnh rõ toàn thân hoặc nửa người để tạo truy vấn Re-ID.")
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
            st.info("Chưa có kết quả. AI Worker cần tạo embedding trước.")
    except Exception as exc:
        st.error(f"Không đọc được kết quả: {exc}")


def main() -> None:
    require_login()
    client = supabase_client()

    with st.sidebar:
        st.title("Outlier Re-ID")
        page = st.radio(
            "Điều hướng",
            ["Tổng quan", "Camera", "Video", "Tìm người", "Kết quả"],
            label_visibility="collapsed",
        )
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

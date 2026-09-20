from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from supabase import Client

from ..config import get_settings
from ..database import get_supabase
from ..utils import safe_filename


router = APIRouter(prefix="/api/videos", tags=["videos"])
BUCKET = "raw-videos"


@router.get("")
def list_videos(
    camera_id: UUID | None = None,
    limit: int = 50,
    client: Client = Depends(get_supabase),
) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 200)
    query = (
        client.table("videos")
        .select("*, cameras(id,name,area)")
        .order("started_at", desc=True)
        .limit(safe_limit)
    )
    if camera_id:
        query = query.eq("camera_id", str(camera_id))
    return query.execute().data


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(
    camera_id: UUID = Form(...),
    started_at: datetime = Form(...),
    ended_at: datetime | None = Form(default=None),
    fps: float | None = Form(default=None),
    width: int | None = Form(default=None),
    height: int | None = Form(default=None),
    file: UploadFile = File(...),
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    settings = get_settings()
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.max_upload_bytes} bytes",
        )

    if ended_at and ended_at < started_at:
        raise HTTPException(status_code=400, detail="ended_at cannot be before started_at")

    filename = safe_filename(file.filename, "video.mp4")
    storage_path = (
        f"{camera_id}/{started_at.astimezone(timezone.utc):%Y/%m/%d}/"
        f"{uuid4()}-{filename}"
    )
    client.storage.from_(BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={
            "content-type": file.content_type or "application/octet-stream",
            "upsert": "false",
        },
    )

    row = {
        "camera_id": str(camera_id),
        "storage_path": storage_path,
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat() if ended_at else None,
        "fps": fps,
        "width": width,
        "height": height,
        "status": "pending",
        "metadata": {
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size_bytes": len(content),
        },
    }

    try:
        result = client.table("videos").insert(row).execute()
    except Exception:
        client.storage.from_(BUCKET).remove([storage_path])
        raise
    return result.data[0]


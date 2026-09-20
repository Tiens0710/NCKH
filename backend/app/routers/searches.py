from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from supabase import Client

from ..config import get_settings
from ..database import get_supabase
from ..schemas import VectorMatchRequest
from ..utils import safe_filename


router = APIRouter(prefix="/api/searches", tags=["searches"])
BUCKET = "query-images"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_search(
    image: UploadFile = File(...),
    start_time: datetime | None = Form(default=None),
    end_time: datetime | None = Form(default=None),
    similarity_threshold: float = Form(default=0.65, ge=-1, le=1),
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    if start_time and end_time and end_time < start_time:
        raise HTTPException(status_code=400, detail="end_time cannot be before start_time")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="The uploaded file must be an image")

    settings = get_settings()
    image_limit = min(settings.max_upload_bytes, 10 * 1024 * 1024)
    content = await image.read(image_limit + 1)
    if len(content) > image_limit:
        raise HTTPException(status_code=413, detail="Query image is too large")

    query_id = uuid4()
    filename = safe_filename(image.filename, "query.jpg")
    now = datetime.now(timezone.utc)
    storage_path = f"{now:%Y/%m/%d}/{query_id}-{filename}"

    client.storage.from_(BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={
            "content-type": image.content_type or "image/jpeg",
            "upsert": "false",
        },
    )
    row = {
        "id": str(query_id),
        "query_image_path": storage_path,
        "start_time": start_time.isoformat() if start_time else None,
        "end_time": end_time.isoformat() if end_time else None,
        "similarity_threshold": similarity_threshold,
        "filters": {
            "original_filename": image.filename,
            "content_type": image.content_type,
            "size_bytes": len(content),
        },
        "status": "pending",
    }
    try:
        result = client.table("search_queries").insert(row).execute()
    except Exception:
        client.storage.from_(BUCKET).remove([storage_path])
        raise
    return result.data[0]


@router.post("/{query_id}/match")
def match_search(
    query_id: UUID,
    payload: VectorMatchRequest,
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    existing = (
        client.table("search_queries")
        .select("id")
        .eq("id", str(query_id))
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Search query not found")

    client.table("search_queries").update(
        {"query_embedding": payload.embedding, "status": "processing"}
    ).eq("id", str(query_id)).execute()

    params = {
        "p_query_embedding": payload.embedding,
        "p_threshold": payload.threshold,
        "p_limit": payload.limit,
        "p_camera_id": str(payload.camera_id) if payload.camera_id else None,
        "p_start_time": payload.start_time.isoformat() if payload.start_time else None,
        "p_end_time": payload.end_time.isoformat() if payload.end_time else None,
        "p_model_version": payload.model_version,
    }

    try:
        matches = client.rpc("match_tracklets", params).execute().data
        result_rows = [
            {
                "query_id": str(query_id),
                "tracklet_id": match["tracklet_id"],
                "similarity_score": match["similarity"],
                "rank": rank,
            }
            for rank, match in enumerate(matches, start=1)
        ]
        if result_rows:
            client.table("search_results").upsert(
                result_rows,
                on_conflict="query_id,tracklet_id",
            ).execute()
        client.table("search_queries").update({"status": "completed"}).eq(
            "id", str(query_id)
        ).execute()
    except Exception:
        client.table("search_queries").update({"status": "failed"}).eq(
            "id", str(query_id)
        ).execute()
        raise

    return {"query_id": str(query_id), "count": len(matches), "matches": matches}


@router.get("/{query_id}")
def get_search(
    query_id: UUID,
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    query = (
        client.table("search_queries")
        .select("*")
        .eq("id", str(query_id))
        .limit(1)
        .execute()
    )
    if not query.data:
        raise HTTPException(status_code=404, detail="Search query not found")

    results = (
        client.table("search_results")
        .select(
            "*, tracklets(*, videos(camera_id, started_at, cameras(id,name,area,map_x,map_y)))"
        )
        .eq("query_id", str(query_id))
        .order("rank")
        .execute()
    )
    trajectory = (
        client.table("trajectory_points")
        .select("*, cameras(id,name,area)")
        .eq("query_id", str(query_id))
        .order("sequence_number")
        .execute()
    )
    return {
        "query": query.data[0],
        "results": results.data,
        "trajectory": trajectory.data,
    }


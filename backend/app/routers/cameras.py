from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from ..database import get_supabase
from ..schemas import CameraCreate, CameraUpdate


router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("")
def list_cameras(
    active_only: bool = False,
    client: Client = Depends(get_supabase),
) -> list[dict[str, Any]]:
    query = client.table("cameras").select("*").order("name")
    if active_only:
        query = query.eq("is_active", True)
    return query.execute().data


@router.post("", status_code=status.HTTP_201_CREATED)
def create_camera(
    payload: CameraCreate,
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    result = client.table("cameras").insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.patch("/{camera_id}")
def update_camera(
    camera_id: UUID,
    payload: CameraUpdate,
    client: Client = Depends(get_supabase),
) -> dict[str, Any]:
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields supplied")

    result = (
        client.table("cameras")
        .update(changes)
        .eq("id", str(camera_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Camera not found")
    return result.data[0]


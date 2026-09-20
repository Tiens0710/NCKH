from fastapi import APIRouter, Depends
from supabase import Client

from ..config import get_settings
from ..database import get_supabase


router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "supabase_configured": settings.supabase_is_configured,
    }


@router.get("/health/supabase")
def supabase_health(client: Client = Depends(get_supabase)) -> dict[str, str]:
    client.table("cameras").select("id").limit(1).execute()
    return {"status": "ok", "database": "connected"}


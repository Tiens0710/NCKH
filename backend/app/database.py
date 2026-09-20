from functools import lru_cache

from fastapi import HTTPException, status
from supabase import Client, create_client

from .config import get_settings


@lru_cache
def _create_supabase_client() -> Client:
    settings = get_settings()
    admin_key = settings.supabase_admin_key
    if not settings.supabase_url or not admin_key:
        raise RuntimeError("Supabase admin key is not configured")

    return create_client(
        settings.supabase_url,
        admin_key,
    )


def get_supabase() -> Client:
    try:
        return _create_supabase_client()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Supabase is not configured. Copy .env.example to .env and add "
                "SUPABASE_SECRET_KEY."
            ),
        ) from exc

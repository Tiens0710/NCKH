import re
from pathlib import Path


def safe_filename(filename: str | None, fallback: str) -> str:
    name = Path(filename or fallback).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")
    return cleaned or fallback


def json_ready(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value) if value is not None else None


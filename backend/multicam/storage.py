"""Atomic artifacts and a single local experiment namespace."""
import json
import os
import tempfile
import time
from pathlib import Path

ROOT = Path(os.environ.get("MULTICAM_OUTPUT_ROOT", Path(__file__).resolve().parents[2] / "artifacts" / "multicam")).resolve()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False)
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}-", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(content)
        # Windows readers may briefly hold a sharing lock while polling status.
        for attempt in range(4):
            try:
                temporary.replace(path)
                break
            except PermissionError:
                if attempt == 3:
                    raise
                time.sleep(.02)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path.name}")
    return payload

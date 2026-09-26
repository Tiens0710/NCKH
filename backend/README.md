# Outlier Re-ID backend

FastAPI is the trusted layer between the application and Supabase. The browser
must never receive the Supabase secret or legacy `service_role` key.

This first version is intended for local development. Before exposing it to the
internet, add Supabase Auth/JWT validation to the `/api/*` routes so an unknown
client cannot use the backend's privileged database access.

## 1. Configure

From the project root (`D:\NCKH`):

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `replace-with-your-sb-secret-key` with the project's
`sb_secret_...` key from **Supabase Dashboard > Project Settings > API Keys**.
The backend also accepts `SUPABASE_SERVICE_ROLE_KEY` as a legacy fallback.
Do not commit or paste this secret into frontend JavaScript.

## 2. Install and run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` to call and inspect the API.

## Main endpoints

- `GET /health`: backend status; works before the Supabase key is configured.
- `GET /health/supabase`: verifies the real database connection.
- `GET/POST/PATCH /api/cameras`: camera management.
- `GET /api/videos`: video records.
- `POST /api/videos/upload`: upload a short video to `raw-videos` and save its metadata.
- `POST /api/searches`: upload a query image to `query-images` and create a search job.
- `POST /api/searches/{query_id}/match`: search using a 512-dimensional Re-ID vector.
- `GET /api/searches/{query_id}`: query, ranked results, and trajectory points.

The current Supabase bucket limit is 50 MB. This starter endpoint reads an upload
into memory and caps it at 48 MB. For long surveillance videos, use TUS resumable
uploads or ingest video directly from the camera/worker instead of routing the
whole file through this API.

## Where JSON is stored

- `cameras.metadata`: camera configuration and optional extra fields.
- `videos.metadata`: original filename, MIME type, size, and processing details.
- `tracklets.attributes`: clothing/color/pose and detector attributes.
- `search_queries.filters`: search filters and query-image metadata.

Large JSON exports should be stored as files in `raw-detections`; keep their
Storage path and summary fields in Postgres.

## RetinaNet person detection worker

The optional CPU worker samples frames from pending videos, runs COCO-pretrained
RetinaNet, and saves per-frame person boxes as JSON in the private
`raw-detections` bucket. Aggregate counts are saved to `videos.metadata.detection`.
It does **not** track people, produce Re-ID embeddings, or create a trajectory.

Install locally from the project root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-ai.txt
```

Ensure `.env` contains `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Run one pending
video, one known video, or keep polling while this computer is on:

```powershell
.\.venv\Scripts\python.exe -m backend.ai.worker --once
.\.venv\Scripts\python.exe -m backend.ai.worker --video-id VIDEO_UUID --once
.\.venv\Scripts\python.exe -m backend.ai.worker --drain
.\.venv\Scripts\python.exe -m backend.ai.worker
```

Use `--video-id VIDEO_UUID --retry-failed --once` after fixing a failed job.
The first run downloads approximately 146 MB of official model weights. The
default samples one frame every 0.5 seconds (at most 120 frames), keeps person
boxes with confidence >= 0.4, and resizes frames to a maximum side of 1280 px.
This can help with small or distant people and short appearances, at the cost of
more inference work; a lower confidence threshold can also add false positives.
At the default sampling rate, the 120-frame limit covers about 60 seconds. Box
coordinates are converted back to the original video dimensions. You can adjust
`--sample-seconds`, `--max-frames`, `--max-image-side`, `--score-threshold`, and
`--device` (`cpu`, `cuda`, or `auto`).
These boxes are detections, not unique
people. The synthetic `test_data` videos may legitimately return zero boxes.

`GET /api/videos` exposes only aggregate counts. Full per-frame coordinates
remain in private Storage. Add user authentication and authorization before
exposing footage or detailed detections through the public API.

On Render, a Cron Job can run `python -m backend.ai.worker --drain` every 10
minutes to process queued videos without an always-on worker. Use a 2 GB / 1 CPU
plan, Python 3.12.14, and set `SUPABASE_URL` plus the secret
`SUPABASE_SECRET_KEY` on that job only. Set `TORCH_HOME=.cache/torch` and build
with:

```sh
pip install -r backend/requirements-ai.txt && python -c "from backend.ai.retinanet import load_detector; load_detector()"
```

This fetches model weights during the build. Do not add the secret to Git or
the browser.
The current free Render API service does not run this AI process.
The remaining pipeline must add tracking and 512-dimensional Re-ID embeddings
to `tracklets` and `tracklet_embeddings` before the matching API can return
real identities or trajectories.

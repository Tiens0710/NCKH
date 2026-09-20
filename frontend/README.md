# Outlier Re-ID frontend

Next.js dashboard for the Outlier Re-ID FastAPI backend.

## Run locally

Start the backend from `D:\NCKH`:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.app.main:app --reload
```

In a second terminal, start the frontend:

```powershell
Set-Location D:\NCKH\frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

`NEXT_PUBLIC_API_URL` contains only the public FastAPI address. Never place the
Supabase service-role or secret key in a `NEXT_PUBLIC_*` variable.

## Available screens

- `/` — system overview and processing pipeline.
- `/cameras` — camera list and create form.
- `/videos` — video upload and processing statuses.
- `/search` — reference image and search conditions.
- `/results/[id]` — ranked Re-ID matches and trajectory.


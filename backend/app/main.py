from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import cameras, health, searches, videos


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend API connecting the Outlier Re-ID application to Supabase.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(cameras.router)
app.include_router(videos.router)
app.include_router(searches.router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "Outlier Re-ID API",
        "docs": "/docs",
        "health": "/health",
    }


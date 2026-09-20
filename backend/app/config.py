from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Outlier Re-ID API"
    supabase_url: str = "https://wtwjsisqghrqtqhzepci.supabase.co"
    supabase_secret_key: SecretStr | None = None
    supabase_service_role_key: SecretStr | None = None
    cors_origins: str = (
        "http://localhost:5500,http://127.0.0.1:5500,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )
    max_upload_bytes: int = 48 * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_is_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_admin_key)

    @property
    def supabase_admin_key(self) -> str | None:
        """Return the preferred secret key, with legacy service_role fallback."""
        candidates = (
            self.supabase_secret_key,
            self.supabase_service_role_key,
        )
        placeholders = {
            "replace-with-your-sb-secret-key",
            "replace-with-your-service-role-key",
        }
        for candidate in candidates:
            if candidate:
                value = candidate.get_secret_value().strip()
                if value and value not in placeholders:
                    return value
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()

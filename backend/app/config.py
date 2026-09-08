from pathlib import Path
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings

# Placeholder value shipped in .env.example — must never reach production.
_PLACEHOLDER_SECRET = "change-this-to-a-random-32-char-secret-key"


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET_MENU: str = "menu-images"
    EXIT_PASS_DEFAULT_MINUTES: int = 10
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    # Public base URL of the customer-facing frontend — printed into table QR codes.
    FRONTEND_URL: str = "http://localhost:3001"
    # Paystack pay-by-transfer. Empty key = feature disabled (endpoints return 503).
    PAYSTACK_SECRET_KEY: str = ""
    # Optional Sentry error tracking (no-op when empty).
    SENTRY_DSN: str = ""
    # Public demo only. The reset endpoint also requires ENVIRONMENT="demo",
    # so setting this in production still cannot wipe a real venue.
    DEMO_RESET_TOKEN: str = ""
    # Where uploaded menu images and other static assets are stored on disk.
    STATIC_DIR: str = str(Path(__file__).resolve().parent.parent / "static")

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @model_validator(mode="after")
    def _validate_secret(self) -> "Settings":
        if self.ENVIRONMENT != "development":
            if self.SECRET_KEY == _PLACEHOLDER_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be a unique value of at least 32 characters "
                    "outside development"
                )
        return self

    class Config:
        env_file = ".env"


settings = Settings()

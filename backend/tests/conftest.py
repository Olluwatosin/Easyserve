import os

# app.config.Settings requires these at import time. Provide safe test defaults
# before any application module is imported.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long")
os.environ.setdefault("ENVIRONMENT", "development")

import os

# app.config.Settings requires these at import time. Provide safe test defaults
# before any application module is imported.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Clear rate-limit counters between tests.

    The limiter keys on client IP, and every test shares one, so a test that
    registers a few venues exhausts /auth/register's 5/minute budget for every
    test that follows — turning unrelated tests into confusing 429s. Resetting
    keeps the limits real inside a test while isolating them across tests.
    """
    from app.utils.limiter import limiter

    limiter.reset()
    yield

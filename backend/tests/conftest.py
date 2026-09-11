import os
from urllib.parse import urlparse

# app.config.Settings requires these at import time. Provide safe test defaults
# before any application module is imported.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest

# ── Where these tests are allowed to write ───────────────────────────────────
#
# The integration suites create venues, staff and orders, and `seed.py` deletes
# every row in every table. Both read DATABASE_URL and neither has any idea what
# it is pointed at.
#
# That is not hypothetical: a run against the live demo database left eleven
# test venues in it. They were harmless there and cleaned up by hand, but the
# same command, one export earlier in the shell, would do the same thing to a
# real venue's night — and the only warning would be the test suite passing.
#
# So the suite refuses to start unless the database is plainly disposable: on
# this machine, and named like a test database. ALLOW_NONLOCAL_TEST_DB=1 exists
# for the rare deliberate case, and has to be typed on purpose.

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", ""}


def _looks_disposable(url: str) -> tuple[bool, str]:
    """Is this a database we may create and delete rows in freely?"""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    name = (parsed.path or "").lstrip("/")

    if host not in LOCAL_HOSTS:
        return False, f"host {host!r} is not this machine"
    if name != "test" and not name.endswith("_test"):
        return False, f"database {name!r} is not named like a test database"
    return True, ""


def pytest_configure(config):
    if os.environ.get("ALLOW_NONLOCAL_TEST_DB") == "1":
        return
    url = os.environ.get("DATABASE_URL", "")
    ok, why = _looks_disposable(url)
    if ok:
        return
    raise pytest.UsageError(
        "Refusing to run tests against this database: "
        f"{why}.\n\n"
        "These tests create venues and staff, and seed.py deletes every row in "
        "every table. They must only ever point at a throwaway database.\n\n"
        "  Start one:  make db\n"
        "  Run tests:  make test\n\n"
        "The database must be on this machine and named 'test' or '*_test'. "
        "If you genuinely mean to use another one, set ALLOW_NONLOCAL_TEST_DB=1."
    )


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

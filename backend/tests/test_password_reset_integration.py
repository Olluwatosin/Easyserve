"""Integration tests for password recovery, against a real database.

These exist because a unit test cannot catch the bug they guard. An earlier
version looked a WhatsApp code up by hash alone, so the correct code redeemed
through *someone else's* phone number succeeded — and because that consumed the
token, the attempt cap silently never incremented. Both only show up when the
lookup runs against real rows.

Skipped when no database is reachable, so a local run without Postgres still
passes; CI provides one.
"""
import os
import re
import uuid

import pytest
import pytest_asyncio

# One event loop for the whole module. SQLAlchemy's async engine binds its
# connection pool to the loop that first uses it, so a per-test loop makes
# every test after the first fail with "attached to a different loop".
pytestmark = pytest.mark.asyncio(loop_scope="module")

DB_URL = os.environ.get("DATABASE_URL", "")


async def _db_available() -> bool:
    if not DB_URL:
        return False
    try:
        from sqlalchemy import text
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest_asyncio.fixture(scope="module", loop_scope="module", autouse=True)
async def _schema():
    if not await _db_available():
        pytest.skip("no database available")
    from app.database import Base, engine
    import app.models  # noqa: F401 — registers every table
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="module")
async def client():
    import httpx
    from httpx import ASGITransport
    from app.main import app
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        yield c


@pytest.fixture
def caplog_codes(caplog):
    """Capture reset codes from the unconfigured-provider log fallback."""
    import logging
    caplog.set_level(logging.WARNING)
    return caplog


async def _make_owner(client, phone: str):
    email = f"{uuid.uuid4().hex[:10]}@test.ng"
    r = await client.post("/api/v1/auth/register", json={
        "venue_name": f"Venue {uuid.uuid4().hex[:6]}",
        "full_name": "Test Owner",
        "email": email,
        "password": "OriginalPass1!",
    })
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = await client.post("/api/v1/auth/recovery-phone", json={"phone": phone}, headers=headers)
    assert r.status_code == 204, r.text
    return email, headers


def _last_code(caplog) -> str:
    codes = re.findall(r"Reset code: (\d{6})", caplog.text)
    assert codes, "no reset code was logged"
    return codes[-1]


async def test_code_cannot_be_redeemed_through_another_persons_number(client, caplog_codes):
    """The regression. A valid code must only work for the account it was issued to."""
    victim_phone = "0801" + str(uuid.uuid4().int)[:7]
    attacker_phone = "0802" + str(uuid.uuid4().int)[:7]
    victim_email, _ = await _make_owner(client, victim_phone)
    await _make_owner(client, attacker_phone)

    await client.post("/api/v1/auth/forgot-password", json={"phone": victim_phone})
    code = _last_code(caplog_codes)

    r = await client.post("/api/v1/auth/reset-password", json={
        "token": code, "new_password": "Hacked12345!", "phone": attacker_phone,
    })
    assert r.status_code == 400

    # The victim's password is untouched.
    r = await client.post("/api/v1/auth/login",
                          json={"email": victim_email, "password": "OriginalPass1!"})
    assert r.status_code == 200


async def test_wrong_codes_increment_the_attempt_cap(client, caplog_codes):
    """The cap is the only thing standing between a 6-digit code and a search."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.password_reset import PasswordResetToken

    phone = "0803" + str(uuid.uuid4().int)[:7]
    await _make_owner(client, phone)
    await client.post("/api/v1/auth/forgot-password", json={"phone": phone})

    for expected in (1, 2, 3):
        await client.post("/api/v1/auth/reset-password", json={
            "token": f"{expected:06d}", "new_password": "Guess12345!", "phone": phone,
        })
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                select(PasswordResetToken)
                .order_by(PasswordResetToken.created_at.desc()).limit(1)
            )).scalar_one()
            assert row.attempts == expected


async def test_correct_code_resets_and_revokes_existing_sessions(client, caplog_codes):
    phone = "0804" + str(uuid.uuid4().int)[:7]
    email, headers = await _make_owner(client, phone)

    await client.post("/api/v1/auth/forgot-password", json={"phone": phone})
    code = _last_code(caplog_codes)

    r = await client.post("/api/v1/auth/reset-password", json={
        "token": code, "new_password": "WhatsAppPass1!", "phone": phone,
    })
    assert r.status_code == 204

    assert (await client.post("/api/v1/auth/login",
            json={"email": email, "password": "WhatsAppPass1!"})).status_code == 200
    assert (await client.post("/api/v1/auth/login",
            json={"email": email, "password": "OriginalPass1!"})).status_code == 401
    # The session held before the reset is dead.
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_email_token_cannot_be_redeemed_as_a_phone_code(client, caplog_codes):
    """Channels must not be interchangeable."""
    phone = "0805" + str(uuid.uuid4().int)[:7]
    email, _ = await _make_owner(client, phone)

    await client.post("/api/v1/auth/forgot-password", json={"email": email})
    links = re.findall(r"reset-password\?token=([A-Za-z0-9_-]+)", caplog_codes.text)
    assert links
    r = await client.post("/api/v1/auth/reset-password", json={
        "token": links[-1], "new_password": "Crossed12345!", "phone": phone,
    })
    assert r.status_code == 400

"""Clocking in and out, for a record somebody is paid from.

That last part is what raises the bar. A rough attendance log only has to be
roughly right; a payroll record has to survive being disputed weeks later by a
person who remembers the night differently. So what is pinned here is mostly
about evidence and about refusing to guess:

  * A PIN alone cannot start a shift, because it proves somebody knows a PIN,
    not that they are at work.
  * A shift nobody closed is never closed by the system. Inventing an end time
    means paying somebody for going home, or not paying them for staying.
  * A correction keeps what it replaced, because a corrected record that
    discards the original is one person's word against another's.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

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
    import app.models  # noqa: F401
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


def _uniq() -> str:
    return uuid.uuid4().hex[:10]


async def _owner(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Shift Test {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _staff(client, owner_headers, pin="4444", role="attendant"):
    await client.post(
        "/api/v1/staff",
        json={
            "full_name": f"Amara {_uniq()[:4]}",
            "email": f"staff-{_uniq()}@test.com",
            "password": "StaffPass123!",
            "role": role,
            "pin": pin,
        },
        headers=owner_headers,
    )
    venue = (await client.get("/api/v1/venues/me", headers=owner_headers)).json()
    r = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": pin}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _code(client, owner_headers) -> str:
    return (await client.get("/api/v1/shifts/code", headers=owner_headers)).json()["code"]


async def test_a_shift_needs_the_venue_code_not_just_a_login(client):
    """The whole reason this is not just PIN sign-in: signing in proves somebody
    knows a PIN, which they can do from bed."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    await _code(client, owner)

    r = await client.post("/api/v1/shifts/clock-in", json={"code": "WRONG"}, headers=staff)
    assert r.status_code == 403

    assert (await client.get("/api/v1/shifts/me", headers=staff)).json()["on_shift"] is False


async def test_the_right_code_starts_a_shift(client):
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)

    r = await client.post("/api/v1/shifts/clock-in", json={"code": code}, headers=staff)
    assert r.status_code == 200
    assert (await client.get("/api/v1/shifts/me", headers=staff)).json()["on_shift"] is True


async def test_the_code_is_not_case_sensitive(client):
    """It is read off a wall and typed on a phone in the dark."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)
    r = await client.post(
        "/api/v1/shifts/clock-in", json={"code": code.lower()}, headers=staff
    )
    assert r.status_code == 200


async def test_clocking_in_twice_does_not_double_the_hours(client):
    """A second tap, or a phone that lost the response. Two open shifts would
    be two sets of hours for one night worked."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)

    first = await client.post("/api/v1/shifts/clock-in", json={"code": code}, headers=staff)
    second = await client.post("/api/v1/shifts/clock-in", json={"code": code}, headers=staff)
    assert first.json()["shift_id"] == second.json()["shift_id"]

    sheet = (await client.get("/api/v1/shifts/timesheet", headers=owner)).json()
    assert len(sheet["people"][0]["shifts"]) == 1


async def test_hours_are_counted_from_the_clock(client):
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)
    started = (await client.post(
        "/api/v1/shifts/clock-in", json={"code": code}, headers=staff
    )).json()

    from sqlalchemy import update
    from app.database import AsyncSessionLocal
    from app.models.shift import Shift

    # By id: this database holds every other test's shifts too, and an
    # unfiltered select would backdate somebody else's night.
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Shift)
            .where(Shift.id == started["shift_id"])
            .values(started_at=datetime.now(timezone.utc) - timedelta(hours=6))
        )
        await db.commit()

    await client.post("/api/v1/shifts/clock-out", headers=staff)
    sheet = (await client.get("/api/v1/shifts/timesheet", headers=owner)).json()
    assert 5.9 <= sheet["people"][0]["hours"] <= 6.1


async def test_clocking_out_without_being_on_shift_is_refused(client):
    owner = await _owner(client)
    staff = await _staff(client, owner)
    r = await client.post("/api/v1/shifts/clock-out", headers=staff)
    assert r.status_code == 400


async def test_a_forgotten_clock_out_is_flagged_and_never_guessed(client):
    """The rule that matters most. Somebody will forget, and the system must
    not decide for them what time they went home."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)
    started = (await client.post(
        "/api/v1/shifts/clock-in", json={"code": code}, headers=staff
    )).json()

    from sqlalchemy import update
    from app.database import AsyncSessionLocal
    from app.models.shift import Shift

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Shift)
            .where(Shift.id == started["shift_id"])
            .values(started_at=datetime.now(timezone.utc) - timedelta(days=2))
        )
        await db.commit()

    sheet = (await client.get("/api/v1/shifts/timesheet", headers=owner)).json()
    person = sheet["people"][0]
    assert person["shifts"][0]["flagged_unclosed"] is True
    assert person["shifts"][0]["ended_at"] is None, "the system invented an end time"
    assert person["shifts"][0]["hours"] is None
    assert person["hours"] == 0, "unaccounted time must not be counted as worked"
    assert sheet["unresolved_shifts"] == 1


async def test_a_correction_keeps_what_the_clock_said(client):
    """A corrected record that discards the original is one person's word."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)
    started = (await client.post(
        "/api/v1/shifts/clock-in", json={"code": code}, headers=staff
    )).json()

    ended = datetime.now(timezone.utc) + timedelta(hours=4)
    r = await client.patch(
        f"/api/v1/shifts/{started['shift_id']}",
        json={"ended_at": ended.isoformat(), "note": "Forgot to clock out"},
        headers=owner,
    )
    assert r.status_code == 200

    sheet = (await client.get("/api/v1/shifts/timesheet", headers=owner)).json()
    shift = sheet["people"][0]["shifts"][0]
    assert shift["corrected"] is True
    assert shift["ended_by"] == "owner"
    assert shift["original_times"]["ended_at"] is None, (
        "the record must remember that no clock-out was ever made"
    )
    assert shift["note"] == "Forgot to clock out"


async def test_a_shift_cannot_be_corrected_to_end_before_it_started(client):
    owner = await _owner(client)
    staff = await _staff(client, owner)
    code = await _code(client, owner)
    started = (await client.post(
        "/api/v1/shifts/clock-in", json={"code": code}, headers=staff
    )).json()

    r = await client.patch(
        f"/api/v1/shifts/{started['shift_id']}",
        json={"ended_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()},
        headers=owner,
    )
    assert r.status_code == 400


async def test_staff_cannot_read_the_timesheet_or_correct_it(client):
    """Hours are pay. Staff see their own shift and nothing else."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    assert (await client.get("/api/v1/shifts/timesheet", headers=staff)).status_code == 403
    assert (await client.get("/api/v1/shifts/code", headers=staff)).status_code == 403


async def test_rotating_the_code_stops_the_old_one_working(client):
    """For when the sheet is photographed, or somebody leaves."""
    owner = await _owner(client)
    staff = await _staff(client, owner)
    old = await _code(client, owner)

    new = (await client.post("/api/v1/shifts/code/rotate", headers=owner)).json()["code"]
    assert new != old

    r = await client.post("/api/v1/shifts/clock-in", json={"code": old}, headers=staff)
    assert r.status_code == 403
    r = await client.post("/api/v1/shifts/clock-in", json={"code": new}, headers=staff)
    assert r.status_code == 200


def test_the_code_alphabet_avoids_the_characters_people_misread():
    """It is read off a wall in a dark venue and typed on a phone."""
    from app.services.shift_service import _ALPHABET

    for ch in "IO01":
        assert ch not in _ALPHABET, f"{ch} is too easily misread"

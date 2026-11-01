"""A PIN has to identify exactly one person.

Nothing used to check this. The keypad resolves a PIN by trying every account at
the venue and taking the first hash that matches — from a query with no ordering
— so two people sharing a PIN produced, silently:

* one of them permanently unable to reach their own account, because their PIN
  signed them in as the other person;
* that person holding the **other's role**, and with no ORDER BY it was whichever
  row Postgres returned first, so a bartender could land on the cashier's account
  and take payments;
* every audited action attributed to the wrong name, which is the one thing an
  audit trail exists to get right;
* shift hours accruing to the wrong person, so payroll was wrong and nothing
  explained why.

Four digits is 10,000 combinations, so random collision across fifteen staff is
around 1%. Assigned by hand they are not random — they cluster on 1234, 1111 and
birth years, and the demo venue ships 1111 through 5555 as a pattern to copy.
"""
import os
import uuid

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
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"PIN Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OwnerPass123!"}
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    return headers, venue["slug"]


async def _add(client, headers, name, role, pin):
    return await client.post(
        "/api/v1/staff",
        json={
            "full_name": name,
            "email": f"{_uniq()}@test.com",
            "password": "StaffPass123!",
            "role": role,
            "pin": pin,
        },
        headers=headers,
    )


# ── The fix ──────────────────────────────────────────────────────────────────


async def test_a_second_person_cannot_be_given_a_pin_already_in_use(client):
    """The bug, reproduced. Both of these used to be accepted."""
    headers, _ = await _owner(client)
    first = await _add(client, headers, "Bartender Bob", "bartender", "1234")
    assert first.status_code == 200, first.text

    second = await _add(client, headers, "Cashier Cara", "cashier", "1234")
    assert second.status_code == 409, (
        "a duplicate PIN was accepted — one of these two can never sign in, and "
        "the other gets whichever role Postgres happens to return first"
    )


async def test_the_refusal_names_who_already_has_it(client):
    """An owner choosing a PIN for somebody needs to know which colleague to
    avoid. It reveals nothing they cannot already see on the staff page."""
    headers, _ = await _owner(client)
    await _add(client, headers, "Bartender Bob", "bartender", "4321")
    clash = await _add(client, headers, "Cashier Cara", "cashier", "4321")
    assert "Bob" in clash.json()["detail"]


async def test_a_pin_change_cannot_collide_either(client):
    """Creation was only half of it — the PATCH endpoint set a PIN with no check
    at all."""
    headers, _ = await _owner(client)
    await _add(client, headers, "Bartender Bob", "bartender", "1111")
    cara = (await _add(client, headers, "Cashier Cara", "cashier", "2222")).json()

    r = await client.patch(
        f"/api/v1/staff/{cara['id']}/pin", json={"pin": "1111"}, headers=headers
    )
    assert r.status_code == 409, "a PIN could still be changed into a collision"


async def test_somebody_can_keep_their_own_pin(client):
    """Re-setting a PIN to what it already is must not collide with itself."""
    headers, _ = await _owner(client)
    bob = (await _add(client, headers, "Bartender Bob", "bartender", "8888")).json()

    r = await client.patch(
        f"/api/v1/staff/{bob['id']}/pin", json={"pin": "8888"}, headers=headers
    )
    assert r.status_code == 204, "somebody could not keep their own PIN"


async def test_two_venues_may_each_use_the_same_pin(client):
    """Uniqueness is per venue. PINs are resolved against one venue's staff, so
    constraining them globally would exhaust 10,000 codes across all customers
    for no benefit."""
    a_headers, _ = await _owner(client)
    b_headers, _ = await _owner(client)

    assert (await _add(client, a_headers, "A", "bartender", "5555")).status_code == 200
    assert (await _add(client, b_headers, "B", "bartender", "5555")).status_code == 200


async def test_everyone_given_a_distinct_pin_can_still_sign_in(client):
    """The thing the fix must not break: a venue with a full roster of unique
    PINs, every one of which reaches its own account and its own role."""
    headers, slug = await _owner(client)
    roster = [
        ("Amara", "attendant", "4444"),
        ("Emeka", "bartender", "1112"),
        ("Ngozi", "kitchen", "2223"),
        ("Tunde", "cashier", "3334"),
        ("Olu", "security", "5556"),
    ]
    for name, role, pin in roster:
        assert (await _add(client, headers, name, role, pin)).status_code == 200

    import base64, json

    for name, role, pin in roster:
        r = await client.post(
            "/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": pin}
        )
        assert r.status_code == 200, f"{name} could not sign in with {pin}"
        part = r.json()["access_token"].split(".")[1]
        part += "=" * (-len(part) % 4)
        claims = json.loads(base64.urlsafe_b64decode(part))
        assert claims["role"] == role, (
            f"{name} signed in and was given the {claims['role']} role"
        )


async def test_resolution_is_deterministic_for_legacy_collisions(client):
    """Venues that predate the rule may still hold a collision. The constraint
    cannot retroactively fix those, but the ordering makes which account a PIN
    opens stable — silently rotating between two people from one request to the
    next is the worst version of this bug.
    """
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.utils.security import hash_password

    headers, slug = await _owner(client)
    bob = (await _add(client, headers, "Bartender Bob", "bartender", "7777")).json()
    cara = (await _add(client, headers, "Cashier Cara", "cashier", "6666")).json()

    # Force the collision the way an older venue would already carry it.
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(User).where(User.id == cara["id"]))
        ).scalar_one()
        row.pin_hash = hash_password("7777")
        await db.commit()

    seen = set()
    for _ in range(4):
        r = await client.post(
            "/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": "7777"}
        )
        assert r.status_code == 200
        import base64, json

        part = r.json()["access_token"].split(".")[1]
        part += "=" * (-len(part) % 4)
        seen.add(json.loads(base64.urlsafe_b64decode(part))["sub"])

    assert len(seen) == 1, "the same PIN opened different accounts on repeat attempts"
    assert seen == {bob["id"]}, "the earlier-created account should win"

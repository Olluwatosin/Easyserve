"""A station account must be able to sign in at a station.

Two gaps sat next to each other and produced the same symptom on the floor —
"Invalid PIN" with nothing to explain it:

* `POST /staff` never set a `pin_hash`, so anyone created through the owner
  screen had no PIN at all and could never use the keypad. Nothing in the UI
  said so; the account looked identical to a working one.
* A PIN that *had* been set could not be read back (correctly — it is hashed),
  but the owner was shown nothing about whether one existed, so a forgotten PIN
  was indistinguishable from an account that never had one.

The first is closed by requiring a PIN at creation, the second by exposing a
`has_pin` boolean — never the PIN, never its hash.

Runs against a real database, like the other integration suite: a PIN's whole
job is to authenticate against a stored row, so an in-memory stand-in would test
the mock. Skipped when no database is reachable; CI provides one.
"""
import os
import uuid

import pytest
import pytest_asyncio

# One event loop for the module — SQLAlchemy's async engine binds its pool to
# the loop that first uses it.
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


def _uniq() -> str:
    """Emails are globally unique, so every test brings its own."""
    return uuid.uuid4().hex[:10]


async def _owner_headers(client):
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"PIN Test Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OwnerPass123!"}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _staff_body(**over):
    body = {
        "full_name": "Chidi Nwankwo",
        "email": f"chidi-{_uniq()}@test.com",
        "password": "StaffPass123!",
        "role": "bartender",
        "pin": "8321",
    }
    body.update(over)
    return body


async def test_a_created_staff_member_can_sign_in_at_the_keypad(client):
    """The whole point: create, then the PIN works. This is what silently did
    not happen before."""
    headers = await _owner_headers(client)
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()

    created = await client.post(
        "/api/v1/staff", json=_staff_body(), headers=headers
    )
    assert created.status_code == 200, created.text

    login = await client.post(
        "/api/v1/auth/pin-login",
        json={"venue_slug": venue["slug"], "pin": "8321"},
    )
    assert login.status_code == 200, "a staff member created with a PIN must be able to use it"


async def test_staff_cannot_be_created_without_a_pin(client):
    """An account that cannot sign in should not be creatable at all."""
    headers = await _owner_headers(client)
    body = _staff_body()
    del body["pin"]
    r = await client.post("/api/v1/staff", json=body, headers=headers)
    assert r.status_code == 422


@pytest.mark.parametrize("bad", ["123", "12345", "abcd", "12a4", ""])
async def test_a_pin_must_be_four_digits_at_creation_too(client, bad):
    """The same rule the PATCH endpoint has always enforced. Creation used to
    bypass it entirely by not accepting a PIN."""
    headers = await _owner_headers(client)
    r = await client.post(
        "/api/v1/staff",
        json=_staff_body(pin=bad),
        headers=headers,
    )
    assert r.status_code == 400


async def test_has_pin_is_reported_but_the_pin_never_is(client):
    """The owner sees whether a PIN exists — never the value, never the hash."""
    headers = await _owner_headers(client)
    body = _staff_body()
    await client.post("/api/v1/staff", json=body, headers=headers)

    listed = (await client.get("/api/v1/staff", headers=headers)).json()
    member = next(m for m in listed if m["email"] == body["email"])

    assert member["has_pin"] is True
    body = str(listed)
    assert "8321" not in body, "the PIN itself must never be returned"
    assert "pin_hash" not in body, "the hash must never be returned"
    assert "$2b$" not in body, "no bcrypt hash may appear in the response"


async def test_a_nigerian_phone_is_stored_normalised(client):
    """Owners type 0801…; WhatsApp needs E.164. Normalising on the way in means
    the send link is built from a number that actually dials."""
    headers = await _owner_headers(client)
    r = await client.post(
        "/api/v1/staff",
        json=_staff_body(phone="0801 234 5678"),
        headers=headers,
    )
    assert r.json()["phone"] == "+2348012345678"


async def test_an_unusable_phone_is_refused_rather_than_stored(client):
    """A number that cannot be dialled would produce a WhatsApp link that opens
    to nothing, which looks like the message was sent."""
    headers = await _owner_headers(client)
    r = await client.post(
        "/api/v1/staff",
        json=_staff_body(phone="not-a-number"),
        headers=headers,
    )
    assert r.status_code == 400


async def test_changing_a_pin_replaces_the_old_one(client):
    """The recovery path for a forgotten PIN: set a new one, and the old stops
    working. This is what the demo needed when Amara's PIN had drifted."""
    headers = await _owner_headers(client)
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    created = (
        await client.post(
            "/api/v1/staff", json=_staff_body(), headers=headers
        )
    ).json()

    r = await client.patch(
        f"/api/v1/staff/{created['id']}/pin", json={"pin": "9090"}, headers=headers
    )
    assert r.status_code == 204

    new = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": "9090"}
    )
    assert new.status_code == 200

    old = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": "8321"}
    )
    assert old.status_code == 401, "the replaced PIN must stop working"

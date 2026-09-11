"""Resolving a venue before anyone types a PIN.

pin-login answers a wrong venue and a wrong PIN identically — deliberately, so
it cannot be used to discover which venues exist. The cost landed on the floor:
the keypad said "Invalid PIN" when the *venue* was wrong, and staff retyped a
PIN that was never wrong. The venue is now confirmed at step one, so a failure
at step two genuinely means the PIN.

Matching is exact on the slug or the slugified input, never partial. A slug is
already public — it is in every table QR link and in the unauthenticated menu
endpoint — so this exposes nothing new; fuzzy search would expose the list of
venues, which nothing else does.
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


@pytest_asyncio.fixture(loop_scope="module")
async def venue(client):
    """A registered venue, returned as (name, slug)."""
    name = f"The Velvet Room {uuid.uuid4().hex[:6]}"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": name,
            "full_name": "Owner",
            "email": f"velvet-{uuid.uuid4().hex[:8]}@test.com",
            "password": "OwnerPass123!",
        },
    )
    assert r.status_code in (200, 201), r.text
    token = r.json()["access_token"]
    me = await client.get(
        "/api/v1/venues/me", headers={"Authorization": f"Bearer {token}"}
    )
    return name, me.json()["slug"]


async def test_the_exact_slug_resolves(client, venue):
    name, slug = venue
    r = await client.get(f"/api/v1/venues/lookup/{slug}")
    assert r.status_code == 200
    assert r.json()["slug"] == slug
    assert r.json()["name"] == name


async def test_the_name_as_a_person_would_type_it_resolves(client, venue):
    """The actual fix: nobody on a busy floor types a hyphenated slug."""
    name, slug = venue
    r = await client.get(f"/api/v1/venues/lookup/{name}")
    assert r.status_code == 200, "a venue's own name must resolve to its slug"
    assert r.json()["slug"] == slug


async def test_an_unknown_venue_is_a_404_not_a_silent_pass(client):
    """Step one has to be able to say "we don't know that venue" — that
    sentence is the entire point of this endpoint."""
    r = await client.get(f"/api/v1/venues/lookup/no-such-venue-{uuid.uuid4().hex[:8]}")
    assert r.status_code == 404


async def test_a_partial_name_does_not_match(client, venue):
    """Exact matching only. Fuzzy search would let anyone walk the venue list,
    which no existing public endpoint allows."""
    name, _ = venue
    r = await client.get(f"/api/v1/venues/lookup/{name.split()[1]}")
    assert r.status_code == 404


async def test_only_slug_and_name_are_returned(client, venue):
    """A sign-in screen needs the name and nothing else. Anything more would be
    handing out venue data to an unauthenticated caller."""
    _, slug = venue
    r = await client.get(f"/api/v1/venues/lookup/{slug}")
    assert set(r.json().keys()) == {"slug", "name"}

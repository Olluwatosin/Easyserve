"""Has anybody actually opened this yet?

The audit trail has been written to since the beginning and never read. That was
fine while its only reader was a future investigation, and stopped being fine
during the pilot: logins were handed to testers and nothing could answer the one
question you want answered that evening.

Arriving was also not recorded at all. Every money-touching action was, but
signing in was not, so even reading the trail would not have told you.

Two things these hold down. Sign-ins are recorded, and the PIN or password never
appears in what is recorded. And an account that has never signed in still
appears in the list — the absence is the answer being looked for, and a missing
row would read as "no data yet" rather than "this person never opened it".
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


OWNER_PASSWORD = "OwnerPass123!"
STAFF_PASSWORD = "StaffPass123!"


async def _venue(client):
    """An owner, signed in. Returns (headers, email, venue_slug)."""
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Activity Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": OWNER_PASSWORD,
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": OWNER_PASSWORD}
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    return headers, email, venue["slug"]


async def _a_staff_member(client, headers, *, role="bartender", pin="1212"):
    email = f"staff-{_uniq()}@test.com"
    r = await client.post(
        "/api/v1/staff",
        json={
            "full_name": "Amara Eze",
            "email": email,
            "password": STAFF_PASSWORD,
            "role": role,
            "pin": pin,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return email, pin


# ── Arriving is recorded ─────────────────────────────────────────────────────


async def test_a_password_sign_in_is_recorded(client):
    headers, email, _ = await _venue(client)

    trail = (await client.get("/api/v1/activity", headers=headers)).json()["entries"]
    sign_ins = [e for e in trail if e["action"] == "signed_in"]
    assert sign_ins, "signing in left no trace, so nothing can say whether anyone arrived"
    assert sign_ins[0]["details"]["method"] == "password"


async def test_a_pin_sign_in_is_recorded_too(client):
    """The keypad is how staff actually arrive, so it is the one that matters
    most during a pilot."""
    headers, _, slug = await _venue(client)
    await _a_staff_member(client, headers, pin="3434")

    await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": "3434"}
    )

    trail = (await client.get("/api/v1/activity", headers=headers)).json()["entries"]
    pin_ins = [
        e for e in trail
        if e["action"] == "signed_in" and (e["details"] or {}).get("method") == "pin"
    ]
    assert pin_ins, "a PIN sign-in was not recorded"
    assert pin_ins[0]["who"] == "Amara Eze"


async def test_the_pin_and_password_never_appear_in_the_trail(client):
    """Recording that somebody arrived must not record what they typed."""
    headers, _, slug = await _venue(client)
    await _a_staff_member(client, headers, pin="9753")
    await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": "9753"}
    )

    body = (await client.get("/api/v1/activity", headers=headers)).text
    assert "9753" not in body, "the PIN is in the audit trail"
    assert STAFF_PASSWORD not in body
    assert OWNER_PASSWORD not in body
    assert "$2b$" not in body, "a bcrypt hash reached the trail"


async def test_a_failed_attempt_is_not_recorded(client):
    """A busy night produces mistyped PINs, and a trail full of them is a trail
    nobody reads. The rate limiter is what handles repeated failures."""
    headers, email, _ = await _venue(client)
    before = len((await client.get("/api/v1/activity", headers=headers)).json()["entries"])

    await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "WrongOne1!"}
    )

    after = len((await client.get("/api/v1/activity", headers=headers)).json()["entries"])
    assert after == before, "failed attempts are filling the trail"


# ── The pilot view ───────────────────────────────────────────────────────────


async def test_someone_who_never_signed_in_is_still_listed(client):
    """The whole point. A tester who was sent a login and never used it has to
    appear, or their absence looks like missing data rather than an answer."""
    headers, _, _ = await _venue(client)
    email, _pin = await _a_staff_member(client, headers)

    people = (await client.get("/api/v1/activity/people", headers=headers)).json()
    them = next(p for p in people["people"] if p["email"] == email)

    assert them["has_signed_in"] is False
    assert them["sign_ins"] == 0
    assert them["last_seen"] is None


async def test_signing_in_shows_up_against_that_person(client):
    headers, _, slug = await _venue(client)
    email, pin = await _a_staff_member(client, headers, pin="6161")

    await client.post("/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": pin})

    people = (await client.get("/api/v1/activity/people", headers=headers)).json()
    them = next(p for p in people["people"] if p["email"] == email)

    assert them["has_signed_in"] is True
    assert them["sign_ins"] == 1
    assert them["last_seen"] is not None
    assert them["first_seen"] is not None


async def test_arriving_is_counted_apart_from_doing_something(client):
    """A tester who signed in and then did nothing is the case worth seeing, so
    sign-ins and actions are separate numbers rather than one total."""
    headers, _, slug = await _venue(client)
    email, pin = await _a_staff_member(client, headers, pin="7272")
    await client.post("/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": pin})

    people = (await client.get("/api/v1/activity/people", headers=headers)).json()
    them = next(p for p in people["people"] if p["email"] == email)

    assert them["sign_ins"] == 1
    assert them["actions"] == 0, "arriving was counted as having done something"


async def test_those_who_never_arrived_are_listed_first(client):
    """It is the row being looked for, so it does not go at the bottom."""
    headers, _, slug = await _venue(client)
    await _a_staff_member(client, headers, role="cashier", pin="8181")
    never_email, _ = await _a_staff_member(client, headers, role="security", pin="8282")
    await client.post("/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": "8181"})

    people = (await client.get("/api/v1/activity/people", headers=headers)).json()["people"]
    assert people[0]["has_signed_in"] is False


async def test_the_headline_counts_are_there(client):
    headers, _, _ = await _venue(client)
    await _a_staff_member(client, headers)

    data = (await client.get("/api/v1/activity/people", headers=headers)).json()
    assert data["total_accounts"] == 2, "the owner and the staff member"
    assert data["signed_in_count"] == 1, "only the owner has signed in"


# ── Who may read it ──────────────────────────────────────────────────────────


async def test_staff_cannot_read_the_activity_trail(client):
    """A record of what staff did is the owner's to read."""
    headers, _, slug = await _venue(client)
    _, pin = await _a_staff_member(client, headers, pin="4545")
    r = await client.post("/api/v1/auth/pin-login", json={"venue_slug": slug, "pin": pin})
    staff_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    assert (await client.get("/api/v1/activity", headers=staff_headers)).status_code == 403
    assert (
        await client.get("/api/v1/activity/people", headers=staff_headers)
    ).status_code == 403


async def test_one_venue_never_sees_another_venues_activity(client):
    mine, _, _ = await _venue(client)
    theirs, their_email, _ = await _venue(client)

    trail = (await client.get("/api/v1/activity", headers=mine)).json()["entries"]
    people = (await client.get("/api/v1/activity/people", headers=mine)).json()["people"]

    assert all(their_email != p["email"] for p in people)
    assert all("Owner" == e["who"] or e["who"] for e in trail)
    # The other venue's owner signed in during setup; that must not be here.
    assert len(people) == 1, "another venue's staff appeared in this venue's list"


async def test_an_action_reads_as_words_not_a_database_key(client):
    """Read at 2am by somebody skimming. "item_voided" is not a sentence."""
    headers, _, _ = await _venue(client)
    trail = (await client.get("/api/v1/activity", headers=headers)).json()["entries"]
    assert trail[0]["what"] == "Signed in"
    assert "_" not in trail[0]["what"]

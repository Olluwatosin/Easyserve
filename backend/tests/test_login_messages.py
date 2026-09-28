"""A failed sign-in has to say which part was wrong.

Every failure used to answer "Invalid credentials", and the login screen fell
back to "Login failed" whenever no message came back at all — which is exactly
the case where the request never reached the API. So the message that meant "this
is a network problem" looked the most like a rejected password, and a bartender
would stand at the door retyping perfectly good credentials.

The usual argument for one vague message is that distinguishing them lets someone
discover which email addresses have accounts. That is the right default for a
service strangers sign up to. It is the wrong trade for accounts an owner creates
for their own staff and hands over on WhatsApp: the vagueness costs something real
on the floor every shift, and what actually holds the door is the rate limit on
the endpoint rather than the wording of the refusal.

The case that matters most is the third one. A deactivated account used to be
indistinguishable from a wrong password, so somebody whose account had been
switched off would keep retyping a password that was entirely correct.
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


PASSWORD = "OwnerPass123!"


async def _an_owner(client) -> str:
    """Registers a venue and returns the owner's email."""
    email = f"owner-{_uniq()}@test.com"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Login Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": PASSWORD,
        },
    )
    assert r.status_code in (200, 201), r.text
    return email


async def _login(client, email: str, password: str):
    return await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


# ── The thing that was asked for ─────────────────────────────────────────────


async def test_an_unknown_email_says_so(client):
    r = await _login(client, f"nobody-{_uniq()}@test.com", PASSWORD)
    assert r.status_code == 401
    detail = r.json()["detail"].lower()
    assert "email" in detail, f"{detail!r} does not point at the email address"


async def test_a_wrong_password_says_so(client):
    email = await _an_owner(client)
    r = await _login(client, email, "NotTheRightOne1!")
    assert r.status_code == 401
    detail = r.json()["detail"].lower()
    assert "password" in detail, f"{detail!r} does not point at the password"


async def test_the_two_answers_are_different(client):
    """The whole request: an owner helping a staff member has to be able to tell
    which of the two is wrong."""
    email = await _an_owner(client)
    unknown = (await _login(client, f"nobody-{_uniq()}@test.com", PASSWORD)).json()["detail"]
    wrong_pw = (await _login(client, email, "NotTheRightOne1!")).json()["detail"]

    assert unknown != wrong_pw, (
        "a wrong address and a wrong password give the same answer, so neither "
        "the staff member nor the owner can tell them apart"
    )


async def test_a_switched_off_account_is_not_told_its_password_is_wrong(client):
    """The worst of the three. Somebody deactivated would retype a password that
    was right all along, and the owner would have no idea why."""
    email = await _an_owner(client)
    headers = {
        "Authorization": f"Bearer {(await _login(client, email, PASSWORD)).json()['access_token']}"
    }

    staff_email = f"staff-{_uniq()}@test.com"
    staff = (
        await client.post(
            "/api/v1/staff",
            json={
                "full_name": "Amara",
                "email": staff_email,
                "password": "StaffPass123!",
                "role": "bartender",
                "pin": "4321",
            },
            headers=headers,
        )
    ).json()

    # Works before.
    assert (await _login(client, staff_email, "StaffPass123!")).status_code == 200

    await client.delete(f"/api/v1/staff/{staff['id']}", headers=headers)

    r = await _login(client, staff_email, "StaffPass123!")
    assert r.status_code == 403, "a deactivated account still reads as bad credentials"
    detail = r.json()["detail"].lower()
    assert "password" not in detail, (
        f"{detail!r} blames the password for an account that was switched off"
    )
    assert "owner" in detail, "the message does not say who can fix it"


async def test_the_right_credentials_still_work(client):
    """None of the above at the cost of signing in."""
    email = await _an_owner(client)
    r = await _login(client, email, PASSWORD)
    assert r.status_code == 200
    assert r.json()["access_token"]


# ── The keypad ───────────────────────────────────────────────────────────────


async def test_a_wrong_venue_is_not_blamed_on_the_pin(client):
    """Staff reach the keypad from a link or a printed sheet. If the venue is
    wrong the fix is a new link, and "invalid PIN" sends them off retyping four
    digits that were never the problem."""
    r = await client.post(
        "/api/v1/auth/pin-login",
        json={"venue_slug": f"no-such-venue-{_uniq()}", "pin": "1234"},
    )
    assert r.status_code == 401
    detail = r.json()["detail"].lower()
    assert "pin" not in detail, f"{detail!r} blames the PIN for an unknown venue"


async def test_a_wrong_pin_at_a_real_venue_says_it_is_the_pin(client):
    email = await _an_owner(client)
    headers = {
        "Authorization": f"Bearer {(await _login(client, email, PASSWORD)).json()['access_token']}"
    }
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()

    r = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": "0000"}
    )
    assert r.status_code == 401
    assert "pin" in r.json()["detail"].lower()


async def test_no_password_hash_or_pin_leaks_in_any_refusal(client):
    """Saying more about the failure must not mean saying anything about the
    stored secret."""
    email = await _an_owner(client)
    bodies = [
        (await _login(client, email, "wrong")).text,
        (await _login(client, f"nobody-{_uniq()}@test.com", "wrong")).text,
        (
            await client.post(
                "/api/v1/auth/pin-login",
                json={"venue_slug": "nope", "pin": "1234"},
            )
        ).text,
    ]
    for body in bodies:
        assert "$2b$" not in body, "a bcrypt hash appeared in a refusal"
        assert "password_hash" not in body
        assert "pin_hash" not in body

"""The typable half of the exit pass.

The door screen always had a manual-entry box, and the token behind the QR is
about 150 characters — so the fallback existed and could not be used. In
practice the camera was the only route, and the camera fails at exactly the
moment it matters: a cracked screen, a dead battery, glare off the door light, a
guest who has had a few and cannot hold the phone still.

A six-character code fixes that, and is safe for reasons that are structural
rather than hopeful — which is what these tests pin. The code is single-use,
short-lived, scoped to one venue, and spending it opens a door the guest already
paid to walk through.
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


async def _paid_order_with_pass(client):
    """A venue, a paid order, and the exit pass that came with it."""
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Door Test {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    owner = {"Authorization": f"Bearer {r.json()['access_token']}"}
    venue = (await client.get("/api/v1/venues/me", headers=owner)).json()

    table = (
        await client.post("/api/v1/tables", json={"label": "VIP 1"}, headers=owner)
    ).json()
    cat = (
        await client.post(
            "/api/v1/menu/categories", json={"name": "Drinks"}, headers=owner
        )
    ).json()
    item = (
        await client.post(
            "/api/v1/menu/items",
            json={
                "category_id": cat["id"],
                "name": "Star Lager",
                "price": 2500,
                "item_type": "drink",
            },
            headers=owner,
        )
    ).json()
    order = (
        await client.post(
            f"/api/v1/customer/orders/{table['qr_token']}",
            json={"items": [{"menu_item_id": item["id"], "quantity": 1}]},
        )
    ).json()

    await client.post(
        "/api/v1/payments/cash",
        json={"order_id": order["id"], "amount": order["grand_total"], "cash_confirmed": True},
        headers=owner,
    )

    # Somebody on the door.
    await client.post(
        "/api/v1/staff",
        json={
            "full_name": "Olu",
            "email": f"door-{_uniq()}@test.com",
            "password": "StaffPass123!",
            "role": "security",
            "pin": "5555",
        },
        headers=owner,
    )
    sec = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": "5555"}
    )
    door = {"Authorization": f"Bearer {sec.json()['access_token']}"}

    ep = (await client.get(f"/api/v1/customer/exit-pass/{order['session_token']}")).json()
    return owner, door, order, ep


async def test_the_guest_gets_a_code_they_can_read_out(client):
    _, _, _, ep = await _paid_order_with_pass(client)
    code = ep["short_code"]
    assert code, "the pass has no typable code"
    assert len(code) == 6
    assert code.isupper()


async def test_the_code_avoids_the_characters_people_misread(client):
    """It is read off one phone in the dark and typed into another."""
    from app.services.exit_pass_service import _CODE_ALPHABET

    for ch in "IO01":
        assert ch not in _CODE_ALPHABET


async def test_typing_the_code_opens_the_door(client):
    """The whole point: no camera involved."""
    _, door, order, ep = await _paid_order_with_pass(client)
    r = await client.post(f"/api/v1/exit-pass/scan/{ep['short_code']}", headers=door)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "valid"


async def test_the_code_works_in_lower_case(client):
    """Somebody will type it in lower case. That is not a reason to turn a
    paying guest away."""
    _, door, _, ep = await _paid_order_with_pass(client)
    r = await client.post(
        f"/api/v1/exit-pass/scan/{ep['short_code'].lower()}", headers=door
    )
    assert r.json()["status"] == "valid"


async def test_scanning_the_qr_still_works(client):
    """The long token is what the camera reads, and nothing about it changed."""
    _, door, _, ep = await _paid_order_with_pass(client)
    r = await client.post(f"/api/v1/exit-pass/scan/{ep['token']}", headers=door)
    assert r.json()["status"] == "valid"


async def test_a_code_is_spent_once(client):
    """Both halves open the same pass, so using one must close the other —
    otherwise the pass is worth two exits."""
    _, door, _, ep = await _paid_order_with_pass(client)

    first = await client.post(f"/api/v1/exit-pass/scan/{ep['short_code']}", headers=door)
    assert first.json()["status"] == "valid"

    again = await client.post(f"/api/v1/exit-pass/scan/{ep['token']}", headers=door)
    assert again.json()["status"] == "used", (
        "the QR still worked after the code was spent — one pass, two exits"
    )


async def test_an_expired_code_does_not_open_the_door(client):
    from sqlalchemy import update

    from app.database import AsyncSessionLocal
    from app.models.exit_pass import ExitPass

    _, door, _, ep = await _paid_order_with_pass(client)
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(ExitPass)
            .where(ExitPass.short_code == ep["short_code"])
            .values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        )
        await db.commit()

    r = await client.post(f"/api/v1/exit-pass/scan/{ep['short_code']}", headers=door)
    assert r.json()["status"] == "expired"


async def test_a_code_from_another_venue_is_not_recognised(client):
    """Codes are short, so two venues will hold the same one eventually. The
    door must only ever open on its own."""
    _, _, _, theirs = await _paid_order_with_pass(client)
    _, my_door, _, _ = await _paid_order_with_pass(client)

    r = await client.post(
        f"/api/v1/exit-pass/scan/{theirs['short_code']}", headers=my_door
    )
    assert r.json()["status"] == "invalid"


async def test_a_made_up_code_is_refused(client):
    _, door, _, _ = await _paid_order_with_pass(client)
    r = await client.post("/api/v1/exit-pass/scan/ZZZZZZ", headers=door)
    assert r.json()["status"] == "invalid"


async def test_live_codes_at_one_venue_do_not_collide(client):
    """Generated against the passes that are still spendable, so the door never
    has two answers for one code."""
    from app.database import AsyncSessionLocal
    from app.services.exit_pass_service import generate_short_code

    venue_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        codes = {await generate_short_code(db, venue_id) for _ in range(30)}
    assert len(codes) == 30

"""Orders taken at the table by staff, for guests who will not scan.

Raised by a venue operator, and obvious in hindsight: an older regular, a phone
on 3%, a bottle table who expect to be waited on, or someone who simply does not
want to scan a sticker. Before this, that guest could not be served through the
product at all — their round went on paper, outside every total the venue
depends on, and outside the exit pass that stops them walking.

The rules worth pinning are the ones that are easy to get wrong in a second code
path, which is exactly why there is no second code path: the staff endpoint
reuses `place_order`, so pricing, promotions, routing and stock cannot diverge
from what the guest path does.
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


async def _venue(client):
    """A venue with a table and one drink on the menu."""
    email = f"owner-{_uniq()}@test.com"
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Order Test {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    table = (
        await client.post(
            "/api/v1/tables", json={"label": "VIP 1", "capacity": 4}, headers=headers
        )
    ).json()

    cat = (
        await client.post(
            "/api/v1/menu/categories", json={"name": "Drinks"}, headers=headers
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
            headers=headers,
        )
    ).json()
    return headers, table, item


async def _staff(client, headers, role: str, pin: str):
    """A signed-in staff member of the given role."""
    await client.post(
        "/api/v1/staff",
        json={
            "full_name": f"{role.title()} Person",
            "email": f"{role}-{_uniq()}@test.com",
            "password": "StaffPass123!",
            "role": role,
            "pin": pin,
        },
        headers=headers,
    )
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    r = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": pin}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_an_attendant_can_put_a_round_on_a_table(client):
    """The whole point. A guest who will not scan still gets served through the
    system rather than on paper."""
    headers, table, item = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")

    r = await client.post(
        "/api/v1/orders",
        json={"table_id": table["id"], "items": [{"menu_item_id": item["id"], "quantity": 2}]},
        headers=att,
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["table_id"] == table["id"]
    assert order["items"][0]["quantity"] == 2
    assert order["total_amount"] == 5000


async def test_the_order_is_marked_as_taken_at_the_table(client):
    """Told apart from a guest's own order, so the owner can see how much of the
    night still runs through staff rather than the QR code."""
    headers, table, item = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": table["id"], "items": [{"menu_item_id": item["id"], "quantity": 1}]},
        headers=att,
    )
    assert r.json()["order_source"] == "walk_in"


async def test_it_routes_like_any_other_order(client):
    """A drink keyed in by an attendant must still reach the bar screen. If this
    ever fails, staff-taken rounds are invisible to the people who make them."""
    headers, table, item = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": table["id"], "items": [{"menu_item_id": item["id"], "quantity": 1}]},
        headers=att,
    )
    assert r.json()["items"][0]["routed_to"] == "bar"
    assert r.json()["items"][0]["status"] == "pending"


async def test_a_double_tap_does_not_bill_the_table_twice(client):
    """A busy attendant on a slow network taps Send twice. The same key must
    return the same order rather than a second round on the bill."""
    headers, table, item = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")
    key = _uniq()
    body = {
        "table_id": table["id"],
        "items": [{"menu_item_id": item["id"], "quantity": 1}],
        "client_request_id": key,
    }
    first = await client.post("/api/v1/orders", json=body, headers=att)
    second = await client.post("/api/v1/orders", json=body, headers=att)
    assert first.json()["id"] == second.json()["id"]

    listed = (await client.get("/api/v1/orders", headers=headers)).json()
    assert len(listed) == 1, "the table was billed twice for one tap"


async def test_staff_cannot_order_onto_another_venue_s_table(client):
    """The security boundary. The endpoint takes a table id, so the lookup being
    venue-scoped is the only thing standing between two venues' bills."""
    _, their_table, _ = await _venue(client)
    my_headers, _, _ = await _venue(client)
    att = await _staff(client, my_headers, "attendant", "4444")

    r = await client.post(
        "/api/v1/orders",
        json={"table_id": their_table["id"], "items": []},
        headers=att,
    )
    assert r.status_code == 404, "a table in another venue must not be reachable"


async def test_an_empty_order_is_refused(client):
    """An empty bill line is a mis-tap, and it would sit on the bar screen with
    nothing to make."""
    headers, table, _ = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")
    r = await client.post(
        "/api/v1/orders", json={"table_id": table["id"], "items": []}, headers=att
    )
    assert r.status_code == 400


@pytest.mark.parametrize("role,pin", [("kitchen", "2222"), ("security", "5555")])
async def test_the_stations_that_do_not_take_orders_cannot(client, role, pin):
    """Kitchen and the door never take an order at a table. Keeping them out
    keeps the list of people to ask about a wrong bill short."""
    headers, table, item = await _venue(client)
    staff = await _staff(client, headers, role, pin)
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": table["id"], "items": [{"menu_item_id": item["id"], "quantity": 1}]},
        headers=staff,
    )
    assert r.status_code == 403


async def test_whoever_keyed_it_in_owns_it(client):
    """On a table with no attendant assigned the round would otherwise belong to
    nobody in the night's report."""
    headers, table, item = await _venue(client)
    att = await _staff(client, headers, "attendant", "4444")
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": table["id"], "items": [{"menu_item_id": item["id"], "quantity": 1}]},
        headers=att,
    )
    assert r.json()["assigned_to"] is not None

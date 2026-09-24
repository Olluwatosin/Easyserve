"""Guests who pay before they are served.

Reported from the floor: a guest paid online, the bill said paid, and the order
sat on "pending" and never moved. Two bugs, stacked, and the first was hiding
the second.

**Every item update on a paid order was refused.** The rule existed to stop a
line being voided after cash had changed hands, which is the classic inside-theft
vector — but it was written as "no changes at all", so a prepaid round froze
forever. The bar could not mark it made, the floor's Served button did nothing,
the guest's tracker never moved, and the ticket stayed on the bar screen for the
rest of the night.

**Serving a paid order un-paid it.** Once the first bug was fixed, the
auto-advance rewrote `status` from "paid" to "fully_served" — putting a settled
round back in the cashier's queue, showing it as owing on the floor, and
inviting a second charge for a drink already paid for. Strictly worse than the
bug being fixed, and unreachable while the first one stood.

This matters more than it looks because the online payment flow *encourages*
paying from the bill, so prepaid is the normal path for anyone who pays by card
or transfer.
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


async def _prepaid_order(client):
    """A guest who ordered a drink and settled before it was made."""
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Prepaid {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    owner = {"Authorization": f"Bearer {r.json()['access_token']}"}
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
                "name": "Hennessy VS",
                "price": 45000,
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
        json={
            "order_id": order["id"],
            "amount": order["grand_total"],
            "cash_confirmed": True,
        },
        headers=owner,
    )
    return owner, order, order["items"][0]["id"]


async def _status(client, owner, order_id):
    return (await client.get(f"/api/v1/orders/{order_id}", headers=owner)).json()


async def test_a_prepaid_drink_can_still_be_made_and_served(client):
    """The reported bug. Paying is not being served, and the bar has to be able
    to work a ticket that is already settled."""
    owner, order, item_id = await _prepaid_order(client)

    for target in ("preparing", "ready", "delivered"):
        r = await client.patch(
            f"/api/v1/orders/items/{item_id}/status",
            json={"status": target},
            headers=owner,
        )
        assert r.status_code == 200, f"{target} refused on a paid order: {r.text}"
        current = await _status(client, owner, order["id"])
        assert current["items"][0]["status"] == target


async def test_serving_a_prepaid_order_does_not_un_pay_it(client):
    """The second bug, and the more expensive one: a settled round that goes
    back to 'fully_served' lands in the cashier's queue and gets charged
    twice."""
    owner, order, item_id = await _prepaid_order(client)

    await client.patch(
        f"/api/v1/orders/items/{item_id}/status",
        json={"status": "delivered"},
        headers=owner,
    )

    current = await _status(client, owner, order["id"])
    assert current["status"] == "paid", (
        "serving the items rewrote a paid order to "
        f"{current['status']!r} — the guest can now be charged again"
    )


async def test_a_prepaid_order_stays_out_of_the_unpaid_queue(client):
    """What the previous test protects, seen from the floor."""
    owner, order, item_id = await _prepaid_order(client)
    await client.patch(
        f"/api/v1/orders/items/{item_id}/status",
        json={"status": "delivered"},
        headers=owner,
    )
    orders = (await client.get("/api/v1/orders", headers=owner)).json()
    mine = next(o for o in orders if o["id"] == order["id"])
    assert mine["status"] not in ("open", "partially_served", "fully_served")


async def test_voiding_after_payment_is_still_refused(client):
    """The control the original rule existed for, kept intact. A quiet cancel
    after money has changed hands is the classic way a till is skimmed."""
    owner, _, item_id = await _prepaid_order(client)
    r = await client.patch(
        f"/api/v1/orders/items/{item_id}/status",
        json={"status": "cancelled"},
        headers=owner,
    )
    assert r.status_code == 400
    assert "refund" in r.json()["detail"].lower(), (
        "the refusal should point at the refund path, not just say no"
    )


async def test_an_unpaid_order_still_advances_normally(client):
    """The guard must not freeze ordinary orders, which are the common case."""
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Normal {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    owner = {"Authorization": f"Bearer {r.json()['access_token']}"}
    table = (
        await client.post("/api/v1/tables", json={"label": "T1"}, headers=owner)
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

    await client.patch(
        f"/api/v1/orders/items/{order['items'][0]['id']}/status",
        json={"status": "delivered"},
        headers=owner,
    )
    current = await _status(client, owner, order["id"])
    assert current["status"] == "fully_served", (
        "an unpaid order must still reach the cashier's queue when it is served"
    )

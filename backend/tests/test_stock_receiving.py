"""Booking in a delivery — the half of stock that was missing.

Everything before this could only take stock out: sales deplete it, voids return
it, a count corrects it. Stock *arriving* had to be entered one item at a time
as a manual adjustment, which is neither how a delivery arrives nor how anyone
would choose to key thirty lines off an invoice.

The rules pinned here are the ones a loop of single adjustments would get wrong.
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
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Receiving Test {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _item(client, headers, **over):
    body = {
        "name": f"Star Lager {_uniq()}",
        "price": 2500,
        "item_type": "drink",
        "stock_quantity": 0,
        "stock_pack_size": 24,
        "unit_cost": 1500,
    }
    body.update(over)
    r = await client.post("/api/v1/menu/items", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_a_delivery_counts_in_the_units_the_invoice_uses(client):
    """Two crates of 24 and three loose bottles is 51, not 5. A lounge buys beer
    by the crate and the person keying it in is reading a waybill."""
    h = await _venue(client)
    item = await _item(client, h)
    r = await client.post(
        "/api/v1/stock/receive",
        json={"lines": [{"item_id": item["id"], "packs": 2, "units": 3}]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["lines"][0]["received"] == 51
    assert r.json()["lines"][0]["stock_quantity"] == 51


async def test_a_delivery_updates_the_cost_it_arrived_at(client):
    """Cost moves with every delivery, and this is the one moment the venue is
    holding the invoice that proves the new one."""
    h = await _venue(client)
    item = await _item(client, h, unit_cost=1500)
    r = await client.post(
        "/api/v1/stock/receive",
        json={"lines": [{"item_id": item["id"], "packs": 1, "unit_cost": 1800}]},
        headers=h,
    )
    line = r.json()["lines"][0]
    assert line["cost_changed"] == {"from": 1500.0, "to": 1800.0}

    after = (await client.get("/api/v1/menu/items", headers=h)).json()
    assert next(i for i in after if i["id"] == item["id"])["unit_cost"] == 1800


async def test_omitting_the_cost_leaves_the_old_one_alone(client):
    """Not every delivery is priced when it is booked in. Silence must not be
    read as "free"."""
    h = await _venue(client)
    item = await _item(client, h, unit_cost=1500)
    r = await client.post(
        "/api/v1/stock/receive",
        json={"lines": [{"item_id": item["id"], "units": 6}]},
        headers=h,
    )
    assert r.json()["lines"][0]["cost_changed"] is None
    after = (await client.get("/api/v1/menu/items", headers=h)).json()
    assert next(i for i in after if i["id"] == item["id"])["unit_cost"] == 1500


async def test_a_bad_line_rejects_the_whole_delivery(client):
    """Half a delivery committed because line ten named a deleted item is a
    stock level nobody can reconcile against the paper it came from."""
    h = await _venue(client)
    good = await _item(client, h)
    r = await client.post(
        "/api/v1/stock/receive",
        json={
            "lines": [
                {"item_id": good["id"], "packs": 1},
                {"item_id": str(uuid.uuid4()), "packs": 1},
            ]
        },
        headers=h,
    )
    assert r.status_code == 404

    levels = (await client.get("/api/v1/stock", headers=h)).json()
    assert next(s for s in levels if s["item_id"] == good["id"])["stock_quantity"] == 0, (
        "the good line was committed even though the delivery failed"
    )


async def test_it_reports_the_value_and_whether_that_value_is_complete(client):
    """A total that silently omits the unpriced lines would be read as the cost
    of the delivery."""
    h = await _venue(client)
    priced = await _item(client, h, unit_cost=1500, stock_pack_size=1)
    unpriced = await _item(client, h, unit_cost=None, stock_pack_size=1)

    r = await client.post(
        "/api/v1/stock/receive",
        json={
            "lines": [
                {"item_id": priced["id"], "units": 10},
                {"item_id": unpriced["id"], "units": 5},
            ]
        },
        headers=h,
    )
    body = r.json()
    assert body["value"] == 15000
    assert body["fully_priced"] is False
    assert body["units_received"] == 15


async def test_receiving_an_untracked_item_starts_tracking_it(client):
    """"24 delivered" must read as 24, not as unknown."""
    h = await _venue(client)
    item = await _item(client, h, stock_quantity=None, stock_pack_size=1)
    r = await client.post(
        "/api/v1/stock/receive",
        json={"lines": [{"item_id": item["id"], "units": 24}]},
        headers=h,
    )
    assert r.json()["lines"][0]["stock_quantity"] == 24


async def test_an_empty_delivery_is_refused(client):
    h = await _venue(client)
    item = await _item(client, h)
    r = await client.post(
        "/api/v1/stock/receive",
        json={"lines": [{"item_id": item["id"], "packs": 0, "units": 0}]},
        headers=h,
    )
    assert r.status_code == 422


async def test_the_delivery_lands_in_the_ledger_as_a_restock(client):
    """Variance works by reading the ledger. A delivery that raises the level
    without a matching movement reads as stock appearing from nowhere.

    Counted first, because variance only ever covers the window since the last
    physical count — which is the right definition, and for this venue is
    exactly what the opening stock-take will establish.
    """
    h = await _venue(client)
    item = await _item(client, h, stock_pack_size=1)

    await client.post(
        "/api/v1/stock/count", json={"counts": {item["id"]: 0}}, headers=h
    )
    await client.post(
        "/api/v1/stock/receive",
        json={
            "lines": [{"item_id": item["id"], "units": 12}],
            "reference": "WB-4471",
            "supplier": "Ikeja Drinks",
        },
        headers=h,
    )

    variance = (await client.get("/api/v1/stock/variance", headers=h)).json()
    row = next(r for r in variance["items"] if r["item_id"] == item["id"])
    assert row["restocked"] == 12
    # The books now expect 12 on the shelf and nothing has been sold, so a
    # count of 12 would show no variance at all.
    assert row["on_hand"] == 12

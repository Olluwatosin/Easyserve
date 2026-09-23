"""What to buy before the next busy night.

The old low-stock warning told an owner something was wrong and nothing about
what to do, because one number was doing the work of two. A reorder point says
*act*; a target level says *how much*. With both, the order list is arithmetic
anybody can check: you want 12, you have 3, buy 9 — and in whole crates, because
that is how it is sold.

The other thing pinned here is silence. A sales rate from a single night is not
a rate, and a new lounge has no nights at all. Everything derived from history
stays absent until there is enough of it, because a confident number from no
evidence is worse than no number — it gets ordered against.
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


async def _venue(client):
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Reorder Test {_uniq()}",
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
        "unit_cost": 1500,
        "stock_quantity": 3,
        "stock_pack_size": 24,
        "stock_threshold": 24,
        "stock_par": 120,
    }
    body.update(over)
    r = await client.post("/api/v1/menu/items", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_it_says_how_many_to_buy_not_just_that_something_is_low(client):
    """The point of the target level. 3 on hand, 120 wanted, sold in 24s."""
    h = await _venue(client)
    await _item(client, h, stock_quantity=3, stock_par=120, stock_pack_size=24)

    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    line = body["lines"][0]
    assert line["on_hand"] == 3
    assert line["par"] == 120
    # 117 short, sold in crates of 24 → 5 crates, because you cannot buy 4.875.
    assert line["suggested_packs"] == 5
    assert line["suggested_units"] == 120


async def test_the_order_is_costed_so_it_can_be_checked_against_money(client):
    h = await _venue(client)
    await _item(client, h, stock_quantity=3, stock_par=120, stock_pack_size=24, unit_cost=1500)
    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    assert body["lines"][0]["line_cost"] == 180000  # 120 × 1500
    assert body["estimated_cost"] == 180000
    assert body["fully_priced"] is True


async def test_an_unpriced_line_does_not_quietly_vanish_from_the_total(client):
    """A total that silently omits lines is read as the cost of the order."""
    h = await _venue(client)
    await _item(client, h, unit_cost=None, stock_quantity=1, stock_par=24, stock_pack_size=24)
    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    assert body["lines"][0]["line_cost"] is None
    assert body["fully_priced"] is False


async def test_no_target_means_no_invented_quantity(client):
    """An invented order quantity is money spent on the system's guess. The
    item still appears — it is genuinely low — but says the target is missing.
    """
    h = await _venue(client)
    await _item(client, h, stock_quantity=2, stock_par=None)
    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    line = body["lines"][0]
    assert line["par"] is None
    assert line["suggested_packs"] is None
    assert line["suggested_units"] is None
    assert body["no_target_set"] == 1


async def test_items_above_the_reorder_point_are_left_out(client):
    """A shopping list with everything on it is not a shopping list."""
    h = await _venue(client)
    await _item(client, h, stock_quantity=200, stock_threshold=24, stock_par=240)
    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    assert body["count"] == 0


async def test_running_out_is_called_out_separately(client):
    h = await _venue(client)
    await _item(client, h, stock_quantity=0, stock_par=48)
    body = (await client.get("/api/v1/stock/reorder", headers=h)).json()
    assert body["lines"][0]["is_out"] is True
    assert body["out_of_stock"] == 1


async def test_a_brand_new_venue_gets_no_sales_rate_at_all(client):
    """The case this lounge is actually in. Nothing has ever been sold, so any
    'nights of cover' would be invented."""
    h = await _venue(client)
    await _item(client, h, stock_quantity=2, stock_par=48)
    line = (await client.get("/api/v1/stock/reorder", headers=h)).json()["lines"][0]
    assert line["sells_per_night"] is None
    assert line["nights_of_cover"] is None
    assert line["nights_counted"] == 0


async def test_one_night_of_sales_is_still_not_a_rate(client):
    """An average of one night is not an average. It stays silent rather than
    reporting the first Saturday as if it were every night."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.menu_item import MenuItem
    from app.services import stock_service

    h = await _venue(client)
    item = await _item(client, h, stock_quantity=10, stock_par=48)

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(MenuItem).where(MenuItem.id == item["id"]))
        ).scalar_one()
        await stock_service.record_movement(db, row, -6, "sale")
        await db.commit()

    line = (await client.get("/api/v1/stock/reorder", headers=h)).json()["lines"][0]
    assert line["nights_counted"] == 1
    assert line["sells_per_night"] is None, "one night reported as a rate"
    assert line["nights_of_cover"] is None


async def test_two_nights_of_sales_gives_a_rate_and_a_days_left(client):
    """Once there is something to average, it is arithmetic and it is shown —
    described as what it is, at the current rate."""
    from sqlalchemy import select, update

    from app.database import AsyncSessionLocal
    from app.models.menu_item import MenuItem
    from app.models.stock_movement import StockMovement
    from app.services import stock_service

    h = await _venue(client)
    item = await _item(client, h, stock_quantity=20, stock_par=120)

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(MenuItem).where(MenuItem.id == item["id"]))
        ).scalar_one()
        first = await stock_service.record_movement(db, row, -10, "sale")
        await db.flush()
        # Push one movement back a night so there are two trading nights.
        await db.execute(
            update(StockMovement)
            .where(StockMovement.id == first.id)
            .values(created_at=datetime.now(timezone.utc) - timedelta(days=1))
        )
        row.stock_quantity = 20
        await stock_service.record_movement(db, row, -10, "sale")
        await db.commit()

    line = (await client.get("/api/v1/stock/reorder", headers=h)).json()["lines"][0]
    assert line["nights_counted"] == 2
    assert line["sells_per_night"] == 10.0
    # 10 left at 10 a night is one night of cover.
    assert line["nights_of_cover"] == 1.0

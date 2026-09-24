"""When a guest's bill ends, and whose orders belong on it.

A session token is what ties a phone to a bill. It was stored once, under one
key, and never cleared — which produced the complaint that started this: "when I
scan the customer barcode it keeps adding up to previous". Two separate faults
sat behind that one symptom.

**One token for every table.** A phone that scanned table 3 and later table 7
put both tables' rounds on a single bill. That is not untidiness, it is a wrong
bill — and it is fixed by keying the token to the table, which the phone does.

**Nothing ever ended a visit.** The scan after the night you paid for reopened
the bill you had already settled, and the one after that opened on top of both.
Ending it cannot be the phone's decision: guests pay at the bar, pay on somebody
else's phone, and close the tab before the confirmation lands. So the server
reports whether everything on the session is paid for, and the phone starts a
fresh one when it hears yes.

What the server owes the phone is tested here. The phone's half — a token per
table, remade when the business day rolls over — lives in the table page.
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


async def _a_venue(client, *, table_label="Table 1"):
    """A venue with one table and one drink on the menu.

    Returns (qr_token, menu_item_id, owner_headers).
    """
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Session Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OwnerPass123!"}
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    table = await client.post(
        "/api/v1/tables", json={"label": table_label, "zone": "Main"}, headers=headers
    )
    assert table.status_code == 200, table.text

    item = await client.post(
        "/api/v1/menu/items",
        json={"name": "Hennessy VS", "price": 25000, "item_type": "drink"},
        headers=headers,
    )
    assert item.status_code == 200, item.text

    tables = (await client.get("/api/v1/tables", headers=headers)).json()
    qr = next(t["qr_token"] for t in tables if t["label"] == table_label)
    return qr, item.json()["id"], headers


async def _order(client, qr: str, session: str, item_id: str, qty: int = 1):
    r = await client.post(
        f"/api/v1/customer/orders/{qr}",
        json={
            "session_token": session,
            "client_request_id": uuid.uuid4().hex,
            "items": [{"menu_item_id": item_id, "quantity": qty}],
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _visit(client, qr: str, session: str):
    """What the menu response says about this visit."""
    r = await client.get(f"/api/v1/customer/menu/{qr}?session_token={session}")
    assert r.status_code == 200, r.text
    return r.json().get("session")


async def _mark_paid(order_id: str):
    """Settled at the bar, on somebody else's phone — the case the guest's own
    device cannot observe."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.order import Order

    async with AsyncSessionLocal() as db:
        order = (
            await db.execute(select(Order).where(Order.id == order_id))
        ).scalar_one()
        order.status = "paid"
        await db.commit()


# ── When a visit is over ─────────────────────────────────────────────────────


async def test_an_open_round_keeps_the_visit_going(client):
    """The other half of the bug: it must not start fresh while a guest still
    owes for something. That would lose the bill."""
    qr, item, _ = await _a_venue(client)
    session = uuid.uuid4().hex
    await _order(client, qr, session, item)

    visit = await _visit(client, qr, session)
    assert visit["settled"] is False, (
        "an unpaid round was reported as settled, so the phone would start a "
        "clean bill and abandon money owed"
    )
    assert visit["orders"] == 1
    assert visit["items"] == 1
    assert visit["total"] == 25000


async def test_a_paid_off_visit_reports_itself_finished(client):
    """The signal the phone rotates its token on. Without it, the next scan
    reopens a bill that was already paid."""
    qr, item, _ = await _a_venue(client)
    session = uuid.uuid4().hex
    order = await _order(client, qr, session, item)
    await _mark_paid(order["id"])

    visit = await _visit(client, qr, session)
    assert visit["settled"] is True, (
        "the visit was paid for and still reports as live — this is the "
        "accumulation the guest complained about"
    )


async def test_ordering_again_after_settling_reopens_the_visit(client):
    """Rounds join the open order, so a session holds one live bill at a time.
    Paying it closes the visit — and then ordering another drink has to open it
    again, or the guest drinks on a bill that reports itself finished and the
    phone wipes the screen out from under them.
    """
    qr, item, _ = await _a_venue(client)
    session = uuid.uuid4().hex
    first = await _order(client, qr, session, item)
    await _mark_paid(first["id"])
    assert (await _visit(client, qr, session))["settled"] is True

    await _order(client, qr, session, item, qty=2)

    visit = await _visit(client, qr, session)
    assert visit["settled"] is False, "a new round did not reopen the visit"
    assert visit["orders"] == 2, "the new round joined the paid bill instead of starting one"
    assert visit["items"] == 3


async def test_a_round_is_counted_in_drinks_not_in_lines(client):
    """Four shots ordered together is four items to the guest reading "Earlier
    this visit". Counting order lines would show them 1."""
    qr, item, _ = await _a_venue(client)
    session = uuid.uuid4().hex
    await _order(client, qr, session, item, qty=4)

    visit = await _visit(client, qr, session)
    assert visit["items"] == 4, "the visit line counts lines on the bill, not drinks"
    assert visit["total"] == 100000


async def test_a_fresh_token_has_no_visit_to_report(client):
    """What the phone sees immediately after rotating. If this came back
    settled, the phone would rotate again, and again."""
    qr, _item, _ = await _a_venue(client)
    visit = await _visit(client, qr, uuid.uuid4().hex)
    assert visit["orders"] == 0
    assert visit["settled"] is False, (
        "an empty session reporting as settled would make the phone mint a new "
        "token on every load, forever"
    )


async def test_a_cancelled_round_does_not_hold_the_visit_open(client):
    """A voided order is not money owed, so it must not keep a finished visit
    alive — the guest would never get a clean screen again."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.order import Order

    qr, item, _ = await _a_venue(client)
    session = uuid.uuid4().hex
    paid = await _order(client, qr, session, item)
    voided = await _order(client, qr, session, item)
    await _mark_paid(paid["id"])

    async with AsyncSessionLocal() as db:
        o = (await db.execute(select(Order).where(Order.id == voided["id"]))).scalar_one()
        o.status = "cancelled"
        await db.commit()

    visit = await _visit(client, qr, session)
    assert visit["settled"] is True, "a cancelled order is keeping a paid-off visit open"


# ── Whose orders belong on it ────────────────────────────────────────────────


async def test_a_token_seen_at_two_venues_does_not_mix_them(client):
    """A phone keeps its token. Before the menu response was scoped, the same
    token at a second venue reported the first venue's rounds — and the "order
    again" strip offered that venue's drinks.

    Keying the token per table makes this structurally unlikely now, but the
    scoping is what makes it impossible, and a token minted before the change is
    still out there on somebody's phone.
    """
    qr_a, item_a, _ = await _a_venue(client, table_label="A1")
    qr_b, _item_b, _ = await _a_venue(client, table_label="B1")

    shared = uuid.uuid4().hex
    await _order(client, qr_a, shared, item_a, qty=3)

    at_b = await _visit(client, qr_b, shared)
    assert at_b["orders"] == 0, "another venue's bill followed the phone here"
    assert at_b["total"] == 0

    menu_b = (
        await client.get(f"/api/v1/customer/menu/{qr_b}?session_token={shared}")
    ).json()
    assert not menu_b.get("suggestions"), (
        "the other venue's drinks were offered as things to order again"
    )

    # And the venue that does own the rounds still sees them.
    at_a = await _visit(client, qr_a, shared)
    assert at_a["orders"] == 1
    assert at_a["total"] == 75000


async def test_two_tables_at_one_venue_are_told_apart_by_their_tokens(client):
    """The fix for the original complaint lives on the phone — a token per
    table. This is the property that makes it work: rounds follow the token, so
    two tokens are two bills even at the same venue."""
    qr, item, headers = await _a_venue(client, table_label="T1")
    second = await client.post(
        "/api/v1/tables", json={"label": "T2", "zone": "Main"}, headers=headers
    )
    assert second.status_code == 200
    tables = (await client.get("/api/v1/tables", headers=headers)).json()
    qr2 = next(t["qr_token"] for t in tables if t["label"] == "T2")

    token_t1, token_t2 = uuid.uuid4().hex, uuid.uuid4().hex
    await _order(client, qr, token_t1, item, qty=1)
    await _order(client, qr2, token_t2, item, qty=4)

    assert (await _visit(client, qr, token_t1))["items"] == 1
    assert (await _visit(client, qr2, token_t2))["items"] == 4

    # The bill endpoint agrees — it is keyed on the token, so a token per table
    # is a bill per table.
    bill = (await client.get(f"/api/v1/customer/orders/{token_t1}")).json()
    assert len(bill) == 1
    assert sum(len(o["items"]) for o in bill) == 1

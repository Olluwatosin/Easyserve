"""Taking the venue's own data out of it.

An owner has to be able to hand last month to an accountant without asking us
for a database dump, so there is a CSV for orders, line items, payments, shifts
and stock movements over any range of nights.

What these guard is mostly arithmetic that a spreadsheet will silently accept:

* A **split bill writes two payment rows.** Joined plainly, that lists the order
  twice, and the "Total" column sums to twice the night's takings. Nothing about
  the file looks wrong — the number is just not the number.
* A **night runs past midnight.** Exporting by timestamp instead of business
  date cuts the last night of the month in half and moves the small hours into
  the next month's figures. The two files disagree and neither matches the till.
* **Amounts have to be numbers.** A naira sign makes the column text, and a text
  column sums to zero in every spreadsheet without saying so.

Runs against a real database: all three are properties of the SQL, and a mock
would be asserting that my query says what I wrote.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone

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


async def _owner(client):
    """A venue with an owner signed in. Returns (headers, venue_id)."""
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Export Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OwnerPass123!"}
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    return headers, venue["id"]


def _rows(body: str) -> list[dict]:
    """Parse the response the way a spreadsheet would, BOM and all."""
    import csv
    import io

    return list(csv.DictReader(io.StringIO(body.lstrip("﻿"))))


async def _an_order(venue_id: str, *, night: date, opened: datetime,
                    total=10000, service=0, vat=0, table_label="Table 1"):
    """One order with one item, placed directly so its night and clock can be
    chosen — which is the whole point of two of these tests."""
    from app.database import AsyncSessionLocal
    from app.models.order import Order
    from app.models.order_item import OrderItem
    from app.models.table import Table

    async with AsyncSessionLocal() as db:
        table = Table(
            id=str(uuid.uuid4()), venue_id=venue_id, label=table_label,
            zone="Main", qr_token=uuid.uuid4().hex,
        )
        db.add(table)
        order = Order(
            id=str(uuid.uuid4()), venue_id=venue_id, table_id=table.id,
            session_token=uuid.uuid4().hex, status="paid", business_date=night,
            created_at=opened, total_amount=total, service_charge=service,
            vat_amount=vat,
        )
        db.add(order)
        db.add(OrderItem(
            id=str(uuid.uuid4()), order_id=order.id, name="Hennessy VS",
            price=total, quantity=1, item_type="drink", routed_to="bar",
            status="served",
        ))
        await db.commit()
        return order.id


async def _a_payment(venue_id: str, order_id: str, *, night: date, amount, method):
    from app.database import AsyncSessionLocal
    from app.models.payment import Payment

    async with AsyncSessionLocal() as db:
        db.add(Payment(
            id=str(uuid.uuid4()), venue_id=venue_id, order_id=order_id,
            amount=amount, method=method, business_date=night,
            status="confirmed",
        ))
        await db.commit()


# ── The arithmetic ───────────────────────────────────────────────────────────


async def test_a_split_bill_does_not_double_the_takings(client):
    """The bug that would survive review: two payment rows, one order, and a
    Total column that sums to twice the money.

    Four guests settling one table between them is ordinary, not an edge case.
    """
    headers, vid = await _owner(client)
    night = date(2026, 3, 14)
    oid = await _an_order(vid, night=night, opened=datetime(2026, 3, 14, 22, 0, tzinfo=timezone.utc), total=40000)
    await _a_payment(vid, oid, night=night, amount=25000, method="cash")
    await _a_payment(vid, oid, night=night, amount=15000, method="transfer")

    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": night.isoformat(), "end": night.isoformat()},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    rows = _rows(r.text)

    assert len(rows) == 1, (
        "the split bill listed the order once per payment — every sum over the "
        "Total column is now wrong, and nothing in the file says so"
    )
    assert float(rows[0]["Total"]) == 40000.0
    # Both methods still have to be visible, or the split is unreconcilable.
    assert set(rows[0]["Paid with"].split("/")) == {"cash", "transfer"}

    # And the payments file still shows both legs.
    p = await client.get(
        "/api/v1/exports/payments.csv",
        params={"start": night.isoformat(), "end": night.isoformat()},
        headers=headers,
    )
    legs = _rows(p.text)
    assert len(legs) == 2
    assert sum(float(x["Amount"]) for x in legs) == 40000.0


async def test_the_small_hours_belong_to_the_night_that_started_them(client):
    """A 1AM order on the 1st is the 30th's business. Exporting March must
    include it; exporting April must not — otherwise the two months disagree
    and neither matches what the owner remembers taking."""
    headers, vid = await _owner(client)

    # 1AM on 1 April, local — stamped by the system as the night of 31 March.
    await _an_order(
        vid, night=date(2026, 3, 31),
        opened=datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc),  # 01:00 Lagos
        total=18000,
    )

    march = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": "2026-03-01", "end": "2026-03-31"}, headers=headers,
    )
    april = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": "2026-04-01", "end": "2026-04-30"}, headers=headers,
    )

    assert len(_rows(march.text)) == 1, "the last night of the month fell out of the month"
    assert len(_rows(april.text)) == 0, "a March night was billed to April"


async def test_amounts_are_plain_numbers(client):
    """A naira sign or a thousands separator turns the column to text, and text
    sums to zero without complaining."""
    headers, vid = await _owner(client)
    night = date(2026, 5, 2)
    await _an_order(
        vid, night=night, opened=datetime(2026, 5, 2, 21, 0, tzinfo=timezone.utc),
        total=1250000, service=62500, vat=94687.5,
    )

    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": night.isoformat(), "end": night.isoformat()},
        headers=headers,
    )
    row = _rows(r.text)[0]

    assert "₦" not in r.text and "," not in row["Total"]
    assert float(row["Subtotal"]) == 1250000.00
    assert float(row["Total"]) == 1407187.50, "the total must carry charges and VAT"


async def test_a_shift_nobody_closed_has_no_hours(client):
    """Blank, not a guess. A blank gets queried; a number gets paid."""
    from app.database import AsyncSessionLocal
    from app.models.shift import Shift
    from app.models.user import User
    from sqlalchemy import select

    headers, vid = await _owner(client)
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.venue_id == vid))).scalars().first()
        start = datetime(2026, 6, 5, 20, 0, tzinfo=timezone.utc)
        db.add(Shift(id=str(uuid.uuid4()), venue_id=vid, user_id=owner.id,
                     started_at=start, ended_at=start + timedelta(hours=6)))
        db.add(Shift(id=str(uuid.uuid4()), venue_id=vid, user_id=owner.id,
                     started_at=start, ended_at=None, flagged_unclosed=True))
        await db.commit()

    r = await client.get(
        "/api/v1/exports/shifts.csv",
        params={"start": "2026-06-05", "end": "2026-06-05"}, headers=headers,
    )
    rows = _rows(r.text)
    assert len(rows) == 2
    worked = {x["Hours"] for x in rows}
    assert "6.00" in worked
    assert "" in worked, "an unclosed shift was given an invented number of hours"


# ── Who may take it, and what they get ───────────────────────────────────────


async def test_another_venue_never_appears(client):
    """The broadest read in the system, so the scoping is the point."""
    mine_headers, mine = await _owner(client)
    _, theirs = await _owner(client)

    night = date(2026, 7, 7)
    await _an_order(theirs, night=night, opened=datetime(2026, 7, 7, 23, 0, tzinfo=timezone.utc),
                    table_label="Their Table")

    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": night.isoformat(), "end": night.isoformat()},
        headers=mine_headers,
    )
    assert _rows(r.text) == [], "another venue's night came out in this venue's export"


async def test_a_station_account_cannot_export(client):
    headers, vid = await _owner(client)
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    await client.post(
        "/api/v1/staff",
        json={"full_name": "Amara", "email": f"a-{_uniq()}@test.com",
              "password": "StaffPass123!", "role": "bartender", "pin": "4455"},
        headers=headers,
    )
    them = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": "4455"}
    )
    staff_headers = {"Authorization": f"Bearer {them.json()['access_token']}"}

    r = await client.get("/api/v1/exports/orders.csv", headers=staff_headers)
    assert r.status_code == 403


async def test_it_downloads_as_a_named_file(client):
    """The owner ends up with several of these in one folder, so the venue, the
    dataset and the range all have to be in the name."""
    headers, _ = await _owner(client)
    r = await client.get(
        "/api/v1/exports/payments.csv",
        params={"start": "2026-08-01", "end": "2026-08-31"}, headers=headers,
    )
    disposition = r.headers["content-disposition"]
    assert "attachment" in disposition
    assert "payments" in disposition
    assert "2026-08-01_to_2026-08-31" in disposition


@pytest.mark.parametrize("dataset", ["orders", "items", "payments", "shifts", "stock"])
async def test_every_export_runs(client, dataset):
    """A smoke test over all five, because each is a different query and a
    broken join only shows up when somebody clicks it."""
    headers, _ = await _owner(client)
    r = await client.get(
        f"/api/v1/exports/{dataset}.csv",
        params={"start": "2026-01-01", "end": "2026-01-31"}, headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.text.lstrip("﻿").splitlines()[0], "no header row"


async def test_an_unknown_export_says_what_there_is(client):
    headers, _ = await _owner(client)
    r = await client.get("/api/v1/exports/everything.csv", headers=headers)
    assert r.status_code == 404
    assert "orders" in r.json()["detail"]


async def test_a_range_that_would_pull_years_is_refused(client):
    headers, _ = await _owner(client)
    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": "2020-01-01", "end": "2026-01-01"}, headers=headers,
    )
    assert r.status_code == 400


async def test_a_backwards_range_is_refused(client):
    headers, _ = await _owner(client)
    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": "2026-05-30", "end": "2026-05-01"}, headers=headers,
    )
    assert r.status_code == 400


async def test_no_dates_means_this_month(client):
    """The commonest click. Defaulting to the current month is what "export my
    data" means to somebody who has not thought about it yet."""
    from app.utils.venue_time import business_date

    headers, _ = await _owner(client)
    r = await client.get("/api/v1/exports/orders.csv", headers=headers)
    assert r.status_code == 200
    today = business_date()
    assert f"{today:%Y-%m-01}_to_{today:%Y-%m-%d}" in r.headers["content-disposition"]


async def test_the_browser_is_allowed_to_read_the_filename(client):
    """Cross-origin, JavaScript sees no response header unless CORS names it —
    and the frontend and API are on different origins in production.

    Without this the file still downloads, but under a generated name with no
    row count, and it works perfectly on a developer's machine where both sit on
    localhost. So it is asserted on the app's own configuration rather than on a
    response, which is where the mistake would actually be.
    """
    from starlette.middleware.cors import CORSMiddleware

    from app.main import app

    cors = next(
        (m for m in app.user_middleware if m.cls is CORSMiddleware), None
    )
    assert cors is not None, "CORS is not configured at all"
    exposed = {h.lower() for h in cors.kwargs.get("expose_headers", [])}
    assert "content-disposition" in exposed, (
        "the download filename is invisible to the browser cross-origin, so "
        "every export saves under a generated name"
    )
    assert "x-row-count" in exposed


async def test_the_row_count_is_reported(client):
    """So the UI can tell an empty range from a failed request — which look the
    same in a downloads folder."""
    headers, vid = await _owner(client)
    night = date(2026, 9, 9)
    await _an_order(vid, night=night, opened=datetime(2026, 9, 9, 22, 0, tzinfo=timezone.utc))
    await _an_order(vid, night=night, opened=datetime(2026, 9, 9, 23, 0, tzinfo=timezone.utc),
                    table_label="Table 2")

    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": night.isoformat(), "end": night.isoformat()}, headers=headers,
    )
    assert r.headers["x-row-count"] == "2"

    empty = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": "2026-02-02", "end": "2026-02-02"}, headers=headers,
    )
    assert empty.headers["x-row-count"] == "0"


async def test_excel_can_read_a_nigerian_name(client):
    """Excel assumes the system codepage without a BOM, which turns "Sàngó" into
    mojibake on the machines these get opened on."""
    headers, vid = await _owner(client)
    night = date(2026, 10, 3)
    await _an_order(vid, night=night, opened=datetime(2026, 10, 3, 22, 0, tzinfo=timezone.utc),
                    table_label="Sàngó Booth")

    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": night.isoformat(), "end": night.isoformat()}, headers=headers,
    )
    assert r.content.startswith(b"\xef\xbb\xbf"), "no UTF-8 BOM, so Excel will mangle accents"
    assert "Sàngó Booth" in r.text

"""Covers, and the one line that says why a night was what it was.

Both exist for the same reason and neither can be derived from sales.

**Covers** turn takings into spend per head, which is the difference between "we
took less tonight" and "fewer people came" — two sentences that call for opposite
responses. A venue cannot tell them apart from a sales total.

**The night note** is what stops a forecast treating a live act, a public
holiday, a downpour and a four-hour power cut as the same unexplained noise. A
tag is what a report groups on; the free text is what a person reads six weeks
later when the tag alone does not explain the figure.

Both had a column and no way to enter anything into it, which is the same as not
having them.
"""
import os
import uuid
from datetime import date, timedelta

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
    """Owner headers, plus a table's QR token and a menu item to order."""
    email = f"owner-{_uniq()}@test.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Night Venue {_uniq()}",
            "full_name": "Owner",
            "email": email,
            "password": "OwnerPass123!",
        },
    )
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OwnerPass123!"}
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    await client.post(
        "/api/v1/tables", json={"label": "Table 1", "zone": "Main"}, headers=headers
    )
    item = await client.post(
        "/api/v1/menu/items",
        json={"name": "Hennessy VS", "price": 25000, "item_type": "drink"},
        headers=headers,
    )
    tables = (await client.get("/api/v1/tables", headers=headers)).json()
    return headers, tables[0]["qr_token"], item.json()["id"]


async def _an_order(client, qr, item):
    r = await client.post(
        f"/api/v1/customer/orders/{qr}",
        json={
            "session_token": uuid.uuid4().hex,
            "client_request_id": uuid.uuid4().hex,
            "items": [{"menu_item_id": item, "quantity": 1}],
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _station(client, headers, role, pin):
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    await client.post(
        "/api/v1/staff",
        json={"full_name": "Amara", "email": f"a-{_uniq()}@test.com",
              "password": "StaffPass123!", "role": role, "pin": pin},
        headers=headers,
    )
    r = await client.post(
        "/api/v1/auth/pin-login", json={"venue_slug": venue["slug"], "pin": pin}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ── Covers ───────────────────────────────────────────────────────────────────


async def test_an_attendant_can_say_how_many_are_at_the_table(client):
    """The person who knows is the one standing there, so it is not owner-only."""
    headers, qr, item = await _venue(client)
    order = await _an_order(client, qr, item)
    staff = await _station(client, headers, "attendant", "7788")

    r = await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": 4}, headers=staff
    )
    assert r.status_code == 200, r.text
    assert r.json()["covers"] == 4

    # And it comes back on the order, which is what the floor screen reads.
    again = await client.get(f"/api/v1/orders/{order['id']}", headers=staff)
    assert again.json()["covers"] == 4


async def test_unknown_and_zero_are_not_the_same_thing(client):
    """Nobody having said is not a table of nobody. Spend per head has to skip
    the first and would divide by the second."""
    headers, qr, item = await _venue(client)
    order = await _an_order(client, qr, item)

    assert order["covers"] is None, "a new bill claims to know a headcount"

    # A mistyped number must be retractable, back to genuinely unknown.
    await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": 6}, headers=headers
    )
    cleared = await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": None}, headers=headers
    )
    assert cleared.json()["covers"] is None

    # And zero is a mistyped clear, not a valid answer.
    bad = await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": 0}, headers=headers
    )
    assert bad.status_code == 400


async def test_covers_can_still_be_corrected_after_payment(client):
    """They get remembered at the end of the night. Refusing the edit once the
    bill is paid is how the column ends up permanently empty."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.order import Order

    headers, qr, item = await _venue(client)
    order = await _an_order(client, qr, item)

    async with AsyncSessionLocal() as db:
        o = (await db.execute(select(Order).where(Order.id == order["id"]))).scalar_one()
        o.status = "paid"
        await db.commit()

    r = await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": 5}, headers=headers
    )
    assert r.status_code == 200, "a paid bill refused a headcount correction"
    assert r.json()["covers"] == 5


async def test_another_venue_cannot_set_covers_on_this_one(client):
    headers, qr, item = await _venue(client)
    order = await _an_order(client, qr, item)
    other_headers, _, _ = await _venue(client)

    r = await client.patch(
        f"/api/v1/orders/{order['id']}/covers",
        json={"covers": 3}, headers=other_headers,
    )
    assert r.status_code == 404


async def test_covers_reach_the_export(client):
    """Where the figure is actually used."""
    import csv
    import io

    headers, qr, item = await _venue(client)
    order = await _an_order(client, qr, item)
    await client.patch(
        f"/api/v1/orders/{order['id']}/covers", json={"covers": 7}, headers=headers
    )

    today = date.today().isoformat()
    r = await client.get(
        "/api/v1/exports/orders.csv",
        params={"start": (date.today() - timedelta(days=1)).isoformat(), "end": today},
        headers=headers,
    )
    rows = list(csv.DictReader(io.StringIO(r.text.lstrip("﻿"))))
    mine = [x for x in rows if x["Order"] == order["id"][:8]]
    assert mine and mine[0]["Covers"] == "7"


# ── The night note ───────────────────────────────────────────────────────────


async def test_whoever_closes_can_write_the_night_up(client):
    """A cashier, not just the owner — closing is the only moment anybody
    remembers what the night was."""
    headers, _, _ = await _venue(client)
    cashier = await _station(client, headers, "cashier", "5566")
    from app.utils.venue_time import business_date

    tonight = business_date().isoformat()
    r = await client.put(
        f"/api/v1/nights/{tonight}",
        json={"tag": "live_music", "note": "Saxophonist from 11. Room was full by 1."},
        headers=cashier,
    )
    assert r.status_code == 200, r.text
    assert r.json()["tag"] == "live_music"
    assert r.json()["recorded_by_name"] == "Amara", "the note does not say who to ask"


async def test_a_second_write_is_an_edit_not_a_second_record(client):
    """One line per night. The table says so; this proves the endpoint agrees."""
    from app.utils.venue_time import business_date

    headers, _, _ = await _venue(client)
    tonight = business_date().isoformat()

    await client.put(f"/api/v1/nights/{tonight}", json={"tag": "dj"}, headers=headers)
    await client.put(
        f"/api/v1/nights/{tonight}",
        json={"tag": "power_cut", "note": "Generator down 1–2am"},
        headers=headers,
    )

    listed = (await client.get("/api/v1/nights", headers=headers)).json()
    assert len(listed) == 1, "editing the night created a second record"
    assert listed[0]["tag"] == "power_cut"


async def test_clearing_it_removes_the_line_rather_than_blanking_it(client):
    """"Nobody wrote one" and "somebody wrote nothing" must not look different
    in the history."""
    from app.utils.venue_time import business_date

    headers, _, _ = await _venue(client)
    tonight = business_date().isoformat()

    await client.put(f"/api/v1/nights/{tonight}", json={"tag": "quiet"}, headers=headers)
    await client.put(
        f"/api/v1/nights/{tonight}", json={"tag": None, "note": "   "}, headers=headers
    )

    assert (await client.get("/api/v1/nights", headers=headers)).json() == []


async def test_an_unwritten_night_is_not_an_error(client):
    """Most of a night has no note yet. That is the normal state, not a 404."""
    headers, _, _ = await _venue(client)
    r = await client.get("/api/v1/nights/tonight", headers=headers)
    assert r.status_code == 200
    assert r.json() is None


async def test_a_made_up_tag_is_refused(client):
    """The tags are what reports group on, so a typo would silently become its
    own category of one."""
    from app.utils.venue_time import business_date

    headers, _, _ = await _venue(client)
    r = await client.put(
        f"/api/v1/nights/{business_date().isoformat()}",
        json={"tag": "live-music"}, headers=headers,
    )
    assert r.status_code == 422


async def test_the_ui_reads_the_tag_list_from_here(client):
    """So there is one list, not one here and a drifting copy in the frontend."""
    from app.models.venue_night import NIGHT_TAGS

    headers, _, _ = await _venue(client)
    r = await client.get("/api/v1/nights/tags", headers=headers)
    assert r.json()["tags"] == list(NIGHT_TAGS)


async def test_a_night_that_has_not_happened_cannot_be_written_up(client):
    """Writing tomorrow up is always a mistake — a mistyped date, or a timezone
    the client got wrong — and it would poison the forecast with a night that
    never took place."""
    from app.utils.venue_time import business_date

    headers, _, _ = await _venue(client)
    tomorrow = (business_date() + timedelta(days=1)).isoformat()
    r = await client.put(
        f"/api/v1/nights/{tomorrow}", json={"tag": "dj"}, headers=headers
    )
    assert r.status_code == 400


async def test_one_venue_never_reads_another_venues_nights(client):
    from app.utils.venue_time import business_date

    mine, _, _ = await _venue(client)
    theirs, _, _ = await _venue(client)
    tonight = business_date().isoformat()

    await client.put(
        f"/api/v1/nights/{tonight}",
        json={"tag": "private_event", "note": "Their booking"}, headers=theirs,
    )

    assert (await client.get("/api/v1/nights", headers=mine)).json() == []
    assert (await client.get("/api/v1/nights/tonight", headers=mine)).json() is None


async def test_an_attendant_cannot_read_the_history(client):
    """The note is operational; the history is the owner's."""
    headers, _, _ = await _venue(client)
    staff = await _station(client, headers, "attendant", "9911")
    r = await client.get("/api/v1/nights", headers=staff)
    assert r.status_code == 403


async def test_tonight_is_written_without_the_client_naming_the_date(client):
    """The note gets written at 4AM, when the browser's "today" is already the
    next calendar day and the venue is still on last night. Sending no date at
    all is what stops a whole class of note filed against the wrong night."""
    from app.utils.venue_time import business_date

    headers, _, _ = await _venue(client)
    r = await client.put(
        "/api/v1/nights/tonight",
        json={"tag": "match_day", "note": "Derby on the big screen"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["business_date"] == business_date().isoformat()

    # And it is the same record the dated route would have written.
    listed = (await client.get("/api/v1/nights", headers=headers)).json()
    assert len(listed) == 1
    assert listed[0]["tag"] == "match_day"


async def test_clearing_tonight_works_through_the_undated_route_too(client):
    headers, _, _ = await _venue(client)
    await client.put("/api/v1/nights/tonight", json={"tag": "rain"}, headers=headers)
    await client.put(
        "/api/v1/nights/tonight", json={"tag": None, "note": None}, headers=headers
    )
    assert (await client.get("/api/v1/nights", headers=headers)).json() == []

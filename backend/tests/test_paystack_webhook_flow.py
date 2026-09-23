"""A Paystack charge, from the webhook to the exit pass.

The existing tests cover the pieces — signature maths, the disabled case. This
covers the path money actually takes, against a real database, with a real
HMAC-SHA512 signature computed the way Paystack computes it.

It matters because this endpoint is the one part of the system that takes
instructions from the open internet. Everything it decides — whether an order is
paid, whether a guest may leave — comes from a request anybody can send. What is
pinned here is what it refuses:

  * a body that is not signed with the venue's secret
  * a body that is signed but pays less than the bill
  * a replay of a charge that has already been settled

The underpayment case is the interesting one. Amounts come from Paystack's
payload, never from the guest's browser, and a short payment must not open the
door — otherwise the exit pass is purchasable for ₦1.
"""
import hashlib
import hmac
import json
import os
import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="module")

DB_URL = os.environ.get("DATABASE_URL", "")
SECRET = "sk_test_easyserve_webhook_fixture"


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


@pytest.fixture(autouse=True)
def _enable_paystack(monkeypatch):
    """A test key, so `is_enabled()` is true and signatures can be computed.

    Never a real one: this file has to run in CI and on anybody's machine.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", SECRET)


@pytest_asyncio.fixture(loop_scope="module")
async def client():
    import httpx
    from httpx import ASGITransport
    from app.main import app
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as c:
        yield c


def _sign(body: bytes) -> str:
    """Exactly what Paystack does: HMAC-SHA512 of the raw body, hex digest."""
    return hmac.new(SECRET.encode(), body, hashlib.sha512).hexdigest()


def _charge(reference: str, amount_kobo: int) -> tuple[bytes, dict]:
    body = json.dumps({
        "event": "charge.success",
        "data": {"reference": reference, "amount": amount_kobo, "status": "success"},
    }).encode()
    return body, {"x-paystack-signature": _sign(body), "content-type": "application/json"}


def _uniq() -> str:
    return uuid.uuid4().hex[:10]


async def _unpaid_order_with_pending_payment(client):
    """A venue, a table, an order, and a pending gateway payment against it."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.order import Order
    from app.models.payment import Payment
    from app.utils.venue_time import business_date

    r = await client.post(
        "/api/v1/auth/register",
        json={
            "venue_name": f"Paystack Test {_uniq()}",
            "full_name": "Owner",
            "email": f"owner-{_uniq()}@test.com",
            "password": "OwnerPass123!",
        },
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    venue = (await client.get("/api/v1/venues/me", headers=headers)).json()
    table = (
        await client.post(
            "/api/v1/tables", json={"label": "VIP 1"}, headers=headers
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
                "name": "Hennessy VS",
                "price": 45000,
                "item_type": "drink",
            },
            headers=headers,
        )
    ).json()

    order = (
        await client.post(
            f"/api/v1/customer/orders/{table['qr_token']}",
            json={"items": [{"menu_item_id": item["id"], "quantity": 1}]},
        )
    ).json()

    reference = f"ES-{_uniq()}"
    async with AsyncSessionLocal() as db:
        db.add(
            Payment(
                id=str(uuid.uuid4()),
                order_id=order["id"],
                venue_id=venue["id"],
                amount=order["grand_total"],
                method="card",
                provider="paystack",
                provider_ref=reference,
                status="pending",
                verification="gateway",
                business_date=business_date(),
            )
        )
        await db.commit()

    return headers, order, reference


async def test_a_signed_charge_settles_the_order(client):
    """The happy path, end to end."""
    headers, order, reference = await _unpaid_order_with_pending_payment(client)
    body, sig = _charge(reference, int(round(order["grand_total"] * 100)))

    r = await client.post("/api/v1/payments/webhook/paystack", content=body, headers=sig)
    assert r.status_code == 200

    after = (await client.get("/api/v1/orders", headers=headers)).json()
    assert after[0]["status"] == "paid"


async def test_an_unsigned_body_is_refused(client):
    """This endpoint takes instructions from the open internet. Without the
    signature check, anyone who learns a reference can mark a bill paid."""
    _, order, reference = await _unpaid_order_with_pending_payment(client)
    body, _ = _charge(reference, int(round(order["grand_total"] * 100)))

    r = await client.post(
        "/api/v1/payments/webhook/paystack",
        content=body,
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 401


async def test_a_body_signed_with_the_wrong_secret_is_refused(client):
    _, order, reference = await _unpaid_order_with_pending_payment(client)
    body, _ = _charge(reference, int(round(order["grand_total"] * 100)))
    forged = hmac.new(b"sk_test_someone_elses_key", body, hashlib.sha512).hexdigest()

    r = await client.post(
        "/api/v1/payments/webhook/paystack",
        content=body,
        headers={"x-paystack-signature": forged, "content-type": "application/json"},
    )
    assert r.status_code == 401


async def test_a_tampered_body_is_refused(client):
    """The signature covers the body, so changing the amount after signing must
    invalidate it — otherwise the amount is the attacker's to choose."""
    _, order, reference = await _unpaid_order_with_pending_payment(client)
    body, sig = _charge(reference, int(round(order["grand_total"] * 100)))
    tampered = body.replace(b'"status": "success"', b'"status": "SUCCESS"')

    r = await client.post(
        "/api/v1/payments/webhook/paystack", content=tampered, headers=sig
    )
    assert r.status_code == 401


async def test_a_short_payment_does_not_settle_the_bill(client):
    """Signed, genuine, and for ₦100 against a ₦45,000 bill. If this settled,
    the exit pass would be purchasable for the price of a sachet of water."""
    headers, order, reference = await _unpaid_order_with_pending_payment(client)
    body, sig = _charge(reference, 10_000)  # ₦100 in kobo

    r = await client.post("/api/v1/payments/webhook/paystack", content=body, headers=sig)
    assert r.status_code == 200, "the provider must still get a 200, or it retries forever"

    after = (await client.get("/api/v1/orders", headers=headers)).json()
    assert after[0]["status"] != "paid", "a short payment settled the bill"


async def test_an_unknown_reference_is_accepted_and_ignored(client):
    """Paystack retries anything that is not a 200, so a reference we do not
    recognise has to be swallowed rather than argued with."""
    body, sig = _charge(f"ES-{_uniq()}", 100_000)
    r = await client.post("/api/v1/payments/webhook/paystack", content=body, headers=sig)
    assert r.status_code == 200


async def test_a_replayed_charge_does_not_double_anything(client):
    """Paystack delivers more than once by design."""
    headers, order, reference = await _unpaid_order_with_pending_payment(client)
    body, sig = _charge(reference, int(round(order["grand_total"] * 100)))

    await client.post("/api/v1/payments/webhook/paystack", content=body, headers=sig)
    await client.post("/api/v1/payments/webhook/paystack", content=body, headers=sig)

    payments = (
        await client.get(f"/api/v1/payments/{order['id']}", headers=headers)
    ).json()
    rows = payments if isinstance(payments, list) else [payments]
    confirmed = [p for p in rows if p.get("status") == "confirmed"]
    assert len(confirmed) == 1, "the same charge settled twice"


async def test_the_guest_is_only_offered_online_payment_when_it_works(client, monkeypatch):
    """A button that answers with an error teaches the guest the system is
    broken, rather than that this venue takes cash."""
    from app.config import settings

    _, order, _ = await _unpaid_order_with_pending_payment(client)
    token = order["session_token"]

    on = await client.get(f"/api/v1/customer/pay-options/{token}")
    assert on.json()["online"] is True

    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "")
    off = await client.get(f"/api/v1/customer/pay-options/{token}")
    assert off.json()["online"] is False

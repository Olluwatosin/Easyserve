"""Paystack integration — pay-by-transfer for Nigerian venues.

Guests get a Paystack checkout (card / bank transfer / USSD). The transfer
channel shows a temporary account number, and the webhook auto-confirms the
payment — eliminating fake-credit-alert fraud at the cashier.

Provider-agnostic seam: everything Paystack-specific lives in this module, so
Monnify/Flutterwave can be added as siblings later.
"""
import hashlib
import hmac

import httpx
from fastapi import HTTPException

from app.config import settings

_BASE_URL = "https://api.paystack.co"


def is_enabled() -> bool:
    return bool(settings.PAYSTACK_SECRET_KEY)


def verify_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    """Paystack signs the raw request body with HMAC-SHA512 of the secret key."""
    if not signature or not is_enabled():
        return False
    expected = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode(), raw_body, hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def initialize_transaction(
    email: str,
    amount_kobo: int,
    reference: str,
    metadata: dict | None = None,
    callback_url: str | None = None,
) -> str:
    """Create a Paystack checkout and return its authorization URL.

    `callback_url` is where Paystack sends the guest's *browser* afterwards, and
    it is passed per transaction rather than configured once in the dashboard —
    a single dashboard URL cannot know which guest's bill to return to, so the
    guest would land on a generic page and have to find their way back to the
    table they are sitting at.

    It is not how payment is confirmed. That is the webhook, server to server
    and signed; this only decides where somebody's phone goes next.
    """
    if not is_enabled():
        raise HTTPException(status_code=503, detail="Online payment is not configured for this venue")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_BASE_URL}/transaction/initialize",
            headers={"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"},
            json={
                "email": email,
                "amount": amount_kobo,
                "reference": reference,
                "currency": "NGN",
                "channels": ["card", "bank_transfer", "ussd"],
                "metadata": metadata or {},
                **({"callback_url": callback_url} if callback_url else {}),
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Payment provider error — try again or pay at the cashier")
    body = resp.json()
    if not body.get("status"):
        raise HTTPException(status_code=502, detail="Payment provider rejected the request")
    return body["data"]["authorization_url"]

"""WhatsApp delivery via the Meta Cloud API.

WhatsApp is the default communications layer in Nigeria — far more reliable than
email for reaching a venue owner, and free to receive. For password recovery Meta
requires an **authentication** template carrying a one-time code; arbitrary links
in utility templates face stricter approval and are more likely to be blocked.
That is why phone recovery uses a 6-digit code while email uses a long link.

Provider-agnostic seam, the same shape as paystack_service: everything Meta
specific lives here so Twilio or Termii can be added as siblings.

Unconfigured, the code is logged rather than sent, so recovery works in
development and on the demo. That fallback puts a live credential in the logs
and must never run in production.
"""
import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API_BASE = "https://graph.facebook.com/v21.0"

# Nigerian numbers arrive as 0801…, 234801…, +234801… — normalise them all.
_NG_LOCAL = re.compile(r"^0(\d{10})$")
_NG_BARE = re.compile(r"^234(\d{10})$")


def is_configured() -> bool:
    return bool(settings.WHATSAPP_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


def normalise_phone(raw: str, default_country: str = "234") -> str | None:
    """Return an E.164 number, or None if it cannot be one.

    Accepts the forms Nigerians actually type: 08012345678, 2348012345678,
    +234 801 234 5678, with spaces, dashes or brackets.
    """
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw.strip())
    if digits.startswith("+"):
        rest = digits[1:]
        return f"+{rest}" if rest.isdigit() and 7 <= len(rest) <= 15 else None
    if m := _NG_LOCAL.match(digits):
        return f"+{default_country}{m.group(1)}"
    if m := _NG_BARE.match(digits):
        return f"+234{m.group(1)}"
    if digits.isdigit() and 7 <= len(digits) <= 15:
        return f"+{digits}"
    return None


async def send_reset_code(phone: str, code: str, minutes: int) -> bool:
    """Send a one-time code. True if handed to Meta, False if only logged."""
    if not is_configured():
        logger.warning(
            "WhatsApp not configured — NOT sending to %s. Reset code: %s (valid %d minutes)",
            phone, code, minutes,
        )
        return False

    payload = {
        "messaging_product": "whatsapp",
        "to": phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_RESET_TEMPLATE,
            "language": {"code": "en"},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": code}]},
                # Authentication templates carry a copy-code button whose payload
                # must repeat the code.
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": code}],
                },
            ],
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
                headers={"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"},
                json=payload,
            )
    except httpx.HTTPError:
        # Never surface provider trouble: the reset endpoint must answer
        # identically whether or not the number is registered.
        logger.exception("WhatsApp request failed")
        return False

    if resp.status_code >= 300:
        logger.error("WhatsApp rejected send: %s %s", resp.status_code, resp.text[:300])
        return False
    return True

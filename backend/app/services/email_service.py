"""Transactional email.

Deliberately thin and provider-agnostic. When RESEND_API_KEY is unset — local
development, the public demo — nothing is sent and the message is logged
instead, so password recovery still works end to end without an email account.
That fallback logs the reset link, so it must never be enabled in production.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


def is_configured() -> bool:
    return bool(settings.RESEND_API_KEY and settings.MAIL_FROM)


async def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """Returns True if handed to a provider, False if only logged."""
    if not is_configured():
        logger.warning(
            "Email not configured — NOT sending to %s. Subject: %s\n%s",
            to, subject, text,
        )
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _RESEND_URL,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.MAIL_FROM,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
            )
    except httpx.HTTPError:
        # Never surface provider trouble to the caller: the reset endpoint must
        # return the same response whether or not the address exists or the
        # provider is healthy.
        logger.exception("Email provider request failed for %s", to)
        return False

    if resp.status_code >= 300:
        logger.error("Email provider rejected send to %s: %s %s", to, resp.status_code, resp.text[:200])
        return False
    return True


def password_reset_email(full_name: str, reset_url: str, minutes: int) -> tuple[str, str, str]:
    """Returns (subject, html, text)."""
    subject = "Reset your EasyServe password"
    text = (
        f"Hi {full_name},\n\n"
        f"Use this link to set a new EasyServe password:\n\n{reset_url}\n\n"
        f"It expires in {minutes} minutes and can only be used once.\n\n"
        "If you didn't ask for this, ignore this email — your password will not change."
    )
    html = f"""\
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0E141B">
  <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
  <p style="margin:0 0 16px;line-height:1.6">Hi {full_name}, use the button below to set a new EasyServe password.</p>
  <p style="margin:0 0 24px">
    <a href="{reset_url}" style="display:inline-block;background:#00806E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Set a new password</a>
  </p>
  <p style="margin:0 0 8px;color:#5A6672;font-size:14px;line-height:1.6">
    This link expires in {minutes} minutes and can only be used once.
  </p>
  <p style="margin:0;color:#5A6672;font-size:14px;line-height:1.6">
    If you didn't ask for this, ignore this email — your password will not change.
  </p>
</div>"""
    return subject, html, text

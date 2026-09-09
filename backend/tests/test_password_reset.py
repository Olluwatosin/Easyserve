"""Password recovery is an account-takeover path if it is wrong, so the
security properties are asserted directly rather than inferred from the
happy path."""
import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from app.models.password_reset import PasswordResetToken
from app.services.password_reset_service import _hash_token


def _token(**kw) -> PasswordResetToken:
    defaults = dict(
        id="t1",
        user_id="u1",
        token_hash=_hash_token("plaintext"),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        used_at=None,
        channel="email",
        attempts=0,
    )
    defaults.update(kw)
    return PasswordResetToken(**defaults)


def test_plaintext_token_is_never_stored():
    """A database leak must not yield usable reset links."""
    stored = _hash_token("plaintext")
    assert stored != "plaintext"
    assert len(stored) == 64
    assert stored == hashlib.sha256(b"plaintext").hexdigest()


def test_hashing_is_deterministic_so_lookup_works():
    assert _hash_token("abc") == _hash_token("abc")
    assert _hash_token("abc") != _hash_token("abd")


def test_fresh_token_is_usable():
    assert _token().is_usable is True


def test_used_token_is_rejected():
    """Single use: a link cannot be replayed after a successful reset."""
    assert _token(used_at=datetime.now(timezone.utc)).is_usable is False


def test_expired_token_is_rejected():
    assert _token(
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)
    ).is_usable is False


def test_token_used_and_expired_is_rejected():
    assert _token(
        used_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    ).is_usable is False


def test_expiry_boundary_is_not_open_ended():
    """Guards against an inverted comparison letting old tokens through."""
    past = _token(expires_at=datetime.now(timezone.utc) - timedelta(days=365))
    future = _token(expires_at=datetime.now(timezone.utc) + timedelta(days=365))
    assert past.is_usable is False
    assert future.is_usable is True


async def test_short_passwords_are_refused():
    from app.services.password_reset_service import reset_password

    with pytest.raises(ValueError, match="at least 8"):
        await reset_password(None, "any-token", "short")


def test_email_service_reports_unconfigured_rather_than_pretending():
    """The fallback logs instead of sending; it must not claim success."""
    from app.services import email_service
    from app.config import settings

    original = (settings.RESEND_API_KEY, settings.MAIL_FROM)
    try:
        settings.RESEND_API_KEY = ""
        settings.MAIL_FROM = ""
        assert email_service.is_configured() is False
        settings.RESEND_API_KEY = "re_live_key"
        settings.MAIL_FROM = "EasyServe <noreply@easyserve.ng>"
        assert email_service.is_configured() is True
    finally:
        settings.RESEND_API_KEY, settings.MAIL_FROM = original


def test_reset_email_carries_the_link_and_expiry():
    from app.services.email_service import password_reset_email

    subject, html, text = password_reset_email("Amara", "https://x.ng/reset-password?token=abc", 30)
    assert "reset" in subject.lower()
    for body in (html, text):
        assert "https://x.ng/reset-password?token=abc" in body
        assert "30 minutes" in body
        assert "Amara" in body


# ── WhatsApp / phone recovery ────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("08012345678",        "+2348012345678"),   # how Nigerians actually type it
    ("0801 234 5678",      "+2348012345678"),
    ("0801-234-5678",      "+2348012345678"),
    ("2348012345678",      "+2348012345678"),
    ("+2348012345678",     "+2348012345678"),
    ("+234 801 234 5678",  "+2348012345678"),
    ("(0801) 234 5678",    "+2348012345678"),
])
def test_nigerian_numbers_all_normalise_to_one_form(raw, expected):
    """Recovery must find the account however the owner types their number."""
    from app.services.whatsapp_service import normalise_phone
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "12", "+", "0", "123456789012345678"])
def test_unparseable_numbers_are_rejected(raw):
    from app.services.whatsapp_service import normalise_phone
    assert normalise_phone(raw) is None


def test_non_nigerian_e164_is_preserved():
    from app.services.whatsapp_service import normalise_phone
    assert normalise_phone("+447700900123") == "+447700900123"


def test_code_token_is_locked_after_five_wrong_guesses():
    """A 6-digit code has a million possibilities; the attempt cap is what
    stops that being searchable."""
    t = _token(channel="whatsapp", attempts=4)
    assert t.is_usable is True
    t.attempts = 5
    assert t.is_usable is False
    t.attempts = 99
    assert t.is_usable is False


def test_unflushed_token_with_null_attempts_is_still_evaluated():
    """Column defaults apply on insert, so an in-memory token has attempts=None.
    is_usable must not raise on it."""
    t = _token()
    t.attempts = None
    assert t.is_usable is True


def test_attempt_cap_matches_the_documented_limit():
    from app.models.password_reset import PasswordResetToken
    assert PasswordResetToken.MAX_ATTEMPTS == 5


def test_forgot_password_requires_exactly_one_channel():
    from pydantic import ValidationError
    from app.schemas.auth import ForgotPasswordRequest

    assert ForgotPasswordRequest(email="a@b.ng").phone is None
    assert ForgotPasswordRequest(phone="08012345678").email is None
    for bad in ({}, {"email": "a@b.ng", "phone": "08012345678"}):
        with pytest.raises(ValidationError):
            ForgotPasswordRequest(**bad)


def test_whatsapp_reports_unconfigured_rather_than_pretending():
    from app.services import whatsapp_service
    from app.config import settings

    original = (settings.WHATSAPP_TOKEN, settings.WHATSAPP_PHONE_NUMBER_ID)
    try:
        settings.WHATSAPP_TOKEN = ""
        settings.WHATSAPP_PHONE_NUMBER_ID = ""
        assert whatsapp_service.is_configured() is False
        settings.WHATSAPP_TOKEN = "EAA..."
        settings.WHATSAPP_PHONE_NUMBER_ID = "123456"
        assert whatsapp_service.is_configured() is True
    finally:
        settings.WHATSAPP_TOKEN, settings.WHATSAPP_PHONE_NUMBER_ID = original

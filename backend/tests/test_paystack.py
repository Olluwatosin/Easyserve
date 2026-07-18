import hashlib
import hmac

import pytest

from app.config import settings
from app.services import paystack_service


def test_disabled_without_key():
    assert settings.PAYSTACK_SECRET_KEY == ""
    assert paystack_service.is_enabled() is False


def test_webhook_rejected_when_disabled():
    assert paystack_service.verify_webhook_signature(b"{}", "any") is False


def test_webhook_signature_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "sk_test_abc")
    body = b'{"event":"charge.success","data":{"reference":"es_x","amount":500000}}'
    good = hmac.new(b"sk_test_abc", body, hashlib.sha512).hexdigest()
    assert paystack_service.verify_webhook_signature(body, good) is True
    assert paystack_service.verify_webhook_signature(body, "bad" + good[3:]) is False
    assert paystack_service.verify_webhook_signature(body + b" ", good) is False


@pytest.mark.asyncio
async def test_initialize_raises_503_when_disabled():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await paystack_service.initialize_transaction("a@b.c", 1000, "ref")
    assert exc.value.status_code == 503

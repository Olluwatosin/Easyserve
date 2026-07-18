from datetime import datetime, timedelta, timezone

import pytest

from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    token_is_revoked,
)


def test_access_token_roundtrip_has_iat_and_type():
    token = create_access_token({"sub": "u1", "venue_id": "v1", "role": "owner"})
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "u1"
    assert payload["type"] == "access"
    assert "iat" in payload and "exp" in payload


def test_refresh_token_type():
    payload = decode_token(create_refresh_token({"sub": "u1"}))
    assert payload["type"] == "refresh"


def test_decode_rejects_garbage():
    assert decode_token("not-a-jwt") is None


def test_token_not_revoked_without_cutoff():
    payload = {"iat": int(datetime.now(timezone.utc).timestamp())}
    assert token_is_revoked(payload, None) is False


def test_token_revoked_when_issued_before_cutoff():
    issued = datetime.now(timezone.utc) - timedelta(hours=1)
    cutoff = datetime.now(timezone.utc)
    payload = {"iat": int(issued.timestamp())}
    assert token_is_revoked(payload, cutoff) is True


def test_token_valid_when_issued_after_cutoff():
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    payload = {"iat": int(datetime.now(timezone.utc).timestamp())}
    assert token_is_revoked(payload, cutoff) is False


def test_legacy_token_without_iat_is_revoked_when_cutoff_set():
    assert token_is_revoked({}, datetime.now(timezone.utc)) is True

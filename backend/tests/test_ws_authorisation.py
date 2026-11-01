"""Who may open which live channel.

Connections used to verify the token and the venue and nothing else, so any
signed-in staff member could open any channel at their own venue — a bartender
could watch every exit-pass scan on /ws/security, or the whole floor feed. It
stayed inside one venue, so it was disclosure rather than escalation, but every
HTTP route in this product checks roles and these did not.

The venue check is the one that would be serious if it broke, so it is tested
hardest: a token from another venue must never open a channel, whatever the role
says.
"""
import uuid

import pytest

# No database: every one of these checks token validation and the role map, and
# never reads a row. The module previously carried the async schema fixture the
# other suites use, which quietly skipped all of them — a skipped test proves
# nothing, and these guard an authorisation boundary.


def _uniq() -> str:
    return uuid.uuid4().hex[:10]


def _client():
    """Starlette's sync TestClient — the async one cannot drive websockets."""
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _token(role: str, venue_id: str) -> str:
    from app.utils.security import create_access_token
    return create_access_token(
        {"sub": str(uuid.uuid4()), "venue_id": venue_id, "role": role}
    )


def _opens(client, path: str, token: str | None) -> bool:
    """Did the channel accept the connection?"""
    from websockets.exceptions import WebSocketException
    from starlette.websockets import WebSocketDisconnect

    url = f"{path}?token={token}" if token else path
    try:
        with client.websocket_connect(url):
            return True
    except Exception:
        return False


# ── The venue boundary: the one that must never give ─────────────────────────


def test_a_token_from_another_venue_opens_nothing():
    client = _client()
    mine, theirs = str(uuid.uuid4()), str(uuid.uuid4())
    foreign = _token("owner", theirs)
    for path in (
        f"/ws/{mine}",
        f"/ws/bar/{mine}",
        f"/ws/kitchen/{mine}",
        f"/ws/security/{mine}",
    ):
        assert not _opens(client, path, foreign), (
            f"{path} accepted another venue's token"
        )


def test_no_token_opens_nothing():
    client = _client()
    venue = str(uuid.uuid4())
    for path in (f"/ws/{venue}", f"/ws/bar/{venue}", f"/ws/security/{venue}"):
        assert not _opens(client, path, None)


def test_a_refresh_token_is_not_an_access_token():
    from app.utils.security import create_refresh_token

    client = _client()
    venue = str(uuid.uuid4())
    refresh = create_refresh_token(
        {"sub": str(uuid.uuid4()), "venue_id": venue, "role": "owner"}
    )
    assert not _opens(client, f"/ws/{venue}", refresh)


def test_a_garbage_token_opens_nothing():
    client = _client()
    venue = str(uuid.uuid4())
    assert not _opens(client, f"/ws/{venue}", "not.a.jwt")


# ── Role boundaries on the station channels ──────────────────────────────────


def test_the_door_cannot_watch_the_bar_or_the_kitchen():
    client = _client()
    venue = str(uuid.uuid4())
    door = _token("security", venue)
    assert not _opens(client, f"/ws/bar/{venue}", door)
    assert not _opens(client, f"/ws/kitchen/{venue}", door)


def test_the_bar_cannot_watch_the_door():
    """The regression this exists for: exit-pass scans name the table a guest is
    leaving, and that is door business."""
    client = _client()
    venue = str(uuid.uuid4())
    bar = _token("bartender", venue)
    assert not _opens(client, f"/ws/security/{venue}", bar), (
        "a bartender's token opened the security feed"
    )


def test_each_station_opens_its_own_channel():
    client = _client()
    venue = str(uuid.uuid4())
    assert _opens(client, f"/ws/bar/{venue}", _token("bartender", venue))
    assert _opens(client, f"/ws/kitchen/{venue}", _token("kitchen", venue))
    assert _opens(client, f"/ws/security/{venue}", _token("security", venue))


def test_an_owner_opens_every_channel():
    """Owners cover stations on a short-handed night, and the dashboard reads
    more than one feed."""
    client = _client()
    venue = str(uuid.uuid4())
    owner = _token("owner", venue)
    for path in (
        f"/ws/{venue}",
        f"/ws/bar/{venue}",
        f"/ws/kitchen/{venue}",
        f"/ws/security/{venue}",
    ):
        assert _opens(client, path, owner), f"the owner was refused {path}"


# ── The shared floor feed ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "role", ["owner", "attendant", "bartender", "kitchen", "cashier", "security"]
)
def test_every_station_role_opens_the_shared_feed(role):
    """Every station screen subscribes to /ws/{venue} rather than to its own
    channel, so refusing any role here would break that screen — silently, since
    a closed socket looks like a quiet night."""
    client = _client()
    venue = str(uuid.uuid4())
    assert _opens(client, f"/ws/{venue}", _token(role, venue))


def test_the_guest_channel_needs_only_the_session_token():
    """A guest has no account. The token they were given when they scanned is
    the credential, as it is for reading their own bill."""
    client = _client()
    assert _opens(client, f"/ws/customer/{uuid.uuid4().hex}", None)


# ── Short-lived tickets, so a credential in a URL stops mattering ────────────


def _ticket(role: str, venue_id: str) -> str:
    from app.utils.security import create_ws_ticket
    return create_ws_ticket(
        {"sub": str(uuid.uuid4()), "venue_id": venue_id, "role": role}
    )


def test_a_ticket_opens_a_channel():
    """What the frontend now sends. A browser cannot put a header on a
    WebSocket handshake, so the credential goes in the URL — where proxies log
    it. A ticket expires in thirty seconds, so the logged copy is worthless."""
    client = _client()
    venue = str(uuid.uuid4())
    assert _opens(client, f"/ws/{venue}", _ticket("bartender", venue))


def test_a_ticket_obeys_the_same_venue_and_role_rules():
    client = _client()
    mine, theirs = str(uuid.uuid4()), str(uuid.uuid4())
    assert not _opens(client, f"/ws/{mine}", _ticket("owner", theirs))
    assert not _opens(client, f"/ws/security/{mine}", _ticket("bartender", mine))


def test_a_ticket_cannot_be_replayed_against_the_http_api():
    """Separate token type, so a ticket scraped from a URL cannot be turned into
    an API session."""
    from fastapi.testclient import TestClient

    from app.main import app

    venue = str(uuid.uuid4())
    r = TestClient(app).get(
        "/api/v1/venues/me",
        headers={"Authorization": f"Bearer {_ticket('owner', venue)}"},
    )
    assert r.status_code == 401


def test_an_expired_ticket_opens_nothing():
    from datetime import datetime, timedelta, timezone

    from jose import jwt

    from app.config import settings

    client = _client()
    venue = str(uuid.uuid4())
    stale = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "venue_id": venue,
            "role": "owner",
            "type": "ws_ticket",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    assert not _opens(client, f"/ws/{venue}", stale)


def test_a_ticket_is_short_lived():
    """The whole point of it. An hour-long credential in a proxy log is a
    problem; a thirty-second one is not."""
    from app.utils.security import WS_TICKET_SECONDS

    assert WS_TICKET_SECONDS <= 120

"""Headers every response should carry, and none did.

The API mostly serves JSON, so the exposure is narrower than the absence looks.
It also serves uploaded images out of /static/uploads, and a file-serving path
with no `nosniff` is the one that matters — content-sniffing is how an uploaded
image becomes a script.

These are also the first thing a client's IT reviewer runs, and this product is
about to be sold to a hotel group.
"""
import pytest


@pytest.fixture(scope="module", autouse=True)
def _release_the_engine():
    """Hand the database engine back when this module is done.

    These are synchronous tests driving the app through TestClient, and any
    request that touches the database binds the global engine's connection pool
    to TestClient's event loop. The async suites each get their own loop, so a
    module that runs afterwards finds a pool bound to a loop that has closed and
    reports "no database available" — eight tests in another file started
    skipping silently when this module was added, which is worse than failing.

    The async suites already dispose on teardown. This does the same from a
    sync fixture.
    """
    yield
    import asyncio

    from app.database import engine

    asyncio.run(engine.dispose())


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_the_basics_are_present(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "strict-origin" in r.headers["referrer-policy"]
    assert "camera=()" in r.headers["permissions-policy"]


def test_they_are_on_error_responses_too(client):
    """A 404 is still a response a browser renders."""
    r = client.get("/no-such-route")
    assert r.status_code == 404
    assert r.headers["x-content-type-options"] == "nosniff"


def test_hsts_is_not_sent_in_development(client, monkeypatch):
    """Sending HSTS from a local http server pins a developer's browser to
    https://localhost, which then refuses to load anything."""
    from app import main

    monkeypatch.setattr(main.settings, "ENVIRONMENT", "development")
    r = client.get("/health")
    assert "strict-transport-security" not in {k.lower() for k in r.headers}


def test_hsts_is_sent_once_deployed(client, monkeypatch):
    from app import main

    monkeypatch.setattr(main.settings, "ENVIRONMENT", "production")
    r = client.get("/health")
    assert "max-age=" in r.headers["strict-transport-security"]


def test_cors_still_exposes_the_download_headers(client):
    """The headers middleware must not displace what the export downloads need."""
    from starlette.middleware.cors import CORSMiddleware

    from app.main import app

    cors = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    exposed = {h.lower() for h in cors.kwargs.get("expose_headers", [])}
    assert "content-disposition" in exposed
    assert "x-row-count" in exposed

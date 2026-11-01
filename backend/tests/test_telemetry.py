"""Crash reports from somebody else's phone.

The backend had Sentry and the browser had nothing, so a JavaScript exception
mid-order was invisible: the guest saw a blank screen, closed the tab, and
nobody ever knew. For a product where every real defect so far was found by a
person using it, that was the largest missing instrument in it.

This endpoint is unauthenticated because guests crash too and have no account,
which makes it an open write. So what is tested here is mostly that it stays
boring: caps hold, the shape is fixed, nothing is stored, and a session token
cannot be smuggled into the logs through the path.
"""
import pytest


@pytest.fixture(scope="module", autouse=True)
def _release_the_engine():
    """See test_security_headers — a sync TestClient request that touches the
    database binds the global engine to this loop, and a later async module then
    finds a pool bound to a loop that has closed."""
    yield
    import asyncio

    from app.database import engine

    asyncio.run(engine.dispose())


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _post(client, **body):
    payload = {"message": "Something went wrong"}
    payload.update(body)
    return client.post("/api/v1/telemetry/client-error", json=payload)


def test_a_crash_is_accepted(client):
    r = _post(client, path="/table/abc", kind="render", stack="at x (y.js:1:1)")
    assert r.status_code == 202


def test_it_answers_even_when_sentry_is_absent(client):
    """A client that has already crashed must not be handed a second error by
    the endpoint it reports crashes to."""
    r = _post(client)
    assert r.status_code == 202
    assert r.json()["received"] is True


def test_the_query_string_is_stripped_from_the_path(client):
    """A guest's bill lives at /bill/<session_token>, and the token authorises
    the bill. Accepting a path with a query attached would copy credentials from
    the URL into our logs."""
    from app.routers.telemetry import ClientError

    parsed = ClientError(message="x", path="/bill/abc?session_token=secret#frag")
    assert parsed.path == "/bill/abc"
    assert "secret" not in parsed.path
    assert "?" not in parsed.path


def test_an_oversized_stack_is_refused_rather_than_stored(client):
    """An open write endpoint with no cap is an invitation."""
    r = _post(client, stack="x" * 50_000)
    assert r.status_code == 422


def test_an_oversized_message_is_refused(client):
    r = _post(client, message="y" * 5_000)
    assert r.status_code == 422


def test_a_report_with_no_message_is_refused(client):
    r = client.post("/api/v1/telemetry/client-error", json={"path": "/x"})
    assert r.status_code == 422


def test_unexpected_fields_cannot_be_smuggled_in(client):
    """The shape is fixed. A caller cannot decide what gets logged."""
    from app.routers.telemetry import ClientError

    parsed = ClientError.model_validate(
        {"message": "x", "evil": "DROP TABLE orders", "stack": None}
    )
    assert not hasattr(parsed, "evil")


def test_nothing_reaches_the_database(client):
    """Crash reports are logs, not records. A browser in a crash loop must not
    be able to write rows."""
    import inspect

    from app.routers import telemetry

    src = inspect.getsource(telemetry)
    assert "get_db" not in src
    assert "db.add" not in src
    assert "AsyncSession" not in src

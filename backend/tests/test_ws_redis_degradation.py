"""Running without Redis is a supported configuration, not an incident.

A single instance delivers every broadcast correctly on its own — the pub/sub
channel exists so that two instances can see each other's events. So a
deployment with no Redis is fine, and the code says so by carrying on.

What was not fine was saying so every thirty seconds. The retry backoff capped at
30s and logged a warning on each attempt, which is roughly 2,880 identical
warnings a day on a deployment that has no Redis and is not meant to. Logs like
that are worse than silence: they train you to skim past the one line that
mattered, and they were doing it on the live API while the domain was being set
up.

The condition is now stated once when it starts, again whenever a working
connection drops — that means something changed — and then twice an hour.

No Redis server is involved in these tests. The point is the reporting, so the
connection is made to fail on purpose and the log output is what gets asserted.
"""
import asyncio
import json
import logging

import pytest


@pytest.fixture
def manager(monkeypatch):
    """A manager whose Redis connection always fails."""
    from app.services import ws_manager as mod

    def refuse(*_a, **_kw):
        raise ConnectionError("no redis here")

    monkeypatch.setattr(mod.aioredis, "from_url", refuse)
    return mod.ConnectionManager()


async def _run_briefly(coro_fn, seconds: float = 0.5):
    task = asyncio.create_task(coro_fn())
    await asyncio.sleep(seconds)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_it_says_redis_is_missing_once_not_on_every_attempt(manager, caplog):
    """The regression that was live: one warning per retry, for ever."""
    caplog.set_level(logging.DEBUG, logger="app.services.ws_manager")

    # Retry immediately so many attempts happen inside the window, which is the
    # condition that used to produce a warning each time.
    manager._INITIAL_RETRY_DELAY = 0.01
    manager._MAX_RETRY_DELAY = 0.01
    await _run_briefly(lambda: manager._listen_forever("redis://nope:6379"))

    records = [r for r in caplog.records if r.name == "app.services.ws_manager"]
    warnings = [r for r in records if r.levelno == logging.WARNING]
    attempts = [r for r in records if "still unavailable" in r.getMessage()]

    assert len(warnings) == 1, (
        f"{len(warnings)} warnings for one continuous outage — this is the log "
        "flood that buries everything else"
    )
    assert attempts, "later attempts are not being recorded at all, even at debug"
    assert len(attempts) > 1, "the retry loop does not appear to be retrying"


@pytest.mark.asyncio
async def test_the_warning_explains_what_still_works(manager, caplog):
    """Somebody reading this at 1AM needs to know whether to act. "Redis
    unavailable" alone does not say whether orders are reaching the bar."""
    caplog.set_level(logging.WARNING, logger="app.services.ws_manager")
    manager._INITIAL_RETRY_DELAY = 0.01
    manager._MAX_RETRY_DELAY = 0.01
    await _run_briefly(lambda: manager._listen_forever("redis://nope:6379"))

    msg = next(
        r.getMessage() for r in caplog.records if r.levelno == logging.WARNING
    )
    assert "single-instance" in msg
    assert "this instance" in msg, (
        "the warning does not say that delivery on this instance is unaffected, "
        "which is the only thing the reader actually needs to decide"
    )


@pytest.mark.asyncio
async def test_a_dropped_connection_is_always_reported(manager, caplog):
    """Suppressing repeats must not suppress a change of state. Redis going away
    after it had been working means something happened, and that is worth a line
    every time regardless of how recently one was written."""
    caplog.set_level(logging.WARNING, logger="app.services.ws_manager")

    # Stand in for "was connected a moment ago".
    manager._redis = object()
    manager._INITIAL_RETRY_DELAY = 0.01
    manager._MAX_RETRY_DELAY = 0.01
    await _run_briefly(lambda: manager._listen_forever("redis://nope:6379"), 0.2)

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings, "a working Redis connection dropped and nothing was logged"


@pytest.mark.asyncio
async def test_the_retry_delay_backs_off_rather_than_hammering(manager):
    """Half a minute forever was the old ceiling. Redis being absent is a
    supported state, so there is nothing to hurry towards."""
    from app.services.ws_manager import ConnectionManager

    assert ConnectionManager._MAX_RETRY_DELAY >= 60.0, (
        "the retry ceiling is still low enough to keep the log busy"
    )
    assert ConnectionManager._REWARN_AFTER >= 600.0


@pytest.mark.asyncio
async def test_broadcasts_are_still_delivered_with_no_redis(manager):
    """The thing all of the above is in service of: no Redis must not mean no
    WebSocket. This is what makes the warning informational rather than an
    error."""
    seen = []

    class FakeSocket:
        async def send_text(self, payload):
            seen.append(json.loads(payload))

    ws = FakeSocket()
    manager._staff["venue-1"].add(ws)
    await manager.broadcast_staff("venue-1", "new_order", {"table": "3"})

    assert seen, "with no Redis, a broadcast reached nobody on this instance"
    assert seen[0]["event"] == "new_order"
    assert seen[0]["data"]["table"] == "3"

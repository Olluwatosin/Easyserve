import asyncio
import json
import logging
import time
from collections import defaultdict
from typing import Dict, Set

import redis.asyncio as aioredis
from fastapi import WebSocket

logger = logging.getLogger(__name__)

_CHANNEL = "easyserve:ws"


class ConnectionManager:
    def __init__(self):
        self._staff: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._bar: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._kitchen: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._security: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._customer: Dict[str, WebSocket] = {}
        self._redis: aioredis.Redis | None = None
        self._listener_task: asyncio.Task | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def startup(self, redis_url: str) -> None:
        # The listener owns the connection and keeps retrying forever, so a
        # Redis restart mid-service self-heals instead of degrading until the
        # next backend deploy.
        self._listener_task = asyncio.create_task(self._listen_forever(redis_url))

    async def shutdown(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()

    #: How long to wait between reconnection attempts, at most. Redis being
    #: absent is a supported configuration — a single instance broadcasts
    #: correctly without it — so there is no hurry, and retrying every half
    #: minute forever costs more in log noise than it buys in recovery speed.
    _MAX_RETRY_DELAY = 300.0

    #: Where the backoff starts. A named attribute rather than a literal so the
    #: retry behaviour can be exercised without a test sleeping through it.
    _INITIAL_RETRY_DELAY = 1.0

    #: How often to repeat the warning while Redis stays unreachable. Often
    #: enough that a genuine outage is visible in a log people skim, rare enough
    #: that it does not bury everything else in it.
    _REWARN_AFTER = 1800.0

    async def _listen_forever(self, redis_url: str) -> None:
        """Keep a pub/sub subscription up, and say so exactly as often as helps.

        This used to log a warning every thirty seconds for as long as Redis was
        absent — around 2,880 a day on a deployment that has no Redis and is not
        meant to. Logs like that train you to ignore them, which costs you the
        one line that mattered. The condition is now stated once when it starts,
        again if a working connection drops, and then twice an hour.
        """
        delay = self._INITIAL_RETRY_DELAY
        failures = 0
        last_warned = 0.0
        while True:
            try:
                redis = aioredis.from_url(redis_url, decode_responses=True)
                await redis.ping()
                pubsub = redis.pubsub()
                await pubsub.subscribe(_CHANNEL)
                self._redis = redis
                if failures:
                    logger.info(
                        "Redis reachable again after %d attempt(s) — "
                        "cross-instance WebSocket delivery restored",
                        failures,
                    )
                failures = 0
                delay = self._INITIAL_RETRY_DELAY
                logger.info("WebSocket Redis pub/sub connected on %s", redis_url)
                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        await self._dispatch(json.loads(message["data"]))
                    except Exception:
                        logger.exception("Error dispatching WebSocket message")
            except asyncio.CancelledError:
                raise
            except Exception:
                # A connection that *was* up and has dropped is worth saying out
                # loud every time, because it means something changed.
                was_connected = self._redis is not None
                self._redis = None
                failures += 1
                now = time.monotonic()
                if failures == 1 or was_connected or now - last_warned >= self._REWARN_AFTER:
                    logger.warning(
                        "Redis unavailable — running in single-instance WebSocket "
                        "mode (attempt %d). Broadcasts are still delivered to "
                        "everyone connected to this instance; a second instance "
                        "would not see them. Retrying in %.0fs.",
                        failures,
                        delay,
                    )
                    last_warned = now
                else:
                    logger.debug(
                        "Redis still unavailable (attempt %d); retrying in %.0fs",
                        failures,
                        delay,
                    )
                await asyncio.sleep(delay)
                delay = min(delay * 2, self._MAX_RETRY_DELAY)

    # ── Connect / Disconnect ─────────────────────────────────────────────────

    async def connect_staff(self, venue_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._staff[venue_id].add(ws)

    async def connect_bar(self, venue_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._bar[venue_id].add(ws)

    async def connect_kitchen(self, venue_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._kitchen[venue_id].add(ws)

    async def connect_security(self, venue_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._security[venue_id].add(ws)

    async def connect_customer(self, session_token: str, ws: WebSocket) -> None:
        await ws.accept()
        self._customer[session_token] = ws

    def disconnect_staff(self, venue_id: str, ws: WebSocket) -> None:
        self._staff[venue_id].discard(ws)

    def disconnect_bar(self, venue_id: str, ws: WebSocket) -> None:
        self._bar[venue_id].discard(ws)

    def disconnect_kitchen(self, venue_id: str, ws: WebSocket) -> None:
        self._kitchen[venue_id].discard(ws)

    def disconnect_security(self, venue_id: str, ws: WebSocket) -> None:
        self._security[venue_id].discard(ws)

    def disconnect_customer(self, session_token: str) -> None:
        self._customer.pop(session_token, None)

    # ── Broadcast helpers ────────────────────────────────────────────────────

    async def broadcast_staff(self, venue_id: str, event: str, data: dict) -> None:
        await self._publish("staff", venue_id=venue_id, event=event, data=data)

    async def broadcast_bar(self, venue_id: str, event: str, data: dict) -> None:
        await self._publish("bar", venue_id=venue_id, event=event, data=data)

    async def broadcast_kitchen(self, venue_id: str, event: str, data: dict) -> None:
        await self._publish("kitchen", venue_id=venue_id, event=event, data=data)

    async def broadcast_security(self, venue_id: str, event: str, data: dict) -> None:
        await self._publish("security", venue_id=venue_id, event=event, data=data)

    async def send_to_customer(self, session_token: str, event: str, data: dict) -> None:
        await self._publish("customer", session_token=session_token, event=event, data=data)

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _publish(
        self,
        channel: str,
        event: str,
        data: dict,
        venue_id: str | None = None,
        session_token: str | None = None,
    ) -> None:
        envelope = json.dumps({
            "channel": channel,
            "venue_id": venue_id,
            "session_token": session_token,
            "event": event,
            "data": data,
        })
        if self._redis:
            try:
                await self._redis.publish(_CHANNEL, envelope)
                return
            except Exception:
                # Redis died between health checks — deliver locally rather
                # than failing the caller (e.g. an order placement).
                logger.warning("Redis publish failed — dispatching locally")
                self._redis = None
        await self._dispatch(json.loads(envelope))

    async def _dispatch(self, env: dict) -> None:
        ch = env["channel"]
        event = env["event"]
        data = env["data"]
        venue_id = env.get("venue_id")
        session_token = env.get("session_token")
        payload = json.dumps({"event": event, "data": data})

        if ch == "staff" and venue_id:
            await self._send_to_set(self._staff[venue_id], payload)
        elif ch == "bar" and venue_id:
            await self._send_to_set(self._bar[venue_id], payload)
        elif ch == "kitchen" and venue_id:
            await self._send_to_set(self._kitchen[venue_id], payload)
        elif ch == "security" and venue_id:
            await self._send_to_set(self._security[venue_id], payload)
        elif ch == "customer" and session_token:
            ws = self._customer.get(session_token)
            if ws:
                try:
                    await ws.send_text(payload)
                except Exception:
                    self._customer.pop(session_token, None)

    async def _send_to_set(self, connections: Set[WebSocket], payload: str) -> None:
        dead = set()
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        connections -= dead


manager = ConnectionManager()

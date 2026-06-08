import asyncio
import json
import logging
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
        try:
            self._redis = aioredis.from_url(redis_url, decode_responses=True)
            await self._redis.ping()
            pubsub = self._redis.pubsub()
            await pubsub.subscribe(_CHANNEL)
            self._listener_task = asyncio.create_task(self._listen(pubsub))
            logger.info("WebSocket Redis pub/sub connected on %s", redis_url)
        except Exception:
            logger.warning("Redis unavailable — WebSocket falls back to single-instance mode")
            self._redis = None

    async def shutdown(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()

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
            await self._redis.publish(_CHANNEL, envelope)
        else:
            await self._dispatch(json.loads(envelope))

    async def _listen(self, pubsub: aioredis.client.PubSub) -> None:
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    await self._dispatch(json.loads(message["data"]))
                except Exception:
                    logger.exception("Error dispatching WebSocket message")
        except asyncio.CancelledError:
            pass

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

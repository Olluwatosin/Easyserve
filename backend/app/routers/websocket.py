"""Live channels, one per station.

Each channel carries what one station needs to see, which is why they are
separate: the bar does not want the security feed and the door does not want
drink tickets.

Two things are checked before a connection is accepted — the venue in the token
must match the venue in the URL, and the role must belong on the channel being
opened. The role check is new. Connections used to verify only the venue, so any
signed-in staff member could open any channel at their own venue: a bartender
could watch every exit-pass scan on /ws/security, or the whole staff feed on
/ws/{venue}. Contained within one venue, so it was disclosure rather than
escalation, but every HTTP route in the product is careful about roles and these
were not.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.services.ws_manager import manager
from app.utils.security import decode_token

router = APIRouter(tags=["websocket"])

#: Who belongs on each channel. An owner is on all of them — they stand in for
#: any station on a short-handed night, and the dashboard reads several at once.
#:
#: `staff` is deliberately wide. It is the shared floor feed and, in practice,
#: the only channel any screen opens: the attendant, bar, kitchen and cashier
#: pages all subscribe to /ws/{venue} rather than to their own station channel.
#: The door is included because it is the same shared feed — it carries
#: `exit_pass_used`, which is the event the security screen will want when it
#: gets live updates, and excluding a role from the one channel everything uses
#: would fail silently later.
#:
#: The per-station channels below are narrow, which is where the boundary
#: actually earns its keep. Nothing subscribes to them today — the backend
#: broadcasts to them and no client listens — so they are kept correct for when
#: a station screen moves onto its own feed.
_CHANNEL_ROLES: dict[str, frozenset[str]] = {
    "staff": frozenset(
        {"owner", "attendant", "bartender", "kitchen", "cashier", "security"}
    ),
    "bar": frozenset({"owner", "bartender", "attendant"}),
    "kitchen": frozenset({"owner", "kitchen", "attendant"}),
    # Exit passes name the table a guest is leaving, so this one is door-only.
    "security": frozenset({"owner", "security"}),
}


async def _authorise(
    websocket: WebSocket, token: str | None, venue_id: str, channel: str
) -> bool:
    """Accept only a live access token, for this venue, from a role that belongs.

    Closes with a distinct code per reason so a client can tell "sign in again"
    from "you are not meant to be here" — they need different handling, and a
    single code would make the second look like a session problem.
    """
    if not token:
        await websocket.close(code=4001)  # no credentials
        return False

    payload = decode_token(token)
    # A ticket from POST /auth/ws-ticket is preferred: it lives thirty seconds,
    # so the copy that proxies write into their logs is worthless by the time
    # anybody could read it. A full access token is still accepted so a client
    # mid-deploy keeps working, and so a venue running an older build is not cut
    # off — it can be refused once nothing sends one.
    if not payload or payload.get("type") not in ("ws_ticket", "access"):
        await websocket.close(code=4003)  # bad or expired credential
        return False

    if payload.get("venue_id") != venue_id:
        await websocket.close(code=4004)  # another venue's token
        return False

    allowed = _CHANNEL_ROLES.get(channel, frozenset())
    if payload.get("role") not in allowed:
        await websocket.close(code=4005)  # wrong station for this role
        return False

    return True


@router.websocket("/ws/{venue_id}")
async def staff_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    if not await _authorise(websocket, token, venue_id, "staff"):
        return
    await manager.connect_staff(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_staff(venue_id, websocket)


@router.websocket("/ws/bar/{venue_id}")
async def bar_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    if not await _authorise(websocket, token, venue_id, "bar"):
        return
    await manager.connect_bar(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_bar(venue_id, websocket)


@router.websocket("/ws/kitchen/{venue_id}")
async def kitchen_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    if not await _authorise(websocket, token, venue_id, "kitchen"):
        return
    await manager.connect_kitchen(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_kitchen(venue_id, websocket)


@router.websocket("/ws/security/{venue_id}")
async def security_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    if not await _authorise(websocket, token, venue_id, "security"):
        return
    await manager.connect_security(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_security(venue_id, websocket)


@router.websocket("/ws/customer/{session_token}")
async def customer_ws(session_token: str, websocket: WebSocket):
    """The guest's own channel, authorised by holding the session token.

    No account is involved — a guest scans a code and orders. The token is the
    credential, the same way it is for reading their own bill, and it only ever
    carries replies about their own table.
    """
    await manager.connect_customer(session_token, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_customer(session_token)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.services.ws_manager import manager
from app.utils.security import decode_token

router = APIRouter(tags=["websocket"])


async def _authenticate_ws(websocket: WebSocket, token: str | None) -> str | None:
    if not token:
        await websocket.close(code=4001)
        return None
    try:
        payload = decode_token(token)
        return payload.get("venue_id")
    except JWTError:
        await websocket.close(code=4003)
        return None


@router.websocket("/ws/{venue_id}")
async def staff_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    authenticated_venue = await _authenticate_ws(websocket, token)
    if not authenticated_venue or authenticated_venue != venue_id:
        return
    await manager.connect_staff(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_staff(venue_id, websocket)


@router.websocket("/ws/bar/{venue_id}")
async def bar_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    authenticated_venue = await _authenticate_ws(websocket, token)
    if not authenticated_venue or authenticated_venue != venue_id:
        return
    await manager.connect_bar(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_bar(venue_id, websocket)


@router.websocket("/ws/kitchen/{venue_id}")
async def kitchen_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    authenticated_venue = await _authenticate_ws(websocket, token)
    if not authenticated_venue or authenticated_venue != venue_id:
        return
    await manager.connect_kitchen(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_kitchen(venue_id, websocket)


@router.websocket("/ws/security/{venue_id}")
async def security_ws(venue_id: str, websocket: WebSocket, token: str = Query(None)):
    authenticated_venue = await _authenticate_ws(websocket, token)
    if not authenticated_venue or authenticated_venue != venue_id:
        return
    await manager.connect_security(venue_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_security(venue_id, websocket)


@router.websocket("/ws/customer/{session_token}")
async def customer_ws(session_token: str, websocket: WebSocket):
    await manager.connect_customer(session_token, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_customer(session_token)

from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.exit_pass import ExitPass
from app.models.order import Order
from app.schemas.exit_pass import ScanResult
from app.services.ws_manager import manager


async def get_exit_pass(db: AsyncSession, order_id: str, venue_id: str) -> ExitPass:
    result = await db.execute(
        select(ExitPass).where(ExitPass.order_id == order_id, ExitPass.venue_id == venue_id)
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Exit pass not found")
    return ep


async def scan_exit_pass(db: AsyncSession, token: str, scanned_by: str, venue_id: str) -> ScanResult:
    result = await db.execute(
        select(ExitPass)
        .where(ExitPass.token == token, ExitPass.venue_id == venue_id)
        .options(selectinload(ExitPass.order))
    )
    ep = result.scalar_one_or_none()
    if not ep:
        return ScanResult(status="invalid", order_id="", message="QR code not recognised")

    status = ep.status
    table_number = None
    if ep.order and ep.order.table_id:
        res = await db.execute(
            select(Order).where(Order.id == ep.order_id).options(selectinload(Order.table))
        )
        order = res.scalar_one_or_none()
        if order and order.table:
            table_number = order.table.label

    if status == "valid":
        ep.used_at = datetime.now(timezone.utc)
        ep.scanned_by = scanned_by
        await db.commit()
        await manager.broadcast_security(
            venue_id,
            "pass_scan_result",
            {"token": token, "status": "used", "order_id": ep.order_id, "table_number": table_number},
        )
        await manager.broadcast_staff(
            venue_id,
            "exit_pass_used",
            {"order_id": ep.order_id, "table_number": table_number, "scanned_at": ep.used_at.isoformat()},
        )
        return ScanResult(
            status="valid",
            order_id=ep.order_id,
            table_number=table_number,
            message="Valid — customer may exit",
        )
    elif status == "used":
        return ScanResult(
            status="used",
            order_id=ep.order_id,
            table_number=table_number,
            message=f"Already scanned at {ep.used_at.strftime('%H:%M')}",
        )
    else:
        return ScanResult(
            status="expired",
            order_id=ep.order_id,
            table_number=table_number,
            message="Pass has expired — return to cashier",
        )

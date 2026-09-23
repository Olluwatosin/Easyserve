from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

import secrets

from sqlalchemy import or_

from app.models.exit_pass import ExitPass
from app.models.order import Order
from app.schemas.exit_pass import ScanResult
from app.services.ws_manager import manager


#: No I, O, 0 or 1: this is read off one phone in the dark and typed into
#: another, and those four are where the mistakes are.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


async def generate_short_code(db: AsyncSession, venue_id: str, length: int = 6) -> str:
    """A code the door can type, unique among this venue's live passes.

    Only checked against passes that are still usable. A code from a pass that
    expired an hour ago can be handed out again without ambiguity — there is
    nothing left for it to collide with.
    """
    for _ in range(12):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))
        clash = await db.execute(
            select(ExitPass).where(
                ExitPass.venue_id == venue_id,
                ExitPass.short_code == code,
                ExitPass.used_at.is_(None),
                ExitPass.expires_at > datetime.now(timezone.utc),
            )
        )
        if clash.scalar_one_or_none() is None:
            return code
    # Twelve collisions against live passes only is not bad luck, it is a venue
    # with an implausible number of unspent passes. Lengthening beats looping.
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length + 2))


async def get_exit_pass(db: AsyncSession, order_id: str, venue_id: str) -> ExitPass:
    result = await db.execute(
        select(ExitPass).where(ExitPass.order_id == order_id, ExitPass.venue_id == venue_id)
    )
    ep = result.scalar_one_or_none()
    if not ep:
        raise HTTPException(status_code=404, detail="Exit pass not found")
    return ep


async def scan_exit_pass(db: AsyncSession, token: str, scanned_by: str, venue_id: str) -> ScanResult:
    # Scanned or typed — the door should not have to care which. A short code is
    # matched case-insensitively because it is typed by a person.
    entered = (token or "").strip()
    result = await db.execute(
        select(ExitPass)
        .where(
            ExitPass.venue_id == venue_id,
            or_(
                ExitPass.token == entered,
                ExitPass.short_code == entered.upper(),
            ),
        )
        .options(selectinload(ExitPass.order))
    )
    ep = result.scalars().first()
    if not ep:
        return ScanResult(
            status="invalid", order_id="", message="Not recognised — check the code or scan again"
        )

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

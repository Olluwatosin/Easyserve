import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.alert import Alert
from app.models.table import Table
from app.models.order import Order
from app.services.ws_manager import manager


async def create_alert(db: AsyncSession, qr_token: str, alert_type: str) -> Alert:
    result = await db.execute(select(Table).where(Table.qr_token == qr_token))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # Get most recent open order for this table
    res = await db.execute(
        select(Order)
        .where(Order.table_id == table.id, Order.status == "open")
        .order_by(Order.created_at.desc())
    )
    order = res.scalars().first()

    alert = Alert(
        id=str(uuid.uuid4()),
        venue_id=table.venue_id,
        table_id=table.id,
        order_id=order.id if order else None,
        type=alert_type,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    await manager.broadcast_staff(
        table.venue_id,
        "new_alert",
        {
            "alert_id": alert.id,
            "type": alert_type,
            "table_label": table.label,
            "zone": table.zone,
        },
    )
    return alert


async def acknowledge_alert(db: AsyncSession, alert_id: str, user_id: str, venue_id: str) -> Alert:
    result = await db.execute(select(Alert).where(Alert.id == alert_id, Alert.venue_id == venue_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "acknowledged"
    alert.acknowledged_by = user_id
    await db.commit()
    await db.refresh(alert)
    return alert


async def resolve_alert(db: AsyncSession, alert_id: str, venue_id: str) -> Alert:
    result = await db.execute(select(Alert).where(Alert.id == alert_id, Alert.venue_id == venue_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)

    await manager.broadcast_staff(alert.venue_id, "alert_resolved", {"alert_id": alert_id})
    return alert

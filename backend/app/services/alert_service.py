"""Guest alerts: raising them, routing them, and making sure they land.

A guest tapping "call staff" is the moment the product either works or doesn't.
The rules here follow from one observation: an alert broadcast to every attendant
is an alert nobody owns.

  * It goes first to the attendant assigned to that table.
  * If they have not acknowledged within ESCALATE_TO_FLOOR_SECONDS it opens to
    the whole floor — one person's job, but never nobody's.
  * Still unanswered after ESCALATE_TO_OWNER_SECONDS, it reaches the owner. An
    unanswered table is a management problem by then, not a routing one.
  * Acknowledging tells every other screen, so two attendants do not walk to the
    same table while a third waits.
  * The guest is told who is coming, because "notified" followed by silence is
    what makes people give up and shout.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alert import Alert
from app.models.order import Order
from app.models.table import Table
from app.models.user import User
from app.services.ws_manager import manager

logger = logging.getLogger(__name__)

#: How long the assigned attendant gets before the floor is told.
ESCALATE_TO_FLOOR_SECONDS = 45
#: How long before the owner is told.
ESCALATE_TO_OWNER_SECONDS = 120
#: How often the sweeper looks. Well under the shorter window so escalation is
#: never noticeably late.
SWEEP_INTERVAL_SECONDS = 10

#: What the guest is shown for each kind of alert.
ALERT_LABELS = {
    "call_attendant": "Someone is on the way",
    "order_more": "Someone is coming to take your order",
    "request_payment": "Your bill is being brought over",
    "need_help": "Someone is on the way",
    "urgent": "Someone is coming right now",
}


async def _session_token_for(db: AsyncSession, alert: Alert) -> str | None:
    """The guest channel to answer on.

    Prefer what the guest told us; fall back to the order they have open. Either
    way, someone who called before ordering still hears back.
    """
    if alert.session_token:
        return alert.session_token
    if not alert.order_id:
        return None
    result = await db.execute(select(Order.session_token).where(Order.id == alert.order_id))
    return result.scalar_one_or_none()


async def create_alert(
    db: AsyncSession,
    qr_token: str,
    alert_type: str,
    session_token: str | None = None,
) -> Alert:
    result = await db.execute(select(Table).where(Table.qr_token == qr_token))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

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
        session_token=session_token or (order.session_token if order else None),
        assigned_to=table.assigned_attendant_id,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    assignee_name = None
    if alert.assigned_to:
        r = await db.execute(select(User.full_name).where(User.id == alert.assigned_to))
        assignee_name = r.scalar_one_or_none()

    # A table with nobody assigned has no one to wait on, so it opens to the
    # floor immediately rather than sitting silent for 45 seconds.
    if alert.assigned_to is None:
        alert.escalation_level = 1
        await db.commit()

    await manager.broadcast_staff(
        table.venue_id,
        "new_alert",
        {
            "alert_id": alert.id,
            "type": alert_type,
            "table_label": table.label,
            "zone": table.zone,
            "assigned_to": alert.assigned_to,
            "assigned_to_name": assignee_name,
            "escalation_level": alert.escalation_level,
            "created_at": alert.created_at.isoformat(),
        },
    )
    return alert


async def acknowledge_alert(db: AsyncSession, alert_id: str, user_id: str, venue_id: str) -> Alert:
    result = await db.execute(
        select(Alert)
        .where(Alert.id == alert_id, Alert.venue_id == venue_id)
        .options(selectinload(Alert.table))
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.status == "pending":
        alert.status = "acknowledged"
        alert.acknowledged_by = user_id
        await db.commit()
        await db.refresh(alert)

    r = await db.execute(select(User.full_name).where(User.id == user_id))
    responder = r.scalar_one_or_none() or "A staff member"

    # Clear it from every other screen, so nobody else walks over.
    await manager.broadcast_staff(
        alert.venue_id,
        "alert_acknowledged",
        {
            "alert_id": alert.id,
            "acknowledged_by": user_id,
            "acknowledged_by_name": responder,
            "table_label": alert.table.label if alert.table else None,
        },
    )

    # Tell the guest a person is actually coming.
    session_token = await _session_token_for(db, alert)
    if session_token:
        await manager.send_to_customer(
            session_token,
            "alert_acknowledged",
            {
                "alert_id": alert.id,
                "responder": responder,
                "message": f"{responder} — {ALERT_LABELS.get(alert.type, 'Someone is on the way')}",
            },
        )
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


# ── Escalation ───────────────────────────────────────────────────────────────


async def escalate_stale_alerts(db: AsyncSession) -> int:
    """Raise anything still pending past its window. Returns how many moved.

    Driven by a sweep over the database rather than a timer per alert, so
    escalation survives a restart and a redeploy mid-service — the case where
    a missed alert would matter most.
    """
    now = datetime.now(timezone.utc)
    floor_cutoff = now - timedelta(seconds=ESCALATE_TO_FLOOR_SECONDS)
    owner_cutoff = now - timedelta(seconds=ESCALATE_TO_OWNER_SECONDS)

    result = await db.execute(
        select(Alert)
        .where(Alert.status == "pending", Alert.created_at <= floor_cutoff)
        .options(selectinload(Alert.table))
    )
    moved = 0
    for alert in result.scalars().all():
        target = 2 if alert.created_at <= owner_cutoff else 1
        if alert.escalation_level >= target:
            continue

        alert.escalation_level = target
        moved += 1
        waited = int((now - alert.created_at).total_seconds())
        await manager.broadcast_staff(
            alert.venue_id,
            "alert_escalated",
            {
                "alert_id": alert.id,
                "type": alert.type,
                "table_label": alert.table.label if alert.table else None,
                "zone": alert.table.zone if alert.table else None,
                "escalation_level": target,
                "waiting_seconds": waited,
            },
        )
        logger.warning(
            "Alert %s at table %s unanswered for %ds — escalated to level %d",
            alert.id, alert.table.label if alert.table else "?", waited, target,
        )

    if moved:
        await db.commit()
    return moved


async def escalation_sweeper() -> None:
    """Background loop. Never lets an exception end it — a crashed sweeper would
    silently stop every escalation in the venue."""
    from app.database import AsyncSessionLocal

    while True:
        try:
            await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
            async with AsyncSessionLocal() as db:
                await escalate_stale_alerts(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Alert escalation sweep failed; continuing")

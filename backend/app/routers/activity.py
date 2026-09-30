"""Who has used the system, and what they did.

The audit trail has been written to since the beginning and never read. That was
fine while the only reader was a future investigation, and stopped being fine
during the pilot: logins were handed to testers and there was no way to answer
"has anyone actually opened it yet" — the one question you want answered the
evening you send the link.

Two views, because they answer different questions.

`/activity/people` is the pilot view: one row per person, when they first arrived,
when they were last seen, and how much they have done. It is what tells you
whether a tester ever got in, or got in and stopped.

`/activity` is the trail itself, newest first — what was actually done, including
the things worth being able to ask about later: voided items, price changes,
payments confirmed.

Owner only. This is a record of what staff did, and it is the owner's to read.
"""
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.audit_log import AuditLog
from app.models.user import User
from app.utils.venue_time import LAGOS

router = APIRouter(prefix="/activity", tags=["activity"])

#: Plain words for the actions the trail records. The raw keys are fine in a
#: database and unreadable in a list somebody is skimming at 2am.
ACTION_WORDS = {
    "signed_in": "Signed in",
    "item_voided": "Voided an item",
    "price_changed": "Changed a price",
    "payment_recorded": "Recorded a payment",
    "payment_confirmed": "Confirmed a payment",
    "payment_underpaid": "Accepted an underpayment",
    "order_taken_at_table": "Took an order at the table",
    "staff_password_reset": "Reset a staff password",
    "password_reset_requested": "Asked to reset a password",
    "password_reset_completed": "Completed a password reset",
    "shift_corrected": "Corrected a shift",
    "clock_in_code_rotated": "Changed the clock-in code",
}


def _local(at: datetime | None) -> str | None:
    if at is None:
        return None
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(LAGOS).isoformat()


@router.get("/people")
async def who_has_used_it(
    days: int = Query(14, ge=1, le=120),
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """One row per account: whether they ever arrived, and what they have done.

    Every account is listed, including those that have never signed in — the
    absence is the answer being looked for, and an account missing from the list
    would read as "no data yet" rather than "this person never opened it".
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    staff = (
        await db.execute(
            select(User).where(User.venue_id == current_user.venue_id)
        )
    ).scalars().all()

    # Sign-ins and everything-else counted separately: signing in is arriving,
    # the rest is using it, and a tester who did the first but not the second is
    # the case worth seeing.
    rows = (
        await db.execute(
            select(
                AuditLog.actor_id,
                func.count().label("total"),
                func.sum(
                    case((AuditLog.action == "signed_in", 1), else_=0)
                ).label("sign_ins"),
                func.min(AuditLog.created_at).label("first_at"),
                func.max(AuditLog.created_at).label("last_at"),
            )
            .where(
                AuditLog.venue_id == current_user.venue_id,
                AuditLog.created_at >= since,
            )
            .group_by(AuditLog.actor_id)
        )
    ).all()
    by_actor = {r.actor_id: r for r in rows}

    people = []
    for u in staff:
        r = by_actor.get(u.id)
        sign_ins = int(r.sign_ins or 0) if r else 0
        total = int(r.total or 0) if r else 0
        people.append({
            "user_id": u.id,
            "name": u.full_name,
            "role": u.role,
            "email": u.email,
            "is_active": u.is_active,
            "sign_ins": sign_ins,
            # Actions other than arriving — whether they did anything once in.
            "actions": max(total - sign_ins, 0),
            "first_seen": _local(r.first_at) if r else None,
            "last_seen": _local(r.last_at) if r else None,
            "has_signed_in": sign_ins > 0,
        })

    # Never signed in first: that is the row you are looking for.
    people.sort(key=lambda p: (p["has_signed_in"], p["last_seen"] or ""))

    return {
        "days": days,
        "people": people,
        "signed_in_count": sum(1 for p in people if p["has_signed_in"]),
        "total_accounts": len(people),
    }


@router.get("")
async def recent_activity(
    limit: int = Query(100, ge=1, le=500),
    days: int = Query(14, ge=1, le=120),
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """The trail itself, newest first."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        await db.execute(
            select(AuditLog, User.full_name, User.role)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(
                AuditLog.venue_id == current_user.venue_id,
                AuditLog.created_at >= since,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()

    out = []
    for log, name, role in rows:
        details = None
        if log.details:
            try:
                details = json.loads(log.details)
            except ValueError:
                details = None
        out.append({
            "id": log.id,
            "at": _local(log.created_at),
            "who": name or "Someone no longer on the team",
            "role": role,
            "action": log.action,
            "what": ACTION_WORDS.get(log.action, log.action.replace("_", " ").capitalize()),
            "entity_type": log.entity_type,
            "details": details,
        })
    return {"days": days, "entries": out}

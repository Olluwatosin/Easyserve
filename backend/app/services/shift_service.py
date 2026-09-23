"""Clocking in and out, and the timesheet that comes out of it.

Two decisions shape everything here, and both come from this feeding payroll
rather than being a rough record.

**Starting a shift needs the venue's code.** A PIN sign-in proves somebody knows
a PIN, not that they are at work — they can sign in from bed. The clock-in code
is displayed behind the bar and printed on the shift sheet, so starting a shift
means being somewhere the code is. A photograph of the sheet defeats it; that is
accepted, and it is still the difference between trivial and deliberate.

**Nothing is ever closed by guessing.** A shift still open past the rollover is
flagged for the owner to resolve, not quietly ended at some plausible hour.
Inventing an end time means paying somebody for going home, or not paying them
for staying — and the person it happens to is the one least able to argue.

Hours are reported; pay is not computed. Rates, overtime, tax and deductions
differ by venue and carry real legal exposure. An accurate hour count and an
export is the useful, defensible line.
"""
import json
import secrets
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shift import Shift
from app.models.user import User
from app.models.venue import Venue
from app.utils.venue_time import business_date, business_day_start

#: No I, O, 0 or 1 — this gets read off a wall and typed on a phone, and those
#: four are where the mistakes are.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_code(length: int = 5) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


async def get_or_create_code(db: AsyncSession, venue_id: str) -> str:
    venue = (
        await db.execute(select(Venue).where(Venue.id == venue_id))
    ).scalar_one()
    if not venue.clock_in_code:
        venue.clock_in_code = generate_code()
        await db.commit()
    return venue.clock_in_code


async def rotate_code(db: AsyncSession, venue_id: str) -> str:
    """Issue a new code — after a leak, or when staff leave."""
    venue = (
        await db.execute(select(Venue).where(Venue.id == venue_id))
    ).scalar_one()
    venue.clock_in_code = generate_code()
    await db.commit()
    return venue.clock_in_code


async def open_shift(db: AsyncSession, venue_id: str, user_id: str) -> Shift | None:
    """The shift this person is currently on, if any."""
    return (
        await db.execute(
            select(Shift).where(
                Shift.venue_id == venue_id,
                Shift.user_id == user_id,
                Shift.ended_at.is_(None),
            )
        )
    ).scalars().first()


async def clock_in(
    db: AsyncSession, venue_id: str, user_id: str, code: str
) -> Shift:
    venue = (
        await db.execute(select(Venue).where(Venue.id == venue_id))
    ).scalar_one()

    expected = venue.clock_in_code
    if not expected:
        raise PermissionError(
            "This venue has no clock-in code yet — ask your manager to set one"
        )
    if (code or "").strip().upper() != expected.upper():
        raise PermissionError("That code is not today's — check the sheet behind the bar")

    existing = await open_shift(db, venue_id, user_id)
    if existing is not None:
        # Not an error: a second tap, or a phone that lost the response. Return
        # the shift they are already on rather than opening a second one, which
        # would double their hours.
        return existing

    shift = Shift(venue_id=venue_id, user_id=user_id)
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift


async def clock_out(db: AsyncSession, venue_id: str, user_id: str) -> Shift:
    shift = await open_shift(db, venue_id, user_id)
    if shift is None:
        raise LookupError("You are not clocked in")
    shift.ended_at = datetime.now(timezone.utc)
    shift.ended_by_reason = "staff"
    shift.flagged_unclosed = False
    await db.commit()
    await db.refresh(shift)
    return shift


async def flag_unclosed(db: AsyncSession, venue_id: str) -> int:
    """Mark shifts left open past the rollover, without ending them.

    Called when the owner looks at the timesheet. They stay open and unpaid-for
    until a person says when they ended, which is the only honest thing to do
    with a time nobody recorded.
    """
    cutoff = business_day_start()
    rows = (
        await db.execute(
            select(Shift).where(
                Shift.venue_id == venue_id,
                Shift.ended_at.is_(None),
                Shift.started_at < cutoff,
                Shift.flagged_unclosed.is_(False),
            )
        )
    ).scalars().all()
    for shift in rows:
        shift.flagged_unclosed = True
    if rows:
        await db.commit()
    return len(rows)


async def correct_shift(
    db: AsyncSession,
    venue_id: str,
    shift_id: str,
    actor_id: str,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    note: str | None = None,
) -> Shift:
    """Change the recorded times, keeping what they were.

    A corrected record that discards the original is one person's word against
    another's. Keeping both is what makes the correction defensible — and what
    lets somebody disagree with it specifically.
    """
    shift = (
        await db.execute(
            select(Shift).where(Shift.id == shift_id, Shift.venue_id == venue_id)
        )
    ).scalar_one_or_none()
    if shift is None:
        raise LookupError("Shift not found")

    if shift.original_times is None:
        shift.original_times = json.dumps({
            "started_at": shift.started_at.isoformat() if shift.started_at else None,
            "ended_at": shift.ended_at.isoformat() if shift.ended_at else None,
        })

    if started_at is not None:
        shift.started_at = started_at
    if ended_at is not None:
        shift.ended_at = ended_at
        shift.ended_by_reason = "owner"
        shift.flagged_unclosed = False
    if note is not None:
        shift.note = note

    if shift.ended_at and shift.started_at and shift.ended_at <= shift.started_at:
        raise ValueError("A shift cannot end before it started")

    shift.corrected_by = actor_id
    shift.corrected_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(shift)
    return shift


def _hours(shift: Shift) -> float | None:
    if not shift.ended_at:
        return None
    return round((shift.ended_at - shift.started_at).total_seconds() / 3600, 2)


async def timesheet(
    db: AsyncSession,
    venue_id: str,
    since: datetime | None = None,
    until: datetime | None = None,
) -> dict:
    """Hours per person over a period, with every shift behind them."""
    await flag_unclosed(db, venue_id)

    q = (
        select(Shift, User.full_name, User.role)
        .join(User, User.id == Shift.user_id)
        .where(Shift.venue_id == venue_id)
        .order_by(Shift.started_at.desc())
    )
    if since is not None:
        q = q.where(Shift.started_at >= since)
    if until is not None:
        q = q.where(Shift.started_at <= until)

    people: dict[str, dict] = {}
    unresolved = 0
    for shift, name, role in (await db.execute(q)).all():
        person = people.setdefault(
            shift.user_id,
            {
                "user_id": shift.user_id,
                "name": name,
                "role": role,
                "hours": 0.0,
                "shifts": [],
                "unresolved": 0,
            },
        )
        hours = _hours(shift)
        if hours is not None:
            person["hours"] = round(person["hours"] + hours, 2)
        else:
            person["unresolved"] += 1
            unresolved += 1

        person["shifts"].append({
            "id": shift.id,
            "started_at": shift.started_at.isoformat(),
            "ended_at": shift.ended_at.isoformat() if shift.ended_at else None,
            "hours": hours,
            "night": business_date(shift.started_at).isoformat(),
            "flagged_unclosed": shift.flagged_unclosed,
            "ended_by": shift.ended_by_reason,
            # Present means "these are not the times that were clocked".
            "corrected": shift.corrected_by is not None,
            "original_times": json.loads(shift.original_times) if shift.original_times else None,
            "note": shift.note,
        })

    rows = sorted(people.values(), key=lambda p: p["name"])
    return {
        "people": rows,
        "total_hours": round(sum(p["hours"] for p in rows), 2),
        # Hours that nobody has accounted for yet. The total above excludes
        # them, and saying so is the difference between a timesheet and a
        # number somebody pays against.
        "unresolved_shifts": unresolved,
    }

"""One line a night, about why the night was what it was.

Sales alone say some Fridays are enormous and some Tuesdays are dead, with no
idea why — so a live act, a public holiday, a downpour and a four-hour power cut
all arrive as the same unexplained noise. A forecast built on that learns very
little, and it learns it slowly.

One line turns each of those from an outlier into a reason. A tag is what a
report can group on; the free text is what a person reads six weeks later when
the tag alone does not explain the figure.

Written by whoever closes, which is the only moment anybody remembers — so
cashiers can write one, not just owners. Reading the history is the owner's.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.models.venue_night import NIGHT_TAGS, VenueNight
from app.schemas.night import NightResponse, NightUpsert
from app.utils.venue_time import business_date

router = APIRouter(prefix="/nights", tags=["nights"])

#: Long enough to cover a year of history in one request.
MAX_RANGE_DAYS = 400


@router.get("/tags")
async def list_tags(
    current_user: User = Depends(
        require_roles("owner", "cashier", "attendant", "bartender")
    ),
):
    """So the UI does not carry its own copy of the list and drift from it."""
    return {"tags": list(NIGHT_TAGS)}


async def _with_name(db: AsyncSession, night: VenueNight) -> dict:
    name = None
    if night.recorded_by:
        name = (
            await db.execute(
                select(User.full_name).where(User.id == night.recorded_by)
            )
        ).scalar_one_or_none()
    return {
        "business_date": night.business_date,
        "note": night.note,
        "tag": night.tag,
        "recorded_by": night.recorded_by,
        "recorded_by_name": name,
        "created_at": night.created_at,
    }


@router.get("/tonight", response_model=NightResponse | None)
async def get_tonight(
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    """Whatever has been written about the night in progress, if anything.

    Returns null rather than 404 for a night nobody has written up yet: not
    having written one is the normal state for most of a night, not an error.
    """
    tonight = business_date()
    night = (
        await db.execute(
            select(VenueNight).where(
                VenueNight.venue_id == current_user.venue_id,
                VenueNight.business_date == tonight,
            )
        )
    ).scalar_one_or_none()
    if night is None:
        return None
    return await _with_name(db, night)


@router.get("", response_model=list[NightResponse])
async def list_nights(
    start: date | None = Query(None),
    end: date | None = Query(None),
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    end = end or business_date()
    start = start or (end - timedelta(days=29))
    if start > end:
        raise HTTPException(status_code=400, detail="The start date is after the end date")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400, detail=f"Choose a range of {MAX_RANGE_DAYS} days or less"
        )

    rows = (
        await db.execute(
            select(VenueNight)
            .where(
                VenueNight.venue_id == current_user.venue_id,
                VenueNight.business_date.between(start, end),
            )
            .order_by(VenueNight.business_date.desc())
        )
    ).scalars().all()
    return [await _with_name(db, n) for n in rows]


@router.put("/tonight", response_model=NightResponse)
async def upsert_tonight(
    req: NightUpsert,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    """Write up the night in progress, without the client naming it.

    The browser's idea of "today" is wrong for the hours either side of the 6AM
    rollover — which is precisely when this gets written, by somebody closing up
    at 4AM. Letting the server decide which night it is removes a whole class of
    note filed against the wrong day.

    Declared above the dated route so "tonight" is not parsed as a date.
    """
    return await _upsert(db, current_user, business_date(), req)


@router.put("/{night}", response_model=NightResponse)
async def upsert_night(
    night: date,
    req: NightUpsert,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    """Write or rewrite the line for one night.

    A second write is an edit, not another record — the table has a unique
    constraint on (venue, night) saying so. Clearing both fields deletes the
    row rather than leaving an empty one, so "nothing was written" and "somebody
    wrote nothing" do not end up looking different in the history.
    """
    if night > business_date():
        raise HTTPException(
            status_code=400, detail="That night has not happened yet"
        )
    return await _upsert(db, current_user, night, req)


async def _upsert(
    db: AsyncSession, current_user: User, night: date, req: NightUpsert
) -> dict:
    existing = (
        await db.execute(
            select(VenueNight).where(
                VenueNight.venue_id == current_user.venue_id,
                VenueNight.business_date == night,
            )
        )
    ).scalar_one_or_none()

    if req.note is None and req.tag is None:
        if existing is not None:
            await db.delete(existing)
            await db.commit()
        return {
            "business_date": night, "note": None, "tag": None,
            "recorded_by": None, "recorded_by_name": None, "created_at": None,
        }

    if existing is None:
        existing = VenueNight(
            venue_id=current_user.venue_id,
            business_date=night,
        )
        db.add(existing)

    existing.note = req.note
    existing.tag = req.tag
    # Whoever last touched it, which is who to ask about it.
    existing.recorded_by = current_user.id
    await db.commit()
    await db.refresh(existing)
    return await _with_name(db, existing)

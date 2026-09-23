from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.user import User
from app.services import shift_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/shifts", tags=["shifts"])

STAFF_ROLES = ("attendant", "bartender", "kitchen", "cashier", "security", "owner")


class ClockInRequest(BaseModel):
    code: str


class CorrectShiftRequest(BaseModel):
    started_at: datetime | None = None
    ended_at: datetime | None = None
    note: str | None = None


@router.get("/me")
async def my_shift(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Whether this person is currently on shift."""
    shift = await shift_service.open_shift(db, current_user.venue_id, current_user.id)
    if shift is None:
        return {"on_shift": False}
    return {
        "on_shift": True,
        "shift_id": shift.id,
        "started_at": shift.started_at.isoformat(),
    }


@router.post("/clock-in")
async def clock_in(
    req: ClockInRequest,
    current_user: User = Depends(require_roles(*STAFF_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Start a shift. Needs the venue's code, which lives behind the bar."""
    try:
        shift = await shift_service.clock_in(
            db, current_user.venue_id, current_user.id, req.code
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"shift_id": shift.id, "started_at": shift.started_at.isoformat()}


@router.post("/clock-out")
async def clock_out(
    current_user: User = Depends(require_roles(*STAFF_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        shift = await shift_service.clock_out(db, current_user.venue_id, current_user.id)
    except LookupError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "shift_id": shift.id,
        "started_at": shift.started_at.isoformat(),
        "ended_at": shift.ended_at.isoformat(),
    }


@router.get("/code")
async def clock_in_code(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return {"code": await shift_service.get_or_create_code(db, current_user.venue_id)}


@router.post("/code/rotate")
async def rotate_clock_in_code(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Issue a new code — after a leak, or when somebody leaves."""
    code = await shift_service.rotate_code(db, current_user.venue_id)
    log_action(
        db,
        venue_id=current_user.venue_id,
        actor_id=current_user.id,
        action="clock_in_code_rotated",
        entity_type="venue",
        entity_id=current_user.venue_id,
    )
    await db.commit()
    return {"code": code}


@router.get("/timesheet")
async def timesheet(
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Hours per person. Pay is deliberately not computed — see shift_service."""
    return await shift_service.timesheet(db, current_user.venue_id, since, until)


@router.patch("/{shift_id}")
async def correct_shift(
    shift_id: str,
    req: CorrectShiftRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Fix a forgotten clock-out, keeping what the clock originally said."""
    try:
        shift = await shift_service.correct_shift(
            db,
            current_user.venue_id,
            shift_id,
            current_user.id,
            started_at=req.started_at,
            ended_at=req.ended_at,
            note=req.note,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    log_action(
        db,
        venue_id=current_user.venue_id,
        actor_id=current_user.id,
        action="shift_corrected",
        entity_type="shift",
        entity_id=shift.id,
        details={"note": req.note, "original": shift.original_times},
    )
    await db.commit()
    return {"shift_id": shift.id, "corrected": True}

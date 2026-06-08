from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles, require_plan
from app.models.user import User
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _owner(db=Depends(get_db)):
    return require_roles("owner")


@router.get("/summary")
async def summary(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_summary(db, current_user.venue_id)


@router.get("/peak-hours")
async def peak_hours(
    current_user: User = Depends(require_plan("growth", "pro", "enterprise")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_peak_hours(db, current_user.venue_id)


@router.get("/top-items")
async def top_items(
    current_user: User = Depends(require_plan("growth", "pro", "enterprise")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_top_items(db, current_user.venue_id)


@router.get("/slow-tables")
async def slow_tables(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_slow_tables(db, current_user.venue_id)


@router.get("/staff-scores")
async def staff_scores(
    current_user: User = Depends(require_plan("growth", "pro", "enterprise")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_staff_scores(db, current_user.venue_id)


@router.get("/feedback")
async def feedback_summary(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_feedback_summary(db, current_user.venue_id)


@router.get("/inventory")
async def inventory_alerts(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_inventory_alerts(db, current_user.venue_id)


@router.get("/exit-pass-log")
async def exit_pass_log(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_exit_pass_log(db, current_user.venue_id)

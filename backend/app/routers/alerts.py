from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.alert import Alert
from app.models.user import User
from app.schemas.alert import AlertResponse
from app.services.alert_service import acknowledge_alert, resolve_alert

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    current_user: User = Depends(require_roles("owner", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert)
        .where(Alert.venue_id == current_user.venue_id)
        .order_by(Alert.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def ack(
    alert_id: str,
    current_user: User = Depends(require_roles("owner", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    return await acknowledge_alert(db, alert_id, current_user.id, current_user.venue_id)


@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve(
    alert_id: str,
    current_user: User = Depends(require_roles("owner", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    return await resolve_alert(db, alert_id, current_user.venue_id)

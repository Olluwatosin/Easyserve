import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.promo import Promo
from app.models.user import User
from app.schemas.menu import PromoCreate, PromoResponse, PromoUpdate
from app.services.promo_service import get_active_promos

router = APIRouter(prefix="/promos", tags=["promos"])


@router.get("", response_model=list[PromoResponse])
async def list_promos(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Promo).where(Promo.venue_id == current_user.venue_id))
    return result.scalars().all()


@router.get("/active", response_model=list[PromoResponse])
async def active_promos(
    current_user: User = Depends(require_roles("owner", "bartender", "kitchen", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_promos(db, current_user.venue_id)


@router.post("", response_model=PromoResponse)
async def create_promo(
    req: PromoCreate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    from datetime import time
    start = time.fromisoformat(req.start_time)
    end = time.fromisoformat(req.end_time)
    promo = Promo(
        id=str(uuid.uuid4()),
        venue_id=current_user.venue_id,
        name=req.name,
        discount_pct=req.discount_pct,
        start_time=start,
        end_time=end,
        days_active=req.days_active,
        applies_to=req.applies_to,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.patch("/{promo_id}", response_model=PromoResponse)
async def update_promo(
    promo_id: str,
    req: PromoUpdate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Promo).where(Promo.id == promo_id, Promo.venue_id == current_user.venue_id))
    promo = result.scalar_one_or_none()
    if not promo:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    for k, v in req.model_dump(exclude_none=True).items():
        if k in ("start_time", "end_time"):
            from datetime import time
            v = time.fromisoformat(v)
        setattr(promo, k, v)
    await db.commit()
    await db.refresh(promo)
    return promo


@router.delete("/{promo_id}", status_code=204)
async def delete_promo(
    promo_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Promo).where(Promo.id == promo_id, Promo.venue_id == current_user.venue_id))
    promo = result.scalar_one_or_none()
    if promo:
        await db.delete(promo)
        await db.commit()

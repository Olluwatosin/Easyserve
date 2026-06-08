from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.user import User
from app.models.venue import Venue
from app.schemas.venue import VenueResponse, VenueUpdate

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("/me", response_model=VenueResponse)
async def get_venue(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Venue).where(Venue.id == current_user.venue_id))
    return result.scalar_one()


@router.patch("/me", response_model=VenueResponse)
async def update_venue(
    req: VenueUpdate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Venue).where(Venue.id == current_user.venue_id))
    venue = result.scalar_one()
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(venue, field, value)
    await db.commit()
    await db.refresh(venue)
    return venue


@router.get("/{venue_slug}/menu")
async def get_menu_by_slug(venue_slug: str, db: AsyncSession = Depends(get_db)):
    """WhatsApp / shareable link entry point — returns venue info + menu."""
    result = await db.execute(select(Venue).where(Venue.slug == venue_slug, Venue.is_active == True))
    venue = result.scalar_one_or_none()
    if not venue:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Venue not found")
    from app.routers.customer import _build_menu_response
    return await _build_menu_response(db, venue, None)

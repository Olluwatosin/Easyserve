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


@router.get("/lookup/{query}")
async def lookup_venue(query: str, db: AsyncSession = Depends(get_db)):
    """Resolve what a staff member typed into a real venue.

    The keypad's first step used to demand an exact slug — "the-grand-noir" —
    and anything else ("The Grand Noir", "grandnoir") failed the *PIN* step with
    "Invalid PIN", because a wrong venue and a wrong PIN come back from
    pin-login identically. A bartender then retypes a PIN that was never wrong.

    So the venue is resolved before a PIN is ever entered, and the name is typed
    the way a person would say it.

    Matching is exact on the slug, or on the slugified input — never partial. A
    venue's slug is already public: it is in every table QR link and in the
    unauthenticated menu endpoint below. Fuzzy search would newly expose the
    list of venues, which none of that does.
    """
    from fastapi import HTTPException

    from app.utils.helpers import slugify

    candidates = [query.strip(), slugify(query)]
    result = await db.execute(
        select(Venue).where(Venue.slug.in_(candidates), Venue.is_active == True)
    )
    venue = result.scalars().first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    # Only what the sign-in screen needs to name the place it is signing in to.
    return {"slug": venue.slug, "name": venue.name}


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

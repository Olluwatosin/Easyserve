from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.venue import Venue
from app.schemas.auth import RegisterRequest, LoginRequest, PinLoginRequest, TokenResponse
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.utils.helpers import slugify, new_uuid


async def register(db: AsyncSession, req: RegisterRequest) -> TokenResponse:
    # Check email not taken
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create venue
    slug_base = slugify(req.venue_name)
    slug = slug_base
    counter = 1
    while True:
        existing = await db.execute(select(Venue).where(Venue.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{slug_base}-{counter}"
        counter += 1

    venue = Venue(
        id=new_uuid(),
        name=req.venue_name,
        slug=slug,
        city=req.venue_city,
        phone=req.venue_phone,
    )
    db.add(venue)
    await db.flush()

    # Create owner user
    user = User(
        id=new_uuid(),
        venue_id=venue.id,
        full_name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role="owner",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token_data = {"sub": user.id, "venue_id": venue.id, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def login(db: AsyncSession, req: LoginRequest) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == req.email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def pin_login(db: AsyncSession, req: PinLoginRequest) -> TokenResponse:
    result = await db.execute(select(Venue).where(Venue.slug == req.venue_slug, Venue.is_active == True))
    venue = result.scalar_one_or_none()
    if not venue:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    result = await db.execute(
        select(User).where(
            User.venue_id == venue.id,
            User.is_active == True,
            User.pin_hash.isnot(None),
        )
    )
    for user in result.scalars().all():
        if verify_password(req.pin, user.pin_hash):
            token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
            return TokenResponse(
                access_token=create_access_token(token_data),
                refresh_token=create_refresh_token(token_data),
            )

    raise HTTPException(status_code=401, detail="Invalid credentials")


async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"], User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )

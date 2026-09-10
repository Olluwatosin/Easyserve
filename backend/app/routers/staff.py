import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.auth import SetPinRequest
from app.utils.security import hash_password

router = APIRouter(prefix="/staff", tags=["staff"])


class StaffCreateRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    zone: str | None = None


@router.get("", response_model=list[UserResponse])
async def list_staff(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.venue_id == current_user.venue_id, User.id != current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=UserResponse)
async def create_staff(
    req: StaffCreateRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    allowed_roles = {"attendant", "bartender", "kitchen", "cashier", "security"}
    if req.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {allowed_roles}")

    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        venue_id=current_user.venue_id,
        full_name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        zone=req.zone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/pin", status_code=204)
async def set_staff_pin(
    user_id: str,
    req: SetPinRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    if len(req.pin) != 4 or not req.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    result = await db.execute(
        select(User).where(User.id == user_id, User.venue_id == current_user.venue_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    user.pin_hash = hash_password(req.pin)
    await db.commit()


@router.delete("/{user_id}", status_code=204)
async def deactivate_staff(
    user_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == user_id, User.venue_id == current_user.venue_id)
    )
    user = result.scalar_one_or_none()
    if user:
        user.is_active = False
        await db.commit()


@router.patch("/{user_id}/reactivate", response_model=UserResponse)
async def reactivate_staff(
    user_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Bring a deactivated staff member back.

    Deactivation was already reversible in the data — is_active is a flag, not a
    delete — but nothing could turn it back on, so anyone switched off was
    switched off permanently. Seasonal staff and anyone deactivated by mistake
    both needed rehiring from scratch.

    Their old PIN still works afterwards, which is why any session issued before
    now is cut off: if they were deactivated because they left, whatever was
    signed in on a phone somewhere must not simply resume. Set a fresh PIN from
    the staff page if the old one should not be honoured either.
    """
    from datetime import datetime, timezone

    result = await db.execute(
        select(User).where(User.id == user_id, User.venue_id == current_user.venue_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")

    user.is_active = True
    user.tokens_valid_after = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user

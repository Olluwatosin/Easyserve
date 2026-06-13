import uuid
from fastapi import APIRouter, Depends
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
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {allowed_roles}")

    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        from fastapi import HTTPException
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
    from fastapi import HTTPException
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

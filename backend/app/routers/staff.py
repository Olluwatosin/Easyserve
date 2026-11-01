import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.auth import UserResponse
from app.schemas.auth import SetPinRequest, SetStaffPasswordRequest
from app.services.whatsapp_service import normalise_phone
from datetime import datetime, timezone

from app.services.audit_service import log_action
from app.utils.security import generate_readable_password, hash_password, verify_password

router = APIRouter(prefix="/staff", tags=["staff"])


class StaffCreateRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    zone: str | None = None
    #: Required. A station account with no PIN cannot sign in at the keypad, and
    #: nothing on the floor explains why — it simply reads as a wrong PIN. Making
    #: it part of creation means that account cannot exist.
    pin: str
    #: Optional, for sending the PIN to this person on WhatsApp. Stored E.164.
    phone: str | None = None


def _validated_pin(pin: str) -> str:
    """A PIN is four digits. Rejected here rather than at the keypad, where a
    bad one is indistinguishable from a forgotten one."""
    if len(pin) != 4 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    return pin


async def _refuse_duplicate_pin(
    db: AsyncSession, venue_id: str, pin: str, *, excluding: str | None = None
) -> None:
    """A PIN has to identify exactly one person at a venue.

    Nothing used to check this, and the keypad resolves a PIN by trying every
    account at the venue and taking the first hash that matches — from a query
    with no ordering. So two people sharing a PIN produced, silently:

    * one of them permanently unable to reach their own account, because their
      PIN signed them in as the other person;
    * that person holding the **other's role**, which with no ORDER BY was
      whichever row Postgres happened to return first — a bartender could land
      on the cashier's account and take payments;
    * every audited action attributed to the wrong name, which is the one thing
      an audit trail exists to get right;
    * shift hours accruing to the wrong person, so payroll was wrong and nothing
      explained why.

    Four digits is 10,000 combinations, so random collision across fifteen staff
    is around 1%. PINs are not random though — assigned by hand they cluster on
    1234, 1111 and birth years, and the demo venue ships 1111 through 5555 as a
    pattern to copy. In practice this was likely rather than unlikely.

    Checked by comparing against every stored hash because they are bcrypt and
    cannot be looked up directly. A venue has tens of staff, not thousands, so
    the cost is irrelevant next to being wrong.
    """
    rows = await db.execute(
        select(User).where(
            User.venue_id == venue_id,
            User.pin_hash.isnot(None),
        )
    )
    for other in rows.scalars().all():
        if excluding is not None and other.id == excluding:
            continue
        if verify_password(pin, other.pin_hash):
            # Names the holder: the owner is choosing a PIN for someone and
            # needs to know which colleague to pick a different one from. It
            # reveals nothing a venue owner cannot already see on the staff page.
            raise HTTPException(
                status_code=409,
                detail=f"{other.full_name} already uses that PIN — choose another",
            )


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

    _validated_pin(req.pin)
    await _refuse_duplicate_pin(db, current_user.venue_id, req.pin)

    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    phone = normalise_phone(req.phone) if req.phone else None
    if req.phone and not phone:
        raise HTTPException(status_code=400, detail="That phone number is not valid")

    user = User(
        id=str(uuid.uuid4()),
        venue_id=current_user.venue_id,
        full_name=req.full_name,
        email=req.email,
        password_hash=hash_password(req.password),
        pin_hash=hash_password(req.pin),
        phone=phone,
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
    _validated_pin(req.pin)
    result = await db.execute(
        select(User).where(User.id == user_id, User.venue_id == current_user.venue_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    # Excluding this account, so re-setting somebody's own PIN to what it
    # already is does not collide with itself.
    await _refuse_duplicate_pin(
        db, current_user.venue_id, req.pin, excluding=user.id
    )
    user.pin_hash = hash_password(req.pin)
    await db.commit()


@router.patch("/{user_id}/password")
async def set_staff_password(
    user_id: str,
    req: SetStaffPasswordRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Give a staff member a new password, and hand it back once.

    A password was set when the account was created and then became
    unrecoverable: hashed, correctly, with nothing anywhere able to say what it
    was. So the owner could neither tell a staff member their password nor
    change it — the email door existed and nobody could open it.

    The new password is returned in this response and never again, which is the
    same bargain as the PIN. Generated here when none is supplied, because a
    password chosen in a hurry for somebody else is usually "Password1".
    """
    result = await db.execute(
        select(User).where(User.id == user_id, User.venue_id == current_user.venue_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if user.id == current_user.id:
        # An owner changing their own password goes through the flow that asks
        # for the current one; this endpoint deliberately does not.
        raise HTTPException(
            status_code=400,
            detail="Use Settings to change your own password",
        )

    password = (req.password or "").strip() or generate_readable_password()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.password_hash = hash_password(password)
    # Anything signed in on the old password stops being signed in.
    user.tokens_valid_after = datetime.now(timezone.utc)

    log_action(
        db,
        venue_id=current_user.venue_id,
        actor_id=current_user.id,
        action="staff_password_reset",
        entity_type="user",
        entity_id=user.id,
        details={"staff": user.full_name},
    )
    await db.commit()
    return {
        "password": password,
        "full_name": user.full_name,
        "email": user.email,
    }


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

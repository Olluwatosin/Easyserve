from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.utils.limiter import limiter
from app.utils.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PinLoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.services import auth_service, password_reset_service
from app.utils.limiter import client_ip

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.register(db, req)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, req)


@router.post("/pin-login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def pin_login(request: Request, req: PinLoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.pin_login(db, req)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(request: Request, req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh(db, req.refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=204)
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.password_hash or not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    from datetime import datetime, timezone
    current_user.password_hash = hash_password(req.new_password)
    # Invalidate every existing session (access + refresh) issued before now.
    current_user.tokens_valid_after = datetime.now(timezone.utc)
    await db.commit()


@router.post("/forgot-password", status_code=204)
@limiter.limit("4/hour")
async def forgot_password(
    request: Request,
    req: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send a reset link.

    Always 204, whether or not the address is registered — a different response
    for a known address would turn this into an account-enumeration oracle.
    Rate limited because it is unauthenticated and sends mail on demand.
    """
    await password_reset_service.request_reset(db, req.email, client_ip(request))
    return None


@router.post("/reset-password", status_code=204)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    req: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Consume a reset token and set a new password.

    Rate limited so the token cannot be brute-forced, though 32 random bytes
    makes that infeasible anyway.
    """
    try:
        ok = await password_reset_service.reset_password(db, req.token, req.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    return None

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.services.audit_service import log_action
from app.models.venue import Venue
from app.schemas.auth import RegisterRequest, LoginRequest, PinLoginRequest, TokenResponse
from app.utils.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token, token_is_revoked
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


async def _record_sign_in(db: AsyncSession, user: User, method: str) -> None:
    """Note that somebody signed in, and how.

    Every money-touching action was already audited; arriving was not, so there
    was no way to answer "has anyone actually opened this yet". That question
    matters twice: during a pilot, when logins have been handed out and nobody
    knows whether they were used, and afterwards, when an owner wants to know
    who was on the floor before a void.

    Deliberately only successes. Logging failed attempts would fill the trail
    with mistyped PINs on a busy night, and the interesting failures — a wrong
    password against a real account, over and over — are what the rate limiter
    exists for.

    Never records the PIN, the password, or anything derived from either.

    A failure here must not stop somebody signing in: an audit row is worth less
    than a bartender getting to the till, so the commit is guarded.
    """
    from sqlalchemy.exc import SQLAlchemyError

    log_action(
        db,
        venue_id=user.venue_id,
        actor_id=user.id,
        action="signed_in",
        entity_type="user",
        entity_id=user.id,
        details={"method": method, "role": user.role, "name": user.full_name},
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()


async def login(db: AsyncSession, req: LoginRequest) -> TokenResponse:
    """Sign in with an email address and a password, and say which one was wrong.

    The usual advice is one message for both, so that nobody can discover which
    email addresses have accounts. That is the right default for a consumer
    service signed up to by strangers. It is the wrong trade here: these accounts
    are created by an owner for their own staff, handed over in person or on
    WhatsApp, and typed on a phone in a dark room. "Invalid credentials" sends a
    bartender to find the manager, who cannot tell either — is the address wrong,
    was the account switched off, or is it the password? The cost of that landed
    on the floor every time, and the enumeration it prevents is worth very little
    against a venue's staff list.

    What actually holds the door is the rate limit on this endpoint, not the
    vagueness of the message.

    A deactivated account gets its own answer for the same reason: it used to be
    indistinguishable from a wrong password, so somebody whose account had been
    turned off would stand there retyping a password that was perfectly correct.
    """
    # `is_active` deliberately not filtered in the query — a switched-off account
    # has to be told apart from an address that was never registered.
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="No account with that email address",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account has been switched off — ask the owner to turn it back on",
        )
    if not user.password_hash:
        # Possible for an account that only ever had a PIN issued.
        raise HTTPException(
            status_code=401,
            detail="This account has no password yet — sign in with your PIN, or ask the owner to issue one",
        )
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong password")

    await _record_sign_in(db, user, method="password")

    token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


async def pin_login(db: AsyncSession, req: PinLoginRequest) -> TokenResponse:
    result = await db.execute(select(Venue).where(Venue.slug == req.venue_slug, Venue.is_active == True))
    venue = result.scalar_one_or_none()
    if not venue:
        # Not a wrong PIN — a wrong venue. Staff reach this screen from a link or
        # a printed sheet, so the fix is a new link, and telling them "Invalid
        # PIN" sends them off retyping a PIN that was never the problem.
        raise HTTPException(
            status_code=401,
            detail="That sign-in link is not for a venue we know — ask the owner for a new one",
        )

    result = await db.execute(
        select(User).where(
            User.venue_id == venue.id,
            User.is_active == True,
            User.pin_hash.isnot(None),
        )
    )
    for user in result.scalars().all():
        if verify_password(req.pin, user.pin_hash):
            await _record_sign_in(db, user, method="pin")
            token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
            return TokenResponse(
                access_token=create_access_token(token_data),
                refresh_token=create_refresh_token(token_data),
            )

    raise HTTPException(status_code=401, detail="That PIN does not match anyone here")


async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"], User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if token_is_revoked(payload, user.tokens_valid_after):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_data = {"sub": user.id, "venue_id": user.venue_id, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )

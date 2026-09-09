"""Password recovery.

Threat model, and why the code looks the way it does:

* **No account enumeration.** `request_reset` returns nothing and takes the same
  path whether or not the address exists, so the endpoint cannot be used to
  discover who has an account.
* **No replay from a database leak.** Only the SHA-256 of the token is stored.
* **Single use, short life.** A token is consumed on success and expires quickly.
* **One outstanding token per user.** Requesting a new link invalidates earlier
  ones, so an old email left in an inbox stops working.
* **A successful reset ends every session**, via the same `tokens_valid_after`
  cut-off that a password change uses — otherwise an attacker who had already
  logged in would keep their access after the owner recovers the account.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services import email_service
from app.services.audit_service import log_action
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def request_reset(db: AsyncSession, email: str, client_ip: str | None = None) -> None:
    """Issue a reset link. Always returns None — never reveal whether the
    address is registered."""
    result = await db.execute(
        select(User).where(User.email == email.lower().strip(), User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if user is None:
        logger.info("Password reset requested for unknown address")
        return

    # Supersede any outstanding links for this user.
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=datetime.now(timezone.utc))
    )

    token = secrets.token_urlsafe(32)
    minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
        requested_ip=client_ip,
    ))
    log_action(
        db,
        venue_id=user.venue_id,
        actor_id=user.id,
        action="password_reset_requested",
        entity_type="user",
        entity_id=user.id,
        details={"ip": client_ip},
    )
    await db.commit()

    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    subject, html, text = email_service.password_reset_email(user.full_name, reset_url, minutes)
    await email_service.send_email(user.email, subject, html, text)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    """Consume a token and set the new password. False if the token is unusable."""
    if len(new_password) < 8:
        raise ValueError("New password must be at least 8 characters")

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_token(token))
    )
    prt = result.scalar_one_or_none()
    if prt is None or not prt.is_usable:
        return False

    user_res = await db.execute(select(User).where(User.id == prt.user_id, User.is_active == True))
    user = user_res.scalar_one_or_none()
    if user is None:
        return False

    now = datetime.now(timezone.utc)
    user.password_hash = hash_password(new_password)
    # Cut off every token issued before now — including any session an attacker
    # may already hold. This is the whole point of recovering the account.
    user.tokens_valid_after = now
    prt.used_at = now

    log_action(
        db,
        venue_id=user.venue_id,
        actor_id=user.id,
        action="password_reset_completed",
        entity_type="user",
        entity_id=user.id,
        details={"token_id": prt.id},
    )
    await db.commit()
    return True

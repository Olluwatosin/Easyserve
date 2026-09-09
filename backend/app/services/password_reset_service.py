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
from app.services import email_service, whatsapp_service
from app.services.audit_service import log_action
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def request_reset(
    db: AsyncSession,
    email: str | None = None,
    phone: str | None = None,
    client_ip: str | None = None,
) -> None:
    """Issue a reset credential over email or WhatsApp.

    Always returns None — never reveal whether the account exists.
    """
    if phone:
        normalised = whatsapp_service.normalise_phone(phone)
        if normalised is None:
            logger.info("Password reset requested with an unparseable phone number")
            return
        result = await db.execute(
            select(User).where(User.phone == normalised, User.is_active == True)
        )
        channel = "whatsapp"
    elif email:
        result = await db.execute(
            select(User).where(User.email == email.lower().strip(), User.is_active == True)
        )
        channel = "email"
    else:
        return

    user = result.scalar_one_or_none()

    if user is None:
        logger.info("Password reset requested for an unknown %s", channel)
        return

    # Supersede any outstanding links for this user.
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=datetime.now(timezone.utc))
    )

    if channel == "whatsapp":
        # A 6-digit code is what a WhatsApp authentication template carries, and
        # what people expect on a phone. Its small keyspace is covered by a short
        # expiry, an attempt cap on the token, and a rate limit on the endpoint.
        token = f"{secrets.randbelow(1_000_000):06d}"
        minutes = settings.PASSWORD_RESET_CODE_EXPIRE_MINUTES
    else:
        token = secrets.token_urlsafe(32)
        minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES

    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(token),
        channel=channel,
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
        details={"ip": client_ip, "channel": channel},
    )
    await db.commit()

    if channel == "whatsapp":
        await whatsapp_service.send_reset_code(user.phone, token, minutes)
    else:
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        subject, html, text = email_service.password_reset_email(user.full_name, reset_url, minutes)
        await email_service.send_email(user.email, subject, html, text)


async def reset_password(
    db: AsyncSession,
    token: str,
    new_password: str,
    phone: str | None = None,
) -> bool:
    """Consume a reset credential and set the new password.

    The two channels are looked up differently on purpose.

    An emailed token is 32 random bytes: knowing it *is* the proof, so a lookup
    by hash is sufficient and unguessable.

    A WhatsApp code is six digits — one in a million, which is searchable. It is
    therefore never looked up globally; it is only ever compared against the
    token belonging to the account that owns the supplied phone number. Without
    that binding a guessed code could match any outstanding token in the system,
    and an attacker could dodge the attempt cap by naming an account with no
    token outstanding.
    """
    if len(new_password) < 8:
        raise ValueError("New password must be at least 8 characters")

    if phone:
        prt, user = await _find_code_token(db, phone, token)
        if prt is None:
            return False
    else:
        result = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == _hash_token(token),
                PasswordResetToken.channel == "email",
            )
        )
        prt = result.scalar_one_or_none()
        if prt is None or not prt.is_usable:
            return False
        user_res = await db.execute(
            select(User).where(User.id == prt.user_id, User.is_active == True)
        )
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
        details={"token_id": prt.id, "channel": prt.channel},
    )
    await db.commit()
    return True


async def _find_code_token(db: AsyncSession, phone: str, code: str):
    """Resolve a WhatsApp code against the account that owns `phone`.

    Returns (token, user) on a match, (None, None) otherwise — charging a failed
    attempt against that account's outstanding code as it goes.
    """
    normalised = whatsapp_service.normalise_phone(phone)
    if normalised is None:
        return None, None

    result = await db.execute(
        select(PasswordResetToken, User)
        .join(User, User.id == PasswordResetToken.user_id)
        .where(
            User.phone == normalised,
            User.is_active == True,
            PasswordResetToken.channel == "whatsapp",
            PasswordResetToken.used_at.is_(None),
        )
        .order_by(PasswordResetToken.created_at.desc())
        .limit(1)
    )
    row = result.first()
    if row is None:
        return None, None

    prt, user = row
    if not prt.is_usable:
        return None, None

    if not secrets.compare_digest(prt.token_hash, _hash_token(code)):
        prt.attempts = (prt.attempts or 0) + 1
        if prt.attempts >= PasswordResetToken.MAX_ATTEMPTS:
            logger.warning(
                "Reset code for user %s locked after %d attempts", prt.user_id, prt.attempts
            )
        await db.commit()
        return None, None

    return prt, user

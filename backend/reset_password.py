#!/usr/bin/env python
"""Break-glass password reset. Run on the server, no email required.

    docker compose exec backend python reset_password.py owner@venue.com

Prints a generated password, or accepts one as a second argument. Ends every
existing session for that user, exactly as the normal reset flow does.

This exists because email can fail on the night you need it most — wrong DNS,
provider outage, address no longer monitored — and an owner locked out of their
own venue mid-service is not an acceptable failure mode. Requires shell access
to the server, which is the point: it is the last resort, not a convenience.
"""
import asyncio
import secrets
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.config import settings  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


async def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    email = sys.argv[1].lower().strip()
    password = sys.argv[2] if len(sys.argv) > 2 else secrets.token_urlsafe(12)
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return 2

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"No user with email {email}")
            return 1

        user.password_hash = hash_password(password)
        user.tokens_valid_after = datetime.now(timezone.utc)
        await db.commit()

    await engine.dispose()
    print("=" * 56)
    print(f"  Password reset for {user.full_name} <{email}>  (role: {user.role})")
    print(f"  New password: {password}")
    print("  All existing sessions for this user have been ended.")
    print("  Change it after signing in.")
    print("=" * 56)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

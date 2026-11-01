"""Find staff who share a PIN, on a venue that predates the uniqueness rule.

Duplicate PINs are refused now, but accounts created before that could still
collide — and a collision is invisible from the staff page, because the PIN is
hashed and the symptom is somebody quietly signing in as a colleague.

Reports the groups. Fixing one means issuing a new PIN to everyone in the group
except the first, from the owner's Staff page.

    python scripts_check_pin_collisions.py
"""
import asyncio
import itertools
import os
import sys


async def main() -> int:
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.models.venue import Venue
    from app.utils.security import verify_password

    # Only 10,000 possibilities, so every PIN can be tried against every hash.
    # Slow by design — bcrypt — but this runs once, deliberately.
    async with AsyncSessionLocal() as db:
        venues = (await db.execute(select(Venue))).scalars().all()
        found = 0
        for venue in venues:
            staff = (
                await db.execute(
                    select(User)
                    .where(User.venue_id == venue.id, User.pin_hash.isnot(None))
                    .order_by(User.created_at.asc())
                )
            ).scalars().all()
            if len(staff) < 2:
                continue
            # Compare pairwise against the 10k space only where needed: for each
            # pair, a shared PIN means one hash verifies some PIN the other does
            # too. Cheaper to test each candidate PIN against the group once.
            groups: dict[str, list[User]] = {}
            for pin in (f"{n:04d}" for n in range(10000)):
                holders = [u for u in staff if verify_password(pin, u.pin_hash)]
                if len(holders) > 1:
                    groups[pin] = holders
            for pin, holders in groups.items():
                found += 1
                names = ", ".join(f"{u.full_name} ({u.role})" for u in holders)
                print(f"  {venue.name}: PIN {pin} is shared by {names}")
                print(f"     → only {holders[0].full_name} can sign in; reissue the others")
        if not found:
            print("  No shared PINs found.")
        return 1 if found else 0


if __name__ == "__main__":
    if not os.environ.get("DATABASE_URL"):
        print("Set DATABASE_URL first.")
        sys.exit(2)
    sys.exit(asyncio.run(main()))

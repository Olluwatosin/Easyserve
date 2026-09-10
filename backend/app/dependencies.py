from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.security import decode_token, token_is_revoked
from sqlalchemy import select

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if token_is_revoked(payload, user.tokens_valid_after):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    return user


def require_roles(*roles: str):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return _check


def require_plan(*plans: str, roles: tuple[str, ...] = ("owner",)):
    """Gate on the venue's plan AND the user's role.

    A plan is a billing question, not an authorisation one. Used alone this
    checked only what the venue pays for, so on a Growth plan any signed-in
    user — a bartender on a shared floor PIN, the door staff — could read owner
    analytics including every colleague's performance score.

    Roles default to owner because everything currently behind a plan gate is
    owner-facing. Pass `roles=` to widen it deliberately.
    """
    async def _check(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        from app.models.venue import Venue

        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        result = await db.execute(select(Venue).where(Venue.id == current_user.venue_id))
        venue = result.scalar_one_or_none()
        if not venue or venue.plan not in plans:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature requires one of these plans: {', '.join(plans)}",
            )
        return current_user
    return _check

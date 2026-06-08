from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.exit_pass import ExitPassResponse, ScanResult
from app.services.exit_pass_service import get_exit_pass, scan_exit_pass

router = APIRouter(prefix="/exit-pass", tags=["exit-pass"])


@router.get("/{order_id}", response_model=ExitPassResponse)
async def get_pass(
    order_id: str,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    ep = await get_exit_pass(db, order_id, current_user.venue_id)
    return {
        "id": ep.id,
        "order_id": ep.order_id,
        "token": ep.token,
        "expires_at": ep.expires_at,
        "used_at": ep.used_at,
        "status": ep.status,
        "delivery_method": ep.delivery_method,
        "created_at": ep.created_at,
    }


@router.post("/scan/{token}", response_model=ScanResult)
async def scan_pass(
    token: str,
    current_user: User = Depends(require_roles("owner", "security")),
    db: AsyncSession = Depends(get_db),
):
    return await scan_exit_pass(db, token, current_user.id, current_user.venue_id)

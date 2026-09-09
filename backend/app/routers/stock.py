from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.stock import StockAdjustRequest, StockCountRequest
from app.services import stock_service

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("")
async def list_stock(
    current_user: User = Depends(require_roles("owner", "cashier", "bartender")),
    db: AsyncSession = Depends(get_db),
):
    """Current levels for every tracked item."""
    return await stock_service.list_stock(db, current_user.venue_id)


@router.patch("/{item_id}")
async def adjust_stock(
    item_id: str,
    req: StockAdjustRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Restock, record waste, or correct a level. Owner only — this moves the
    number the variance report is measured against."""
    try:
        return await stock_service.adjust_stock(
            db, current_user.venue_id, item_id, req.delta, req.reason,
            current_user.id, req.note,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/count")
async def submit_count(
    req: StockCountRequest,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Submit a physical count and get back what it had to correct."""
    try:
        return await stock_service.submit_count(
            db, current_user.venue_id, req.counts, current_user.id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/variance")
async def get_variance(
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Movement and variance since the last count."""
    return await stock_service.get_variance(db, current_user.venue_id)

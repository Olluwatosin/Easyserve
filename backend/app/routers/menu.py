import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.menu_category import MenuCategory
from app.models.menu_item import MenuItem
from app.models.user import User
from app.schemas.menu import (
    CategoryCreate, CategoryResponse, CategoryUpdate,
    MenuItemCreate, MenuItemResponse, MenuItemUpdate,
)

router = APIRouter(prefix="/menu", tags=["menu"])


# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    current_user: User = Depends(require_roles("owner", "attendant", "bartender", "kitchen", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.venue_id == current_user.venue_id).order_by(MenuCategory.sort_order)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    req: CategoryCreate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    cat = MenuCategory(id=str(uuid.uuid4()), venue_id=current_user.venue_id, **req.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=CategoryResponse)
async def update_category(
    cat_id: str,
    req: CategoryUpdate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.venue_id == current_user.venue_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.venue_id == current_user.venue_id)
    )
    cat = result.scalar_one_or_none()
    if cat:
        await db.delete(cat)
        await db.commit()


# ── Items ─────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[MenuItemResponse])
async def list_items(
    current_user: User = Depends(require_roles("owner", "attendant", "bartender", "kitchen", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuItem).where(MenuItem.venue_id == current_user.venue_id))
    return result.scalars().all()


@router.post("/items", response_model=MenuItemResponse)
async def create_item(
    req: MenuItemCreate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    item = MenuItem(id=str(uuid.uuid4()), venue_id=current_user.venue_id, **req.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=MenuItemResponse)
async def update_item(
    item_id: str,
    req: MenuItemUpdate,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.venue_id == current_user.venue_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.venue_id == current_user.venue_id)
    )
    item = result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()


@router.patch("/items/{item_id}/availability", response_model=MenuItemResponse)
async def toggle_availability(
    item_id: str,
    current_user: User = Depends(require_roles("owner", "bartender", "kitchen")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.venue_id == current_user.venue_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    item.is_available = not item.is_available
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/items/{item_id}/reset-count", response_model=MenuItemResponse)
async def reset_count(
    item_id: str,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.venue_id == current_user.venue_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    item.order_count = 0
    await db.commit()
    await db.refresh(item)
    return item

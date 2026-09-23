import uuid as _uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings

UPLOAD_DIR = Path(settings.STATIC_DIR) / "uploads"
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
# Menus are text. Anything much larger is a design file with the menu buried in
# it, and refusing early beats timing out inside a parser.
_MAX_IMPORT_BYTES = 4 * 1024 * 1024

from app.database import get_db
from app.dependencies import require_roles
from app.models.menu_category import MenuCategory
from app.models.menu_item import MenuItem
from app.models.user import User
from app.services import menu_import
from app.schemas.menu import (
    MenuImportCommit,
    CategoryCreate, CategoryResponse, CategoryUpdate,
    MenuItemCreate, MenuItemResponse, MenuItemUpdate,
)

router = APIRouter(prefix="/menu", tags=["menu"])


# ── Image upload ──────────────────────────────────────────────────────────────

@router.post("/import/parse")
async def parse_menu_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("owner")),
):
    """Read a menu file and return what was found. Writes nothing.

    Deliberately separate from committing. A parser that is right most of the
    time saves a venue most of a day when a person checks it, and creates forty
    plausible-looking wrong prices when it writes straight to the menu. So this
    returns rows to look at, and `/import/commit` takes back only what was
    approved.
    """
    contents = await file.read()
    if len(contents) > _MAX_IMPORT_BYTES:
        raise HTTPException(400, "That file is over 4 MB — is it the right one?")
    if not contents:
        raise HTTPException(400, "That file is empty")

    try:
        result = menu_import.parse(file.filename or "", contents)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:  # a parser's dependency is missing
        raise HTTPException(503, str(exc))

    if not result.items:
        raise HTTPException(
            400,
            "No menu items could be read from that file. A CSV with Name and "
            "Price columns imports exactly.",
        )

    return {
        "source": result.source,
        "items": [vars(i) for i in result.items],
        "unreadable": result.unreadable[:40],
        "needs_review": result.needs_review,
    }


@router.post("/import/commit")
async def commit_menu_import(
    req: MenuImportCommit,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Create the items a person has reviewed.

    Skips names that already exist rather than failing the batch or creating a
    second Star Lager — an import is usually run more than once while the menu
    is still being settled.
    """
    existing = await db.execute(
        select(MenuItem).where(MenuItem.venue_id == current_user.venue_id)
    )
    taken = {i.name.strip().lower() for i in existing.scalars().all()}

    cats = await db.execute(
        select(MenuCategory).where(MenuCategory.venue_id == current_user.venue_id)
    )
    by_name = {c.name.strip().lower(): c for c in cats.scalars().all()}

    created, skipped = [], []
    for row in req.items:
        name = row.name.strip()
        if not name:
            continue
        if name.lower() in taken:
            skipped.append(name)
            continue

        category_id = None
        if row.category:
            key = row.category.strip().lower()
            cat = by_name.get(key)
            if cat is None:
                cat = MenuCategory(
                    id=str(_uuid.uuid4()),
                    venue_id=current_user.venue_id,
                    name=row.category.strip(),
                )
                db.add(cat)
                await db.flush()
                by_name[key] = cat
            category_id = cat.id

        item = MenuItem(
            id=str(_uuid.uuid4()),
            venue_id=current_user.venue_id,
            category_id=category_id,
            name=name,
            price=row.price,
            unit_cost=row.unit_cost,
            item_type=row.item_type,
        )
        db.add(item)
        taken.add(name.lower())
        created.append(name)

    await db.commit()
    return {
        "created": len(created),
        "skipped": len(skipped),
        "skipped_names": skipped[:20],
        "categories": len(by_name),
    }


@router.post("/upload-image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("owner")),
):
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(400, "Only JPEG, PNG, WebP or GIF images are allowed")
    contents = await file.read()
    if len(contents) > _MAX_BYTES:
        raise HTTPException(400, "Image must be under 5 MB")

    # Re-encode to a small WebP so menus stay light on mobile data
    # (a 3MB phone photo becomes a ~20-40KB thumbnail). Re-encoding also
    # strips EXIF and neutralises any malformed-image payloads.
    import io

    from PIL import Image, ImageOps

    try:
        img = Image.open(io.BytesIO(contents))
        img = ImageOps.exif_transpose(img)  # respect phone orientation
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        img.thumbnail((800, 800))
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=80)
        processed = buf.getvalue()
    except Exception:
        raise HTTPException(400, "Could not process image — is the file corrupt?")

    filename = f"{_uuid.uuid4()}.webp"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(processed)
    base = str(request.base_url).rstrip("/")
    return {"url": f"{base}/static/uploads/{filename}"}


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
    cat = MenuCategory(id=str(_uuid.uuid4()), venue_id=current_user.venue_id, **req.model_dump())
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
    item = MenuItem(id=str(_uuid.uuid4()), venue_id=current_user.venue_id, **req.model_dump())
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
    changes = req.model_dump(exclude_none=True)
    # Price edits are a theft vector — keep an immutable history.
    if "price" in changes and float(changes["price"]) != float(item.price):
        from app.services.audit_service import log_action
        log_action(
            db,
            venue_id=current_user.venue_id,
            actor_id=current_user.id,
            action="price_changed",
            entity_type="menu_item",
            entity_id=item.id,
            details={"name": item.name, "old_price": float(item.price), "new_price": float(changes["price"])},
        )
    for k, v in changes.items():
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

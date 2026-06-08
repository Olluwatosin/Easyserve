import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.utils.limiter import limiter
from app.models.table import Table
from app.models.menu_category import MenuCategory
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.venue import Venue
from app.models.exit_pass import ExitPass
from app.schemas.alert import AlertCreate, AlertResponse
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.schemas.order import OrderResponse, PlaceOrderRequest
from app.services.alert_service import create_alert
from app.services.order_service import place_order
from app.services.promo_service import get_active_promos, apply_promo

router = APIRouter(prefix="/customer", tags=["customer"])


async def _build_menu_response(db: AsyncSession, venue: Venue, table: Table | None) -> dict:
    promos = await get_active_promos(db, venue.id)
    cats = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.venue_id == venue.id, MenuCategory.is_active == True)
        .order_by(MenuCategory.sort_order)
    )
    items_res = await db.execute(
        select(MenuItem).where(MenuItem.venue_id == venue.id, MenuItem.is_available == True)
    )
    items = items_res.scalars().all()

    items_by_category: dict[str, list] = {}
    for item in items:
        original = float(item.price)
        effective = apply_promo(item, promos)
        entry = {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "price": original,
            "original_price": original,
            "effective_price": effective,
            "promo_active": effective < original,
            "image_url": item.image_url,
            "item_type": item.item_type,
            "category_id": item.category_id,
        }
        cat_id = item.category_id or "uncategorised"
        items_by_category.setdefault(cat_id, []).append(entry)

    categories = []
    for cat in cats.scalars().all():
        categories.append({
            "id": cat.id,
            "name": cat.name,
            "sort_order": cat.sort_order,
            "items": items_by_category.get(cat.id, []),
        })

    return {
        "venue_name": venue.name,
        "table_label": table.label if table else None,
        "categories": categories,
        "active_promos": [{"name": p.name, "discount_pct": float(p.discount_pct)} for p in promos],
    }


@router.get("/menu/{qr_token}")
async def get_menu(qr_token: str, session_token: str | None = None, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    result = await db.execute(
        select(Table).where(Table.qr_token == qr_token, Table.is_active == True)
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    venue_res = await db.execute(select(Venue).where(Venue.id == table.venue_id, Venue.is_active == True))
    venue = venue_res.scalar_one_or_none()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    response = await _build_menu_response(db, venue, table)

    if session_token:
        prev = await db.execute(
            select(OrderItem.name, OrderItem.menu_item_id, func.sum(OrderItem.quantity).label("qty"))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.session_token == session_token)
            .group_by(OrderItem.menu_item_id, OrderItem.name)
            .order_by(func.sum(OrderItem.quantity).desc())
            .limit(3)
        )
        response["suggestions"] = [
            {"menu_item_id": str(r.menu_item_id), "name": r.name, "qty": int(r.qty)}
            for r in prev.all()
        ]

    return response


@router.post("/orders/{qr_token}", response_model=OrderResponse)
@limiter.limit("15/minute")
async def place_customer_order(
    request: Request,
    qr_token: str,
    req: PlaceOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    return await place_order(db, qr_token, req)


@router.get("/orders/{session_token}", response_model=list[OrderResponse])
async def get_bill(session_token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.session_token == session_token)
        .options(selectinload(Order.items), selectinload(Order.table))
        .order_by(Order.created_at.asc())
    )
    return result.scalars().all()


@router.post("/alerts/{qr_token}", response_model=AlertResponse)
@limiter.limit("5/minute")
async def send_alert(request: Request, qr_token: str, req: AlertCreate, db: AsyncSession = Depends(get_db)):
    return await create_alert(db, qr_token, req.type)


@router.post("/feedback/{order_id}", response_model=FeedbackResponse)
@limiter.limit("3/minute")
async def submit_feedback(
    request: Request,
    order_id: str,
    req: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
):
    from fastapi import HTTPException
    from app.models.feedback import Feedback
    res = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.table))
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    fb = Feedback(
        id=str(uuid.uuid4()),
        venue_id=order.venue_id,
        order_id=order.id,
        table_id=order.table_id,
        rating=req.rating,
        comment=req.comment,
        attended_by=order.assigned_to,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return fb


@router.get("/exit-pass/{session_token}")
async def get_customer_exit_pass(session_token: str, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    res = await db.execute(
        select(Order, ExitPass)
        .join(ExitPass, ExitPass.order_id == Order.id)
        .where(Order.session_token == session_token)
        .order_by(Order.created_at.desc())
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Exit pass not found")
    _, ep = row
    return {
        "token": ep.token,
        "status": ep.status,
        "expires_at": ep.expires_at.isoformat(),
        "used_at": ep.used_at.isoformat() if ep.used_at else None,
    }

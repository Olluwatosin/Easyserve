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
from app.schemas.payment import InitiateGatewayPayment
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
            "is_available": item.is_available,
            "order_count": item.order_count,
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
        # Scoped to this venue as well as this session. A guest's phone keeps
        # one token, so without the venue clause a bill could carry rounds
        # bought somewhere else entirely — unlikely with one venue, a privacy
        # problem the day there are two.
        prev = await db.execute(
            select(OrderItem.name, OrderItem.menu_item_id, func.sum(OrderItem.quantity).label("qty"))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.session_token == session_token, Order.venue_id == venue.id)
            .group_by(OrderItem.menu_item_id, OrderItem.name)
            .order_by(func.sum(OrderItem.quantity).desc())
            .limit(3)
        )
        response["suggestions"] = [
            {"menu_item_id": str(r.menu_item_id), "name": r.name, "qty": int(r.qty)}
            for r in prev.all()
        ]

        # What this visit has run up so far, and whether it is finished.
        #
        # A phone keeps its session token, so without something to say "that
        # visit is over" the next scan reopens the last one and the bill grows
        # for ever — across parties, and eventually across nights. The page uses
        # `settled` to start a clean visit, and the summary to show a single
        # line rather than a receipt on top of the menu.
        live = await db.execute(
            select(Order)
            .where(Order.session_token == session_token, Order.venue_id == venue.id)
            .options(selectinload(Order.items))
        )
        orders = list(live.scalars().all())
        open_orders = [o for o in orders if o.status not in ("paid", "cancelled")]
        response["session"] = {
            "orders": len(orders),
            # Drinks, not order lines. Four shots on one line is four items to
            # the guest reading this, and a cancelled one is none.
            "items": sum(
                i.quantity for o in orders for i in o.items if i.status != "cancelled"
            ),
            "total": round(sum(float(o.grand_total or 0) for o in orders), 2),
            # Everything bought has been paid for: this party is done, and the
            # next person to scan this table should start with a clean bill.
            "settled": bool(orders) and not open_orders,
        }

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
    """The guest's own orders, with enough timing to track them.

    prep_minutes is filled in per item from the venue's settings so the guest
    page needs no second request and no knowledge of how the venue is
    configured.
    """
    result = await db.execute(
        select(Order)
        .where(Order.session_token == session_token)
        .options(selectinload(Order.items), selectinload(Order.table))
        .order_by(Order.created_at.asc())
    )
    orders = list(result.scalars().all())
    if not orders:
        return orders

    venue = (
        await db.execute(select(Venue).where(Venue.id == orders[0].venue_id))
    ).scalar_one_or_none()
    drink_mins = venue.drink_prep_minutes if venue else 5
    food_mins = venue.food_prep_minutes if venue else 15

    for order in orders:
        for item in order.items:
            item.prep_minutes = drink_mins if item.item_type == "drink" else food_mins
    return orders


@router.post("/alerts/{qr_token}", response_model=AlertResponse)
@limiter.limit("5/minute")
async def send_alert(request: Request, qr_token: str, req: AlertCreate, db: AsyncSession = Depends(get_db)):
    return await create_alert(db, qr_token, req.type, req.session_token)


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


@router.get("/pay-options/{session_token}")
async def payment_options(session_token: str, db: AsyncSession = Depends(get_db)):
    """What this guest can actually do to pay.

    The bill used to offer "Pay online" unconditionally, so a venue without a
    payment provider configured sent its guests to a button that answers with an
    error. Offering something that cannot work is worse than not offering it —
    the guest concludes the system is broken, not that this venue takes cash.
    """
    from app.services import paystack_service

    return {"online": paystack_service.is_enabled()}


@router.post("/pay/{session_token}")
@limiter.limit("10/minute")
async def initiate_customer_payment(
    request: Request,
    session_token: str,
    req: InitiateGatewayPayment,
    db: AsyncSession = Depends(get_db),
):
    """Start a Paystack checkout (card / bank transfer / USSD) for an order
    on this session. The webhook confirms it and issues the exit pass."""
    from app.services.payment_service import initiate_gateway_payment
    return await initiate_gateway_payment(db, session_token, req.order_id, req.email)


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
        # Shown under the QR so the door can type it when the camera will not
        # read the screen. Same pass, same single use, same expiry.
        "short_code": ep.short_code,
        "status": ep.status,
        "expires_at": ep.expires_at.isoformat(),
        "used_at": ep.used_at.isoformat() if ep.used_at else None,
    }

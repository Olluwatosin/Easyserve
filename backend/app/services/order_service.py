import uuid
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.menu_item import MenuItem
from app.models.table import Table
from app.models.user import User
from app.schemas.order import PlaceOrderRequest
from app.services.routing_service import determine_route, route_new_order
from app.services.promo_service import get_active_promos, apply_promo


async def place_order(db: AsyncSession, qr_token: str, req: PlaceOrderRequest) -> Order:
    # Resolve table
    result = await db.execute(
        select(Table).where(Table.qr_token == qr_token, Table.is_active == True)
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    venue_id = table.venue_id
    session_token = req.session_token or str(uuid.uuid4())

    # Resolve assigned attendant name for WS payload
    attendant_name = None
    if table.assigned_attendant_id:
        res = await db.execute(select(User).where(User.id == table.assigned_attendant_id))
        att = res.scalar_one_or_none()
        attendant_name = att.full_name if att else None

    # Get active promos
    promos = await get_active_promos(db, venue_id)

    # Build order items
    order_items = []
    total = 0.0
    for inp in req.items:
        res = await db.execute(
            select(MenuItem).where(MenuItem.id == inp.menu_item_id, MenuItem.venue_id == venue_id)
        )
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail=f"Menu item {inp.menu_item_id} not found")
        effective_price = apply_promo(item, promos)
        route = determine_route(item.item_type)
        order_item = OrderItem(
            id=str(uuid.uuid4()),
            menu_item_id=item.id,
            name=item.name,
            price=effective_price,
            quantity=inp.quantity,
            item_type=item.item_type,
            routed_to=route,
            notes=inp.notes,
        )
        # increment order_count
        item.order_count += inp.quantity
        total += effective_price * inp.quantity
        order_items.append(order_item)

    # Check for an existing open order on this session (add-to-order)
    existing_order = None
    if req.session_token:
        res = await db.execute(
            select(Order).where(
                Order.session_token == session_token,
                Order.status.in_(["open", "partially_served"]),
            )
        )
        existing_order = res.scalar_one_or_none()

    if existing_order:
        for oi in order_items:
            oi.order_id = existing_order.id
            db.add(oi)
        existing_order.total_amount = round(float(existing_order.total_amount) + total, 2)
        await db.commit()
        result = await db.execute(
            select(Order).where(Order.id == existing_order.id).options(selectinload(Order.items))
        )
        order = result.scalar_one()
    else:
        order = Order(
            id=str(uuid.uuid4()),
            venue_id=venue_id,
            table_id=table.id,
            assigned_to=table.assigned_attendant_id,
            session_token=session_token,
            order_source=req.order_source,
            total_amount=round(total, 2),
        )
        db.add(order)
        await db.flush()

        for oi in order_items:
            oi.order_id = order.id
            db.add(oi)

        await db.commit()
        result = await db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.items))
        )
        order = result.scalar_one()

    await route_new_order(venue_id, order, table.label, attendant_name)
    return order


async def get_order_by_session(db: AsyncSession, session_token: str) -> Order:
    result = await db.execute(
        select(Order)
        .where(Order.session_token == session_token)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

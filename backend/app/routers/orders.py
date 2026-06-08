from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_roles
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.table import Table
from app.models.user import User
from app.schemas.order import ItemStatusUpdate, OrderAssign, OrderResponse
from app.services.routing_service import broadcast_item_ready
from app.services.ws_manager import manager

router = APIRouter(prefix="/orders", tags=["orders"])


def _order_query():
    return (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.table))
    )


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    station: str | None = Query(None, description="Filter to orders with items for 'bar' or 'kitchen'"),
    current_user: User = Depends(require_roles("owner", "attendant", "bartender", "kitchen", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _order_query()
        .where(Order.venue_id == current_user.venue_id)
        .order_by(Order.created_at.desc())
        .limit(200)
    )
    orders = result.scalars().all()

    if station:
        orders = [
            o for o in orders
            if any(
                i.routed_to == station and i.status not in ("delivered", "cancelled")
                for i in o.items
            )
        ]
    return orders


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    current_user: User = Depends(require_roles("owner", "attendant", "bartender", "kitchen", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _order_query()
        .where(Order.id == order_id, Order.venue_id == current_user.venue_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/items/{item_id}/status")
async def update_item_status(
    item_id: str,
    req: ItemStatusUpdate,
    current_user: User = Depends(require_roles("owner", "attendant", "bartender", "kitchen")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrderItem)
        .where(OrderItem.id == item_id)
        .options(
            selectinload(OrderItem.order).options(
                selectinload(Order.items),
                selectinload(Order.table),
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item or item.order.venue_id != current_user.venue_id:
        raise HTTPException(status_code=404, detail="Item not found")

    if current_user.role == "bartender" and item.item_type != "drink":
        raise HTTPException(status_code=403, detail="Bartender can only update drink items")
    if current_user.role == "kitchen" and item.item_type != "food":
        raise HTTPException(status_code=403, detail="Kitchen can only update food items")

    item.status = req.status
    order = item.order

    # Auto-advance order status based on all items
    active_items = [i for i in order.items if i.status != "cancelled"]
    if active_items:
        delivered = sum(1 for i in active_items if i.status == "delivered")
        if delivered == len(active_items):
            order.status = "fully_served"
        elif delivered > 0:
            order.status = "partially_served"

    await db.commit()
    await db.refresh(item)

    venue_id = order.venue_id
    table_label = order.table.label if order.table else ""

    # Notify staff and customer
    await manager.broadcast_staff(
        venue_id,
        "order_item_update",
        {"item_id": item_id, "order_id": order.id, "status": req.status, "item_type": item.item_type},
    )
    if order.session_token:
        await manager.send_to_customer(
            order.session_token,
            "item_status_update",
            {"item_id": item_id, "status": req.status},
        )

    # Fire buzz notification when station marks ready
    if req.status == "ready":
        station = item.routed_to if item.routed_to != "none" else None
        if station:
            await broadcast_item_ready(
                venue_id,
                order.id,
                table_label,
                item.item_type,
                station,
                order.assigned_to,
            )

    return {"id": item_id, "status": req.status}


@router.patch("/{order_id}/assign")
async def reassign_order(
    order_id: str,
    req: OrderAssign,
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.venue_id == current_user.venue_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404)
    order.assigned_to = req.attendant_id
    await db.commit()
    return {"order_id": order_id, "assigned_to": req.attendant_id}

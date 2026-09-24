from datetime import datetime, timezone

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
from app.models.menu_item import MenuItem
from app.models.venue import Venue
from app.schemas.order import (
    CoversUpdate,
    ItemStatusUpdate,
    OrderAssign,
    OrderResponse,
    PlaceOrderRequest,
    StaffOrderRequest,
)
from app.services.audit_service import log_action
from app.services import stock_service
from app.services.order_service import apply_bill_charges, place_order
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

    # Attendants only see orders for their assigned tables.
    # Unassigned tables are visible to all attendants so nothing falls through.
    if current_user.role == "attendant":
        uid = current_user.id
        def _attendant_can_see(order: Order) -> bool:
            table = order.table
            if table is None:
                return True
            primary = table.assigned_attendant_id
            extra = [x for x in (table.extra_attendant_ids or "").split(",") if x.strip()]
            unassigned = primary is None and not extra
            return unassigned or primary == uid or uid in extra
        orders = [o for o in orders if _attendant_can_see(o)]

    if station:
        orders = [
            o for o in orders
            if any(
                i.routed_to == station and i.status not in ("delivered", "cancelled")
                for i in o.items
            )
        ]
    return orders


@router.post("", response_model=OrderResponse, status_code=201)
async def place_staff_order(
    req: StaffOrderRequest,
    current_user: User = Depends(
        require_roles("owner", "attendant", "cashier", "bartender")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Take an order for a guest who is not going to scan.

    This is the same order as any other once it exists: it routes to the bar and
    the kitchen, prices against the promotions running tonight, draws down stock
    and appears on every live screen. That is deliberate — it goes through
    `place_order`, the guest path, rather than a second implementation that
    would eventually disagree with it about a happy-hour price or a stock level.

    The table is addressed by id and looked up inside this venue, which is the
    security boundary: staff cannot reach a table belonging to anyone else. The
    QR token handed to `place_order` afterwards is just how that function
    addresses a table, not a check being bypassed.

    Kitchen and security are excluded. Neither takes orders at a table, and the
    narrower the set of people who can add to a bill, the shorter the list of
    people to ask when one is wrong.
    """
    result = await db.execute(
        select(Table).where(
            Table.id == req.table_id,
            Table.venue_id == current_user.venue_id,
            Table.is_active == True,
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    if not req.items:
        raise HTTPException(status_code=400, detail="Add at least one item")

    order = await place_order(
        db,
        table.qr_token,
        PlaceOrderRequest(
            items=req.items,
            order_source="walk_in",
            client_request_id=req.client_request_id,
            customer_phone=req.customer_phone,
        ),
    )

    # Whoever keyed it in owns it, even on a table with no attendant assigned —
    # otherwise a walk-in round belongs to nobody in the night's report.
    if order.assigned_to is None:
        order.assigned_to = current_user.id

    log_action(
        db,
        venue_id=current_user.venue_id,
        actor_id=current_user.id,
        action="order_taken_at_table",
        entity_type="order",
        entity_id=order.id,
        details={"table": table.label, "items": len(req.items)},
    )
    await db.commit()

    # Re-read rather than return the instance: the commit above expired it, and
    # the response body needs its items — which would otherwise be a lazy load
    # in the wrong place.
    reread = await db.execute(_order_query().where(Order.id == order.id))
    return reread.scalar_one()


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

    order = item.order
    # Paying and being served are different things, and a guest who settles up
    # front — which is what the online payment flow encourages — is still
    # waiting for the drink. This used to refuse *every* update on a paid
    # order, so a prepaid round froze at "pending" for good: the bar could not
    # mark it made, the floor's Served button did nothing, and the guest's
    # tracker never moved. The ticket stayed on the bar screen forever.
    #
    # What the rule was actually protecting is still protected. Voiding a line
    # after money has changed hands is the classic inside-theft vector, so that
    # single transition stays closed and points at the refund path instead.
    if order.status == "paid" and req.status == "cancelled":
        raise HTTPException(
            status_code=400,
            detail="This order is already paid — refund it rather than voiding the item",
        )

    # Voiding an item adjusts the bill and leaves an audit row — the classic
    # inside-theft vector is a quiet cancel after the customer paid cash.
    if req.status == "cancelled" and item.status != "cancelled":
        line_total = round(float(item.price) * item.quantity, 2)
        order.total_amount = max(0.0, round(float(order.total_amount) - line_total, 2))
        venue_res = await db.execute(select(Venue).where(Venue.id == order.venue_id))
        apply_bill_charges(order, venue_res.scalar_one())
        log_action(
            db,
            venue_id=order.venue_id,
            actor_id=current_user.id,
            action="item_voided",
            entity_type="order_item",
            entity_id=item.id,
            details={
                "order_id": order.id,
                "item_name": item.name,
                "quantity": item.quantity,
                "line_total": line_total,
                "previous_status": item.status,
            },
        )

        # Put the stock back. Without this every void reads as shrinkage on the
        # variance report, and the report that is meant to reveal theft becomes
        # the one nobody trusts.
        if item.menu_item_id:
            mi_res = await db.execute(
                select(MenuItem).where(MenuItem.id == item.menu_item_id)
            )
            menu_item = mi_res.scalar_one_or_none()
            if menu_item is not None:
                await stock_service.restore_for_void(
                    db, menu_item, item.quantity, order.id, current_user.id
                )

    # Stamp the transitions the guest's countdown is anchored to. Only on the
    # first move into each state, so a station correcting a mis-tap does not
    # restart a timer the guest is already watching.
    _now = datetime.now(timezone.utc)
    if req.status == "preparing" and item.accepted_at is None:
        item.accepted_at = _now
    if req.status == "ready" and item.ready_at is None:
        item.ready_at = _now

    item.status = req.status

    # Auto-advance order status based on all items.
    #
    # Never over "paid". One column is carrying two different facts — how far
    # the order has been served, and whether it has been settled — and settled
    # is the one that must win. Without this guard, serving a prepaid round
    # rewrites it to "fully_served": it reappears in the cashier's queue, shows
    # as owing on the floor, and the guest can be charged a second time for a
    # drink they already paid for.
    active_items = [i for i in order.items if i.status != "cancelled"]
    if active_items and order.status != "paid":
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


@router.patch("/{order_id}/covers", response_model=OrderResponse)
async def set_covers(
    order_id: str,
    req: CoversUpdate,
    current_user: User = Depends(
        require_roles("owner", "attendant", "cashier", "bartender")
    ),
    db: AsyncSession = Depends(get_db),
):
    """Record how many people are on a bill.

    Spend per head is the number a venue actually runs on — it decides whether a
    quiet night was quiet or merely small, and it is the difference between "we
    took less" and "fewer people came", which call for opposite responses. None
    of that can be computed from sales alone.

    Anyone on the floor can set it, because the person who knows is whoever is
    standing at the table. A paid bill stays editable: covers are usually
    remembered at the end of the night, and refusing the correction after
    payment is how the field ends up permanently blank.
    """
    if req.covers is not None and not (0 < req.covers <= 200):
        # A bill for zero people is a mistyped clear, and 200 at one table is a
        # mistyped anything.
        raise HTTPException(
            status_code=400, detail="Covers must be between 1 and 200"
        )

    result = await db.execute(
        _order_query().where(
            Order.id == order_id, Order.venue_id == current_user.venue_id
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.covers = req.covers
    await db.commit()

    result = await db.execute(_order_query().where(Order.id == order_id))
    return result.scalar_one()

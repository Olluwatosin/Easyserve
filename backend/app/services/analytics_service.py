from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.payment import Payment
from app.models.alert import Alert
from app.models.feedback import Feedback
from app.models.menu_item import MenuItem
from app.models.table import Table
from app.models.exit_pass import ExitPass
from app.models.user import User


async def get_summary(db: AsyncSession, venue_id: str) -> dict:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    rev = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.venue_id == venue_id, Payment.created_at >= today_start)
    )
    today_revenue = float(rev.scalar())

    active = await db.execute(
        select(func.count(Order.id))
        .where(Order.venue_id == venue_id, Order.status.in_(["open", "partially_served", "fully_served"]))
    )
    active_orders = int(active.scalar())

    served = await db.execute(
        select(func.count(func.distinct(Order.table_id)))
        .where(Order.venue_id == venue_id, Order.created_at >= today_start, Order.status == "paid")
    )
    tables_served = int(served.scalar())

    pending = await db.execute(
        select(func.count(Alert.id))
        .where(Alert.venue_id == venue_id, Alert.status == "pending")
    )
    pending_alerts = int(pending.scalar())

    return {
        "today_revenue": today_revenue,
        "active_orders": active_orders,
        "tables_served_today": tables_served,
        "pending_alerts": pending_alerts,
    }


async def get_tonight_summary(db: AsyncSession, venue_id: str) -> dict:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    rev = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.venue_id == venue_id, Payment.created_at >= today_start)
    )
    today_revenue = float(rev.scalar())

    total_orders_res = await db.execute(
        select(func.count(Order.id))
        .where(Order.venue_id == venue_id, Order.created_at >= today_start)
    )
    total_orders = int(total_orders_res.scalar())

    paid_res = await db.execute(
        select(func.count(Order.id))
        .where(Order.venue_id == venue_id, Order.created_at >= today_start, Order.status == "paid")
    )
    paid_orders = int(paid_res.scalar())

    tables_res = await db.execute(
        select(func.count(func.distinct(Order.table_id)))
        .where(Order.venue_id == venue_id, Order.created_at >= today_start, Order.status == "paid")
    )
    tables_served = int(tables_res.scalar())

    top_res = await db.execute(
        select(
            OrderItem.name,
            OrderItem.item_type,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.price * OrderItem.quantity).label("rev"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.venue_id == venue_id, Order.created_at >= today_start)
        .group_by(OrderItem.name, OrderItem.item_type)
        .order_by(func.sum(OrderItem.price * OrderItem.quantity).desc())
        .limit(5)
    )
    top_items = [
        {"name": r.name, "item_type": r.item_type, "qty": int(r.qty), "revenue": float(r.rev)}
        for r in top_res.all()
    ]

    return {
        "today_revenue": today_revenue,
        "total_orders": total_orders,
        "paid_orders": paid_orders,
        "tables_served": tables_served,
        "avg_order_value": round(today_revenue / paid_orders, 2) if paid_orders > 0 else 0.0,
        "top_items": top_items,
    }


async def get_peak_hours(db: AsyncSession, venue_id: str) -> list[dict]:
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    result = await db.execute(
        select(func.extract("hour", Order.created_at).label("hour"), func.count(Order.id).label("cnt"))
        .where(Order.venue_id == venue_id, Order.created_at >= seven_days_ago)
        .group_by("hour")
        .order_by("hour")
    )
    return [{"hour": int(r.hour), "order_count": r.cnt} for r in result.all()]


async def get_top_items(db: AsyncSession, venue_id: str) -> list[dict]:
    result = await db.execute(
        select(
            OrderItem.menu_item_id,
            OrderItem.name,
            OrderItem.item_type,
            func.sum(OrderItem.quantity).label("total_qty"),
            func.sum(OrderItem.price * OrderItem.quantity).label("total_rev"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.venue_id == venue_id)
        .group_by(OrderItem.menu_item_id, OrderItem.name, OrderItem.item_type)
        .order_by(func.sum(OrderItem.price * OrderItem.quantity).desc())
        .limit(20)
    )
    return [
        {"item_id": str(r.menu_item_id), "name": r.name, "item_type": r.item_type,
         "order_count": int(r.total_qty), "revenue": float(r.total_rev)}
        for r in result.all()
    ]


async def get_slow_tables(db: AsyncSession, venue_id: str) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=45)
    now = datetime.now(timezone.utc)

    # Single query: latest non-paid order per table, filtered to stale ones
    latest_subq = (
        select(
            Order.table_id,
            func.max(Order.updated_at).label("last_updated"),
        )
        .where(
            Order.venue_id == venue_id,
            Order.status.notin_(["paid", "cancelled"]),
        )
        .group_by(Order.table_id)
        .subquery()
    )

    result = await db.execute(
        select(Table.id, Table.label, Table.zone, latest_subq.c.last_updated)
        .join(latest_subq, latest_subq.c.table_id == Table.id)
        .where(
            Table.venue_id == venue_id,
            Table.is_active == True,
            latest_subq.c.last_updated < cutoff,
        )
    )

    return [
        {
            "table_id": row.id,
            "label": row.label,
            "zone": row.zone,
            "avg_minutes": int((now - row.last_updated).total_seconds() / 60),
        }
        for row in result.all()
    ]


async def get_staff_scores(db: AsyncSession, venue_id: str) -> list[dict]:
    # Single query: count delivered items per attendant
    result = await db.execute(
        select(
            User.id,
            User.full_name,
            func.count(OrderItem.id).label("delivered_count"),
        )
        .outerjoin(Order, Order.assigned_to == User.id)
        .outerjoin(
            OrderItem,
            and_(OrderItem.order_id == Order.id, OrderItem.status == "delivered"),
        )
        .where(User.venue_id == venue_id, User.role == "attendant", User.is_active == True)
        .group_by(User.id, User.full_name)
        .order_by(func.count(OrderItem.id).desc())
    )
    return [
        {
            "staff_id": row.id,
            "full_name": row.full_name,
            "orders_handled": int(row.delivered_count),
            "avg_minutes": 0.0,
        }
        for row in result.all()
    ]


async def get_feedback_summary(db: AsyncSession, venue_id: str) -> dict:
    result = await db.execute(
        select(func.avg(Feedback.rating), func.count(Feedback.id))
        .where(Feedback.venue_id == venue_id)
    )
    row = result.first()
    avg_rating = float(row[0]) if row and row[0] else 0.0
    total = int(row[1]) if row and row[1] else 0
    return {"avg_rating": round(avg_rating, 2), "total_responses": total}


async def get_inventory_alerts(db: AsyncSession, venue_id: str) -> list[dict]:
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.venue_id == venue_id,
            MenuItem.order_count >= MenuItem.stock_threshold,
            MenuItem.is_available == True,
        )
    )
    return [
        {"item_id": i.id, "name": i.name, "item_type": i.item_type,
         "order_count": i.order_count, "stock_threshold": i.stock_threshold}
        for i in result.scalars().all()
    ]


async def get_exit_pass_log(db: AsyncSession, venue_id: str) -> list[dict]:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(ExitPass, Order, Table)
        .join(Order, Order.id == ExitPass.order_id)
        .outerjoin(Table, Table.id == Order.table_id)
        .where(ExitPass.venue_id == venue_id, ExitPass.created_at >= today_start)
        .order_by(ExitPass.created_at.desc())
    )
    rows = []
    for ep, order, table in result.all():
        rows.append({
            "order_id": ep.order_id,
            "table_label": table.label if table else None,
            "status": ep.status,
            "created_at": ep.created_at.isoformat(),
            "used_at": ep.used_at.isoformat() if ep.used_at else None,
        })
    return rows

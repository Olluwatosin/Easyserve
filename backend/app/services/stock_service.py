"""Stock levels, movements, and variance.

Shrinkage is the loss a bar owner feels most and can see least. Sales are
recorded to the millilitre by the till while bottles leave through the back
door unrecorded, so the only number that matters is the gap between the two:

    expected = opening - sold + restocked - wasted
    variance = counted - expected

A negative variance is stock that left without being sold. That single figure,
per item, per night, is what this module exists to produce.

Items with `stock_quantity` NULL are not tracked and pass through untouched — a
cocktail mixed to order has no meaningful count.
"""
import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu_item import MenuItem
from app.models.stock_movement import StockMovement

logger = logging.getLogger(__name__)


def is_tracked(item: MenuItem) -> bool:
    return item.stock_quantity is not None


async def record_movement(
    db: AsyncSession,
    item: MenuItem,
    delta: int,
    reason: str,
    *,
    actor_id: str | None = None,
    order_id: str | None = None,
    note: str | None = None,
) -> StockMovement | None:
    """Apply a change and write it to the ledger. No-op for untracked items.

    Levels are floored at zero: a negative count on a shelf is not a fact about
    the world, it is a bookkeeping artefact, and letting it accumulate silently
    corrupts every variance that follows. The ledger still records what was
    asked for, so the discrepancy stays visible.
    """
    if not is_tracked(item):
        return None

    before = item.stock_quantity or 0
    after = max(0, before + delta)
    item.stock_quantity = after

    movement = StockMovement(
        id=str(uuid.uuid4()),
        venue_id=item.venue_id,
        menu_item_id=item.id,
        delta=delta,
        balance_after=after,
        reason=reason,
        actor_id=actor_id,
        order_id=order_id,
        note=note,
    )
    db.add(movement)

    if delta < 0 and before + delta < 0:
        logger.warning(
            "Stock for %s went below zero (had %d, sold %d) — floored at 0",
            item.name, before, -delta,
        )
    return movement


async def deplete_for_sale(
    db: AsyncSession, item: MenuItem, quantity: int, order_id: str
) -> None:
    await record_movement(db, item, -quantity, "sale", order_id=order_id)


async def restore_for_void(
    db: AsyncSession, item: MenuItem, quantity: int, order_id: str, actor_id: str | None
) -> None:
    """Put stock back when a line is voided, otherwise every cancellation looks
    like shrinkage and the variance report cries wolf."""
    await record_movement(
        db, item, quantity, "void", order_id=order_id, actor_id=actor_id,
        note="Item voided",
    )


async def list_stock(db: AsyncSession, venue_id: str) -> list[dict]:
    """Every tracked item with its level and whether it needs attention."""
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.venue_id == venue_id, MenuItem.stock_quantity.isnot(None))
        .order_by(MenuItem.name)
    )
    out = []
    for item in result.scalars().all():
        qty = item.stock_quantity or 0
        out.append({
            "item_id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "price": float(item.price),
            "stock_quantity": qty,
            "stock_pack_size": item.stock_pack_size or 1,
            "stock_threshold": item.stock_threshold,
            "is_low": qty <= item.stock_threshold,
            "is_out": qty == 0,
            "value": round(qty * float(item.price), 2),
        })
    return out


async def adjust_stock(
    db: AsyncSession,
    venue_id: str,
    item_id: str,
    delta: int,
    reason: str,
    actor_id: str,
    note: str | None = None,
) -> dict:
    """Restock, waste, or a manual correction."""
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.venue_id == venue_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise LookupError("Menu item not found")

    if item.stock_quantity is None:
        # Starting to track an item begins at zero, then applies the delta, so
        # "add 24" on an untracked bottle reads as 24 rather than as unknown.
        item.stock_quantity = 0

    await record_movement(
        db, item, delta, reason, actor_id=actor_id, note=note,
    )
    await db.commit()
    await db.refresh(item)
    return {
        "item_id": item.id,
        "name": item.name,
        "stock_quantity": item.stock_quantity,
        "is_low": (item.stock_quantity or 0) <= item.stock_threshold,
    }


async def _movements_since(
    db: AsyncSession, venue_id: str, since: datetime
) -> dict[str, dict[str, int]]:
    """Sum movements per item per reason strictly after a moment.

    Strictly after, not at-or-after: a count closes a period, so the correction
    it writes belongs to the period it closed. Including it would make every
    freshly-counted item report its own correction as a new discrepancy.
    """
    result = await db.execute(
        select(
            StockMovement.menu_item_id,
            StockMovement.reason,
            func.sum(StockMovement.delta).label("total"),
        )
        .where(StockMovement.venue_id == venue_id, StockMovement.created_at > since)
        .group_by(StockMovement.menu_item_id, StockMovement.reason)
    )
    out: dict[str, dict[str, int]] = {}
    for row in result.all():
        out.setdefault(row.menu_item_id, {})[row.reason] = int(row.total)
    return out


async def _last_count_at(db: AsyncSession, venue_id: str) -> datetime | None:
    result = await db.execute(
        select(func.max(StockMovement.created_at)).where(
            StockMovement.venue_id == venue_id, StockMovement.reason == "count"
        )
    )
    return result.scalar()


async def get_variance(db: AsyncSession, venue_id: str, since: datetime | None = None) -> dict:
    """What the books say should be on the shelf, versus what was counted.

    The period runs from the previous count to now, because that is the window
    a physical count actually covers.
    """
    period_start = since or await _last_count_at(db, venue_id)
    items_res = await db.execute(
        select(MenuItem)
        .where(MenuItem.venue_id == venue_id, MenuItem.stock_quantity.isnot(None))
        .order_by(MenuItem.name)
    )
    items = list(items_res.scalars().all())

    moves = await _movements_since(db, venue_id, period_start) if period_start else {}

    rows = []
    total_shrinkage_value = 0.0
    for item in items:
        m = moves.get(item.id, {})
        sold = -m.get("sale", 0)
        voided = m.get("void", 0)
        restocked = m.get("restock", 0)
        wasted = -m.get("waste", 0)
        adjusted = m.get("adjustment", 0)
        counted_delta = m.get("count", 0)

        # Everything except the count itself is the movement the books know about.
        # Variance is whatever the count had to correct on top of that.
        variance = counted_delta
        value = round(variance * float(item.price), 2)
        if variance < 0:
            total_shrinkage_value = round(total_shrinkage_value + abs(value), 2)

        rows.append({
            "item_id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "unit_price": float(item.price),
            "sold": sold,
            "voided": voided,
            "restocked": restocked,
            "wasted": wasted,
            "adjusted": adjusted,
            "on_hand": item.stock_quantity,
            "variance": variance,
            "variance_value": value,
        })

    return {
        "period_start": period_start.isoformat() if period_start else None,
        "counted": bool(period_start),
        "items": rows,
        "discrepancies": [r for r in rows if r["variance"] != 0],
        "shrinkage_value": total_shrinkage_value,
    }


async def submit_count(
    db: AsyncSession,
    venue_id: str,
    counts: dict[str, int],
    actor_id: str,
) -> dict:
    """Record a physical count and report what it had to correct.

    Each entry writes the difference between the counted figure and what the
    system believed, so the ledger keeps both the claim and the correction.
    """
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.venue_id == venue_id, MenuItem.id.in_(list(counts.keys()))
        )
    )
    items = {i.id: i for i in result.scalars().all()}
    if len(items) != len(counts):
        missing = set(counts) - set(items)
        raise LookupError(f"Unknown menu item(s): {', '.join(sorted(missing))}")

    lines = []
    shrinkage_value = 0.0
    for item_id, counted in counts.items():
        item = items[item_id]
        expected = item.stock_quantity or 0
        variance = counted - expected
        value = round(variance * float(item.price), 2)
        if variance < 0:
            shrinkage_value = round(shrinkage_value + abs(value), 2)

        if item.stock_quantity is None:
            item.stock_quantity = 0
        await record_movement(
            db, item, variance, "count", actor_id=actor_id,
            note=f"Counted {counted}, system had {expected}",
        )
        lines.append({
            "item_id": item.id,
            "name": item.name,
            "expected": expected,
            "counted": counted,
            "variance": variance,
            "variance_value": value,
            "unit_price": float(item.price),
        })

    await db.commit()
    lines.sort(key=lambda r: r["variance_value"])
    return {
        "counted_at": datetime.now().isoformat(),
        "lines": lines,
        "discrepancies": [r for r in lines if r["variance"] != 0],
        "shrinkage_value": shrinkage_value,
        "items_counted": len(lines),
    }

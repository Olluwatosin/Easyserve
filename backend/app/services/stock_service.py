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

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu_item import MenuItem
from app.models.stock_movement import StockMovement
from app.utils.venue_time import BUSINESS_DAY_START_HOUR, VENUE_TZ_NAME

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
        cost = float(item.unit_cost) if item.unit_cost is not None else None
        price = float(item.price)
        out.append({
            "item_id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "price": price,
            "unit_cost": cost,
            "stock_quantity": qty,
            "stock_pack_size": item.stock_pack_size or 1,
            "stock_threshold": item.stock_threshold,
            "is_low": qty <= item.stock_threshold,
            "is_out": qty == 0,
            # Stock on hand is worth what it cost, not what it might sell for.
            # Valuing it at the selling price overstates the shelf by the whole
            # margin and makes shrinkage look larger than the money actually
            # lost. None where the cost was never recorded — an unknown, said
            # plainly, rather than a zero that silently drags a total down.
            "value": round(qty * cost, 2) if cost is not None else None,
            "margin": round(price - cost, 2) if cost is not None else None,
            "margin_pct": (
                round((price - cost) / price * 100, 1)
                if cost is not None and price > 0
                else None
            ),
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


def _summarise_rate(rows) -> dict[str, tuple[float, int]]:
    per_item: dict[str, list[int]] = {}
    for item_id, _night, sold in rows:
        per_item.setdefault(item_id, []).append(int(sold or 0))
    out: dict[str, tuple[float, int]] = {}
    for item_id, sold_per_night in per_item.items():
        counted = len(sold_per_night)
        out[item_id] = (sum(sold_per_night) / counted, counted)
    return out


async def get_reorder_list(db: AsyncSession, venue_id: str) -> dict:
    """What to buy before the next busy night.

    Two numbers decide it, and they are different facts: the reorder point says
    *act*, the target says *how much*. A single threshold could only ever do the
    first, which is why the old low-stock warning told an owner something was
    wrong and nothing about what to do.

    Where there is enough trading history, each line also carries how many
    nights the current shelf will last. That is division, not prediction, and it
    is described as what it is — at the current rate. It stays silent until
    there are at least two trading nights behind it, because an average of one
    night is not an average, and a confident number from no evidence is worse
    than no number.
    """
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.venue_id == venue_id, MenuItem.stock_quantity.isnot(None))
        .order_by(MenuItem.name)
    )
    items = list(result.scalars().all())

    rate = await _sales_rate_by_night(db, venue_id)

    lines: list[dict] = []
    total_cost = 0.0
    priced_all = True
    for item in items:
        qty = item.stock_quantity or 0
        if qty > item.stock_threshold:
            continue

        pack = item.stock_pack_size or 1
        par = item.stock_par
        shortfall = max(0, par - qty) if par is not None else None
        # Ordering happens in whole cases, so round up to one.
        packs = -(-shortfall // pack) if shortfall else None
        units = packs * pack if packs else None

        cost = float(item.unit_cost) if item.unit_cost is not None else None
        line_cost = round(cost * units, 2) if (cost is not None and units) else None
        if line_cost is not None:
            total_cost += line_cost
        elif units:
            priced_all = False

        per_night, nights_counted = rate.get(item.id, (0.0, 0))
        nights_left = (
            round(qty / per_night, 1)
            if per_night > 0 and nights_counted >= 2
            else None
        )

        lines.append({
            "item_id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "on_hand": qty,
            "reorder_at": item.stock_threshold,
            "par": par,
            "pack_size": pack,
            "suggested_packs": packs,
            "suggested_units": units,
            "unit_cost": cost,
            "line_cost": line_cost,
            "is_out": qty == 0,
            # Silent until there is enough history to mean anything.
            "sells_per_night": round(per_night, 1) if nights_counted >= 2 else None,
            "nights_of_cover": nights_left,
            "nights_counted": nights_counted,
        })

    return {
        "lines": lines,
        "count": len(lines),
        "out_of_stock": sum(1 for l in lines if l["is_out"]),
        "no_target_set": sum(1 for l in lines if l["par"] is None),
        "estimated_cost": round(total_cost, 2),
        "fully_priced": priced_all,
    }


async def _sales_rate_by_night(
    db: AsyncSession, venue_id: str, nights: int = 28
) -> dict[str, tuple[float, int]]:
    """Units sold per trading night, per item — see `get_reorder_list`."""
    night = (
        func.date(
            func.timezone(VENUE_TZ_NAME, StockMovement.created_at)
            - text(f"INTERVAL '{BUSINESS_DAY_START_HOUR} hours'")
        )
    ).label("night")

    rows = await db.execute(
        select(
            StockMovement.menu_item_id,
            night,
            func.sum(-StockMovement.delta).label("sold"),
        )
        .where(
            StockMovement.venue_id == venue_id,
            StockMovement.reason == "sale",
            StockMovement.created_at >= func.now() - text(f"INTERVAL '{nights} days'"),
        )
        .group_by(StockMovement.menu_item_id, night)
    )
    return _summarise_rate(rows.all())


async def receive_delivery(
    db: AsyncSession,
    venue_id: str,
    lines: list[dict],
    actor_id: str,
    *,
    reference: str | None = None,
    supplier: str | None = None,
) -> dict:
    """Book in a delivery — the other half of stock, and the half that was missing.

    Everything until now could only take stock *out*: sales deplete it, voids
    return it, a count corrects it. Stock arriving had to be entered one item at
    a time as a manual adjustment, which is neither how a delivery arrives nor
    how anyone would choose to enter thirty lines off an invoice.

    Three things it does that a loop of `adjust_stock` would not:

    **It is one transaction.** A delivery is booked in whole or not at all.
    Half a delivery committed because the tenth line named a deleted item is a
    stock level nobody can reconcile against the paper it came from.

    **It counts in the units the invoice uses.** A lounge buys beer in crates
    and spirits by the bottle. `packs` is multiplied by the item's own pack
    size, so what gets typed matches what was delivered.

    **It is where cost gets updated.** Cost moves with every delivery, and this
    is the one moment the venue is holding the invoice that proves the new one.
    Asking later means never.
    """
    if not lines:
        raise ValueError("A delivery needs at least one line")

    ids = [str(l["item_id"]) for l in lines]
    result = await db.execute(
        select(MenuItem).where(MenuItem.id.in_(ids), MenuItem.venue_id == venue_id)
    )
    items = {i.id: i for i in result.scalars().all()}

    missing = [i for i in ids if i not in items]
    if missing:
        # Named rather than counted: the person is looking at an invoice and
        # needs to know which line to fix.
        raise LookupError(f"{len(missing)} item(s) on this delivery are not on the menu")

    note = " · ".join(p for p in [supplier, reference] if p) or None
    booked = []
    for line in lines:
        item = items[str(line["item_id"])]
        packs = int(line.get("packs") or 0)
        units = int(line.get("units") or 0)
        total = packs * (item.stock_pack_size or 1) + units
        if total <= 0:
            continue

        if item.stock_quantity is None:
            # Receiving an untracked item starts tracking it, beginning at zero,
            # so "24 delivered" reads as 24 rather than as unknown.
            item.stock_quantity = 0

        # The invoice is the evidence, so this is the cost we believe.
        new_cost = line.get("unit_cost")
        cost_changed = None
        if new_cost is not None:
            before = float(item.unit_cost) if item.unit_cost is not None else None
            if before != float(new_cost):
                cost_changed = {"from": before, "to": float(new_cost)}
            item.unit_cost = float(new_cost)

        await record_movement(
            db, item, total, "restock", actor_id=actor_id, note=note,
        )
        booked.append({
            "item_id": item.id,
            "name": item.name,
            "received": total,
            "stock_quantity": item.stock_quantity,
            "cost_changed": cost_changed,
        })

    if not booked:
        raise ValueError("Every line on this delivery was zero")

    await db.commit()

    value = sum(
        (float(items[b["item_id"]].unit_cost) or 0) * b["received"]
        for b in booked
        if items[b["item_id"]].unit_cost is not None
    )
    return {
        "reference": reference,
        "supplier": supplier,
        "lines": booked,
        "items_received": len(booked),
        "units_received": sum(b["received"] for b in booked),
        "value": round(value, 2),
        # Whether the total above covers everything, so the UI does not present
        # a partial figure as the cost of the delivery.
        "fully_priced": all(items[b["item_id"]].unit_cost is not None for b in booked),
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

        # Missing stock is valued at what it cost the venue, not at what it
        # would have sold for. A bottle that walks costs the owner its purchase
        # price; counting the lost margin as well inflates shrinkage into a
        # number nobody believes, and a number nobody believes gets ignored.
        cost = float(item.unit_cost) if item.unit_cost is not None else None
        value = round(variance * cost, 2) if cost is not None else None
        if variance < 0 and value is not None:
            total_shrinkage_value = round(total_shrinkage_value + abs(value), 2)

        rows.append({
            "item_id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "unit_price": float(item.price),
            "unit_cost": cost,
            "sold": sold,
            "voided": voided,
            "restocked": restocked,
            "wasted": wasted,
            "adjusted": adjusted,
            "on_hand": item.stock_quantity,
            "variance": variance,
            "variance_value": value,
        })

    # Shrinkage that could not be priced is reported separately rather than
    # folded into the total as zero. "₦84,000 short, and 3 items we cannot
    # value" is honest; a single total that quietly omits them is not.
    unpriced = [r for r in rows if r["variance"] < 0 and r["variance_value"] is None]

    return {
        "period_start": period_start.isoformat() if period_start else None,
        "counted": bool(period_start),
        "items": rows,
        "discrepancies": [r for r in rows if r["variance"] != 0],
        "shrinkage_value": total_shrinkage_value,
        "unpriced_shortfalls": [
            {"item_id": r["item_id"], "name": r["name"], "variance": r["variance"]}
            for r in unpriced
        ],
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

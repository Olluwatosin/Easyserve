from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.promo import Promo
from app.models.menu_item import MenuItem


async def get_active_promos(db: AsyncSession, venue_id: str) -> list[Promo]:
    result = await db.execute(
        select(Promo).where(Promo.venue_id == venue_id, Promo.is_active == True)
    )
    return list(result.scalars().all())


def apply_promo(item: MenuItem, promos: list[Promo]) -> float:
    now = datetime.now(timezone.utc)
    current_time = now.time()
    day_name = now.strftime("%A").lower()

    best_discount = 0.0
    for promo in promos:
        if not promo.is_active:
            continue
        # Check time window
        if not (promo.start_time <= current_time <= promo.end_time):
            continue
        # Check day (empty list or None means all days active)
        if promo.days_active and day_name not in [d.lower() for d in promo.days_active]:
            continue
        # Check applies_to (category IDs or item IDs; empty means all items)
        if promo.applies_to and item.id not in promo.applies_to and (item.category_id not in promo.applies_to if item.category_id else True):
            continue
        if float(promo.discount_pct) > best_discount:
            best_discount = float(promo.discount_pct)

    if best_discount > 0:
        return round(float(item.price) * (1 - best_discount / 100), 2)
    return float(item.price)

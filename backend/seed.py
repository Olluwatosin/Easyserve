"""
Seed script — run inside the backend container:
  docker compose exec backend python seed.py

Creates:
  - Venue: The Grand Noir
  - Owner login: owner@grandnoir.com / GrandNoir2024!
  - 5 staff members (each with a 4-digit PIN)
  - 3 table zones (VIP, Main Floor, Terrace)
  - Full menu (drinks + food across 4 categories)
  - 3 promos
  - A Saturday night mid-service: settled tables, tables awaiting payment,
    orders being prepared, and a couple just placed
  - Exit passes for paid orders

Staff PINs:
  Emeka (bartender)  → 1111
  Ngozi  (kitchen)   → 2222
  Tunde  (cashier)   → 3333
  Amara  (attendant) → 4444
  Olu    (security)  → 5555
"""

import asyncio
import uuid
from datetime import datetime, time, timezone, timedelta

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.config import settings
from app.models.venue import Venue
from app.models.user import User
from app.models.table import Table
from app.models.menu_category import MenuCategory
from app.models.promo import Promo
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.payment import Payment
from app.models.exit_pass import ExitPass
from app.utils.security import hash_password, generate_exit_pass_token

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

def nid(): return str(uuid.uuid4())

MENU = [
    # (category_name, sort_order, items: [(name, price, type, description)])
    ("Premium Spirits", 1, [
        ("Hennessy VS",         8_500,  "drink", "Classic cognac, smooth finish"),
        ("Hennessy XO",        28_000,  "drink", "Ultra-premium aged cognac"),
        ("Johnnie Walker Black", 9_000, "drink", "Aged 12 years, smoky complexity"),
        ("Ciroc Vodka",         7_500,  "drink", "French grape vodka, ultra-smooth"),
        ("Don Julio Tequila",  14_000,  "drink", "Premium 100% agave"),
        ("Moët & Chandon",     35_000,  "drink", "Iconic champagne, celebration ready"),
    ]),
    ("Cocktails & Mixers", 2, [
        ("Mojito",              3_500,  "drink", "Fresh mint, lime, rum & soda"),
        ("Margarita",           3_800,  "drink", "Tequila, triple sec, lime"),
        ("Long Island Iced Tea", 4_200, "drink", "5-spirit classic, lemon, cola"),
        ("Passion Fruit Daiquiri", 3_600, "drink", "House favourite — tropical sweet"),
        ("Classic Negroni",     4_000,  "drink", "Gin, vermouth, Campari, orange"),
        ("Whiskey Sour",        3_800,  "drink", "Bourbon, lemon, honey syrup"),
    ]),
    ("Beers & Ciders", 3, [
        ("Star Lager",            1_500,  "drink", "Chilled, 60cl"),
        ("Gulder",                1_600,  "drink", "Full-bodied lager"),
        ("Trophy",                1_400,  "drink", "Light and crisp"),
        ("Heineken",              2_500,  "drink", "Imported premium lager"),
        ("Legend Extra Stout",    1_800,  "drink", "Rich, dark, full stout"),
        ("Guinness Foreign Extra",2_200,  "drink", "The classic stout"),
        ("Orijin Bitters",        1_700,  "drink", "Herbal, bittersweet"),
        ("Smirnoff Ice",          2_000,  "drink", "Ready-to-drink, citrus"),
    ]),
    ("Small Plates", 4, [
        ("Grilled Tiger Prawns",   12_000, "food", "Flame-grilled, garlic butter sauce"),
        ("Beef Suya Skewers",       8_500, "food", "Spiced wagyu skewers, peanut dip"),
        ("Truffle Fries",           4_500, "food", "Hand-cut, truffle oil, parmesan"),
        ("Lobster Sliders",        15_000, "food", "Butter-poached lobster, brioche"),
        ("Peppersoup (Goatmeat)",   6_500, "food", "Spicy, aromatic, slow-cooked"),
        ("Crispy Calamari",         7_000, "food", "Lemon aioli, chilli flakes"),
    ]),
    ("Bottles & Packages", 5, [
        ("Ace of Spades (Gold)",  180_000, "drink", "Gold bottle, table service"),
        ("Dom Pérignon",          120_000, "drink", "Vintage champagne, prestige cuvée"),
        ("Hennessy Paradis",       95_000, "drink", "Rare blend, ultra-premium cognac"),
    ]),
]

TABLES = [
    # (label, zone, capacity)
    ("VIP 1",   "VIP",        6),
    ("VIP 2",   "VIP",        6),
    ("VIP 3",   "VIP",        8),
    ("Table 1", "Main Floor", 4),
    ("Table 2", "Main Floor", 4),
    ("Table 3", "Main Floor", 4),
    ("Table 4", "Main Floor", 4),
    ("Terrace 1", "Terrace",  4),
    ("Terrace 2", "Terrace",  4),
    ("Bar",     "Bar",        2),
]

# Opening stock for the demo: a couple deliberately low so the alerts have
# something to show, and one at zero so "out of stock" is visible too.
# Case goods: how many units come in a crate. Beer is bought, delivered and
# counted by the crate, never bottle by bottle.
PACK_SIZES = {
    "Star Lager": 24, "Gulder": 24, "Trophy": 24, "Heineken": 24,
    "Legend Extra Stout": 24, "Guinness Foreign Extra": 24,
    "Orijin Bitters": 24, "Smirnoff Ice": 24,
}

STOCK_LEVELS = {
    "Hennessy XO": 2,
    "Ace of Spades (Gold)": 0,
    "Dom Pérignon": 3,
    "Moët & Chandon": 11,
    "Hennessy VS": 24,
    "Johnnie Walker Black": 16,
    # Beer moves in volume: whole crates plus whatever is loose in the fridge.
    "Star Lager": 288,               # 12 crates
    "Gulder": 174,                   # 7 crates + 6
    "Trophy": 96,                    # 4 crates
    "Heineken": 41,
    "Legend Extra Stout": 120,
    "Guinness Foreign Extra": 72,
    "Orijin Bitters": 18,            # under a crate — reorder
    "Smirnoff Ice": 55,
}

STAFF = [
    # (full_name, email, role, zone, pin)
    ("Emeka Okafor",  "emeka@grandnoir.com",  "bartender", "Main Bar",   "1111"),
    ("Ngozi Adeyemi", "ngozi@grandnoir.com",  "kitchen",   "Kitchen",    "2222"),
    ("Tunde Balogun", "tunde@grandnoir.com",  "cashier",   None,         "3333"),
    ("Amara Eze",     "amara@grandnoir.com",  "attendant", "VIP",        "4444"),
    ("Olu Fasanya",   "olu@grandnoir.com",    "security",  "Entrance",   "5555"),
]


async def seed():
    async with AsyncSessionLocal() as db:

        # ── Venue + owner ────────────────────────────────────────────────────
        existing = await db.execute(select(Venue).where(Venue.slug == "the-grand-noir"))
        if existing.scalar_one_or_none():
            print("Seed already exists — clearing and re-seeding...")
            # Simple approach: just proceed, duplicates will be skipped or errored
            # Better: wipe and redo
            from sqlalchemy import text
            for tbl in ["exit_passes","payments","order_items","orders","alerts","feedback",
                        "promos","audit_logs","menu_items","menu_categories","tables","users","venues"]:
                await db.execute(text(f"DELETE FROM {tbl} WHERE TRUE"))
            await db.commit()
            print("Cleared existing data.")

        venue_id = nid()
        venue = Venue(
            id=venue_id,
            name="The Grand Noir",
            slug="the-grand-noir",
            city="Lagos",
            phone="+234 901 234 5678",
            plan="pro",
        )
        db.add(venue)

        owner_id = nid()
        owner = User(
            id=owner_id,
            venue_id=venue_id,
            full_name="Tosin Salami",
            email="owner@grandnoir.com",
            password_hash=hash_password("GrandNoir2024!"),
            role="owner",
        )
        db.add(owner)
        await db.flush()

        # ── Staff ────────────────────────────────────────────────────────────
        staff_ids = {}
        for full_name, email, role, zone, pin in STAFF:
            uid = nid()
            staff_ids[role] = uid
            db.add(User(
                id=uid,
                venue_id=venue_id,
                full_name=full_name,
                email=email,
                password_hash=hash_password("Staff2024!"),
                pin_hash=hash_password(pin),
                role=role,
                zone=zone,
            ))
        await db.flush()

        # ── Tables ───────────────────────────────────────────────────────────
        table_map = {}
        for label, zone, capacity in TABLES:
            tid = nid()
            table_map[label] = tid
            db.add(Table(
                id=tid,
                venue_id=venue_id,
                label=label,
                capacity=capacity,
                zone=zone,
                qr_token=nid(),
                # Amara covers VIP and the main floor; the terrace and bar are
                # uncovered, which is normal and exercises both routing paths —
                # an alert aimed at one attendant, and one that opens to the
                # whole floor because nobody owns the table.
                assigned_attendant_id=(
                    staff_ids.get("attendant")
                    if zone in ("VIP", "Main Floor")
                    else None
                ),
            ))
        await db.flush()

        # ── Menu ─────────────────────────────────────────────────────────────
        item_map = {}  # name → (id, price, type)
        cat_map = {}   # category name → id
        for cat_name, sort_order, items in MENU:
            cat_id = nid()
            cat_map[cat_name] = cat_id
            db.add(MenuCategory(
                id=cat_id,
                venue_id=venue_id,
                name=cat_name,
                sort_order=sort_order,
            ))
            await db.flush()
            for name, price, itype, desc in items:
                iid = nid()
                item_map[name] = (iid, price, itype)
                # Bottles and packages are counted; cocktails mixed to order
                # and kitchen plates are not, which is how a real bar works.
                tracked = cat_name in (
                    "Premium Spirits", "Bottles & Packages", "Beers & Ciders"
                )
                pack = PACK_SIZES.get(name, 1)
                db.add(MenuItem(
                    id=iid,
                    venue_id=venue_id,
                    category_id=cat_id,
                    name=name,
                    price=price,
                    item_type=itype,
                    description=desc,
                    stock_quantity=STOCK_LEVELS.get(name, 18) if tracked else None,
                    stock_pack_size=pack,
                    # Reorder a case good when it drops below one full crate;
                    # spirits when only a few bottles remain.
                    stock_threshold=(pack if pack > 1 else 3) if tracked else 10,
                ))
        await db.flush()

        _known = {n for _, _, items in MENU for n, *_ in items}
        _typos = (set(STOCK_LEVELS) | set(PACK_SIZES)) - _known
        assert not _typos, f"STOCK_LEVELS names not on the menu: {sorted(_typos)}"

        # ── Promos ───────────────────────────────────────────────────────────
        # Two of these run all day so a visitor always sees promo pricing
        # whenever they open the demo link. The third is a genuine nightlife
        # window that wraps past midnight — the shape that silently never fired
        # before, kept here so the demo proves it does now.
        ALL_DAY = (time(0, 0), time(23, 59))
        db.add(Promo(
            id=nid(), venue_id=venue_id, name="Ladies' Night — 20% off cocktails",
            discount_pct=20, start_time=ALL_DAY[0], end_time=ALL_DAY[1],
            days_active=[], applies_to=[cat_map["Cocktails & Mixers"]], is_active=True,
        ))
        # 10pm till 2am, Fridays and Saturdays — a window that crosses midnight.
        db.add(Promo(
            id=nid(), venue_id=venue_id, name="Late Night — 25% off beers",
            discount_pct=25, start_time=time(22, 0), end_time=time(2, 0),
            days_active=["friday", "saturday"],
            applies_to=[cat_map["Beers & Ciders"]], is_active=True,
        ))
        db.add(Promo(
            id=nid(), venue_id=venue_id, name="Kitchen Special — 15% off small plates",
            discount_pct=15, start_time=ALL_DAY[0], end_time=ALL_DAY[1],
            days_active=[], applies_to=[cat_map["Small Plates"]], is_active=True,
        ))
        db.add(Promo(
            id=nid(), venue_id=venue_id, name="Bottle Service — 10% off packages",
            discount_pct=10, start_time=ALL_DAY[0], end_time=ALL_DAY[1],
            days_active=[], applies_to=[cat_map["Bottles & Packages"]], is_active=True,
        ))
        await db.flush()

        # ── Orders ───────────────────────────────────────────────────────────
        now = datetime.now(timezone.utc)

        def make_order(table_label, items_spec, status):
            """items_spec: [(item_name, qty)]"""
            oid = nid()
            session = nid()
            total = sum(item_map[n][1] * q for n, q in items_spec)

            order = Order(
                id=oid,
                venue_id=venue_id,
                table_id=table_map[table_label],
                assigned_to=staff_ids.get("attendant"),
                session_token=session,
                status=status,
                order_source="qr_scan",
                total_amount=total,
            )
            # Caller sets created_at; the spread across the evening is the
            # whole point of the seed.
            return oid, session, total, order

        def make_items(order_id, items_spec, item_status="ready"):
            ois = []
            for name, qty in items_spec:
                iid, price, itype = item_map[name]
                route = "bar" if itype == "drink" else "kitchen"
                ois.append(OrderItem(
                    id=nid(),
                    order_id=order_id,
                    menu_item_id=iid,
                    name=name,
                    price=price,
                    quantity=qty,
                    item_type=itype,
                    routed_to=route,
                    status=item_status,
                ))
            return ois

        # ── A Saturday night, mid-service ────────────────────────────────────
        # The demo reseeds hourly, so timings are relative to now. Every order is
        # kept inside the current business day (which rolls at 6AM, not midnight)
        # so tonight's revenue always adds up — otherwise a visitor at 7AM would
        # see a venue with orders and zero takings.
        #
        # The spread is the point: an owner opening this should see a room in
        # motion — tables settled and gone, tables eating, tables that just
        # ordered — not six rows all stamped the same minute.
        from app.utils.venue_time import business_day_start

        day_start = business_day_start()
        earliest = max(day_start + timedelta(minutes=5), now - timedelta(hours=5))
        span = (now - timedelta(minutes=2)) - earliest

        def at(fraction: float) -> datetime:
            """A point through the evening, 0.0 earliest to 1.0 most recent."""
            return earliest + span * fraction

        # (table, when, items, item_status, order_status)
        # Beer runs through most tickets because that is what a lounge sells;
        # the bottle-service tables are the exception, not the norm.
        NIGHT = [
            # settled and gone
            ("Table 1",   0.00, [("Star Lager", 4), ("Beef Suya Skewers", 2)],                    "delivered", "paid"),
            ("Terrace 1", 0.10, [("Gulder", 6), ("Peppersoup (Goatmeat)", 2)],                    "delivered", "paid"),
            ("VIP 1",     0.18, [("Moët & Chandon", 1), ("Grilled Tiger Prawns", 2)],             "delivered", "paid"),
            ("Table 2",   0.30, [("Trophy", 5), ("Truffle Fries", 2), ("Mojito", 2)],             "delivered", "paid"),
            ("Bar",       0.38, [("Heineken", 3), ("Crispy Calamari", 1)],                        "delivered", "paid"),

            # served, still owing — the cashier's queue
            ("VIP 2",     0.52, [("Ace of Spades (Gold)", 1), ("Don Julio Tequila", 2)],          "delivered", "fully_served"),
            ("Table 3",   0.60, [("Legend Extra Stout", 4), ("Lobster Sliders", 2)],              "delivered", "fully_served"),
            ("Terrace 2", 0.66, [("Star Lager", 6), ("Grilled Tiger Prawns", 1)],                 "delivered", "fully_served"),

            # mid-service
            ("VIP 3",     0.74, [("Dom Pérignon", 1), ("Hennessy XO", 1), ("Crispy Calamari", 2)], "ready",     "partially_served"),
            ("Table 4",   0.82, [("Guinness Foreign Extra", 4), ("Peppersoup (Goatmeat)", 2)],     "preparing", "open"),
            ("Table 1",   0.90, [("Smirnoff Ice", 4), ("Truffle Fries", 1)],                      "preparing", "open"),

            # just landed — these are what the bar and kitchen screens show
            ("Terrace 1", 0.96, [("Orijin Bitters", 3), ("Beef Suya Skewers", 1)],                "pending",   "open"),
            ("Table 2",   1.00, [("Gulder", 2), ("Margarita", 2)],                                "pending",   "open"),
        ]

        paid_orders = []
        order_times: dict[str, datetime] = {}
        for table_label, when, spec, item_status, order_status in NIGHT:
            oid, sess, total, order = make_order(table_label, spec, order_status)
            order.created_at = at(when)
            order.updated_at = at(min(1.0, when + 0.02))
            order_times[oid] = order.created_at
            db.add(order)
            for oi in make_items(oid, spec, item_status):
                db.add(oi)
            if order_status == "paid":
                paid_orders.append((oid, venue_id, total, sess))

        await db.flush()

        # ── Payments + Exit passes for paid orders ───────────────────────────
        # A realistic mix, so the shift report demonstrates what it is for: a
        # webhook-confirmed transfer, cash counted by hand, and one transfer the
        # cashier simply asserted — the row an owner is meant to reconcile.
        # provider_ref is unique, so references are generated per order rather
        # than shared across the mix — five paid tables cycling three payment
        # types would otherwise collide on the second lap.
        PAYMENT_MIX = [
            ("transfer", "gateway"),
            ("cash",     "cash"),
            ("transfer", "manual"),
        ]
        for idx, (order_id, v_id, amount, session) in enumerate(paid_orders):
            method, verification = PAYMENT_MIX[idx % len(PAYMENT_MIX)]
            provider = "paystack" if verification == "gateway" else None
            reference = (
                f"es_demo_{idx}{nid()[:8]}" if verification == "gateway"
                else f"GTB/TRF/{4471900 + idx * 137}" if verification == "manual"
                else None
            )
            pay_id = nid()
            paid_at = order_times.get(order_id, now)
            payment = Payment(
                id=pay_id,
                order_id=order_id,
                venue_id=v_id,
                amount=amount,
                method=method,
                verification=verification,
                provider=provider,
                provider_ref=reference if provider else None,
                transfer_reference=reference if verification == "manual" else None,
                recorded_by=None if verification == "gateway" else staff_ids.get("cashier"),
            )
            # A payment lands minutes after the table finished, not at reset time.
            payment.created_at = paid_at + timedelta(minutes=6)
            db.add(payment)
            ep_token = generate_exit_pass_token(order_id, v_id)
            db.add(ExitPass(
                id=nid(),
                order_id=order_id,
                venue_id=v_id,
                token=ep_token,
                expires_at=now + timedelta(minutes=10),
                used_at=now - timedelta(minutes=2),
                delivery_method="cashier_screen",
            ))

        await db.commit()

        print("\n✅ Seed complete!\n")
        print("=" * 50)
        print("OWNER LOGIN")
        print("  URL:      http://localhost:3001/login")
        print("  Email:    owner@grandnoir.com")
        print("  Password: GrandNoir2024!")
        print()
        print("STAFF PIN LOGIN")
        print("  URL:      http://localhost:3001/pin-login")
        print("  Venue ID: the-grand-noir")
        print()
        print("  Emeka  (Bartender)  → PIN 1111")
        print("  Ngozi  (Kitchen)    → PIN 2222")
        print("  Tunde  (Cashier)    → PIN 3333")
        print("  Amara  (Attendant)  → PIN 4444")
        print("  Olu    (Security)   → PIN 5555")
        print()
        print("LIVE DATA")
        print(f"  {len(NIGHT)} orders across the evening, {len(paid_orders)} settled")
        print("  3 tables served and awaiting payment (cashier queue)")
        print("  2 orders just placed (bar & kitchen screens)")
        print("  1 transfer flagged for the owner to reconcile")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(seed())

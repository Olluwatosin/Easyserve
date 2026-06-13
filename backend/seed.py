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
  - 8 orders spread across today (some paid, some active)
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
from datetime import datetime, timezone, timedelta

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
    ("Small Plates", 3, [
        ("Grilled Tiger Prawns",   12_000, "food", "Flame-grilled, garlic butter sauce"),
        ("Beef Suya Skewers",       8_500, "food", "Spiced wagyu skewers, peanut dip"),
        ("Truffle Fries",           4_500, "food", "Hand-cut, truffle oil, parmesan"),
        ("Lobster Sliders",        15_000, "food", "Butter-poached lobster, brioche"),
        ("Peppersoup (Goatmeat)",   6_500, "food", "Spicy, aromatic, slow-cooked"),
        ("Crispy Calamari",         7_000, "food", "Lemon aioli, chilli flakes"),
    ]),
    ("Bottles & Packages", 4, [
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
    ("T1",      "Terrace",    4),
    ("T2",      "Terrace",    4),
    ("Bar",     "Bar",        2),
]

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
            for tbl in ["exit_passes","payments","order_items","orders",
                        "menu_items","menu_categories","tables","users","venues"]:
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
                assigned_attendant_id=staff_ids.get("attendant"),
            ))
        await db.flush()

        # ── Menu ─────────────────────────────────────────────────────────────
        item_map = {}  # name → (id, price, type)
        for cat_name, sort_order, items in MENU:
            cat_id = nid()
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
                db.add(MenuItem(
                    id=iid,
                    venue_id=venue_id,
                    category_id=cat_id,
                    name=name,
                    price=price,
                    item_type=itype,
                    description=desc,
                ))
        await db.flush()

        # ── Orders ───────────────────────────────────────────────────────────
        now = datetime.now(timezone.utc)

        def make_order(table_label, items_spec, status, paid=False, hours_ago=0):
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
            # backdate created_at
            order.created_at = now - timedelta(hours=hours_ago, minutes=15)
            order.updated_at = now - timedelta(minutes=5)
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

        paid_orders = []

        # 1. VIP 1 — paid, 2 hours ago
        oid, sess, total, order = make_order("VIP 1",
            [("Moët & Chandon", 1), ("Grilled Tiger Prawns", 2), ("Truffle Fries", 1)],
            "paid", hours_ago=2)
        db.add(order)
        for oi in make_items(oid, [("Moët & Chandon", 1), ("Grilled Tiger Prawns", 2), ("Truffle Fries", 1)], "delivered"):
            db.add(oi)
        paid_orders.append((oid, venue_id, total, sess))

        # 2. Table 1 — paid, 1.5 hours ago
        oid2, sess2, total2, order2 = make_order("Table 1",
            [("Hennessy VS", 2), ("Mojito", 2), ("Beef Suya Skewers", 1)],
            "paid", hours_ago=1)
        db.add(order2)
        for oi in make_items(oid2, [("Hennessy VS", 2), ("Mojito", 2), ("Beef Suya Skewers", 1)], "delivered"):
            db.add(oi)
        paid_orders.append((oid2, venue_id, total2, sess2))

        # 3. Table 2 — paid, 45 min ago
        oid3, sess3, total3, order3 = make_order("Table 2",
            [("Ciroc Vodka", 1), ("Passion Fruit Daiquiri", 3), ("Lobster Sliders", 2)],
            "paid", hours_ago=0)
        order3.created_at = now - timedelta(minutes=50)
        db.add(order3)
        for oi in make_items(oid3, [("Ciroc Vodka", 1), ("Passion Fruit Daiquiri", 3), ("Lobster Sliders", 2)], "delivered"):
            db.add(oi)
        paid_orders.append((oid3, venue_id, total3, sess3))

        # 4. VIP 2 — active, items ready (waiting to pay)
        oid4, sess4, total4, order4 = make_order("VIP 2",
            [("Don Julio Tequila", 2), ("Ace of Spades (Gold)", 1), ("Crispy Calamari", 2)],
            "fully_served", hours_ago=0)
        order4.created_at = now - timedelta(minutes=35)
        db.add(order4)
        for oi in make_items(oid4, [("Don Julio Tequila", 2), ("Ace of Spades (Gold)", 1), ("Crispy Calamari", 2)], "ready"):
            db.add(oi)

        # 5. Table 3 — active, items pending (just ordered)
        oid5, sess5, total5, order5 = make_order("Table 3",
            [("Hennessy XO", 1), ("Grilled Tiger Prawns", 1), ("Truffle Fries", 2)],
            "open", hours_ago=0)
        order5.created_at = now - timedelta(minutes=8)
        db.add(order5)
        for oi in make_items(oid5, [("Hennessy XO", 1), ("Grilled Tiger Prawns", 1), ("Truffle Fries", 2)], "pending"):
            db.add(oi)

        # 6. T1 — active, partially served
        oid6, sess6, total6, order6 = make_order("T1",
            [("Margarita", 2), ("Peppersoup (Goatmeat)", 1)],
            "partially_served", hours_ago=0)
        order6.created_at = now - timedelta(minutes=22)
        db.add(order6)
        for oi in make_items(oid6, [("Margarita", 2), ("Peppersoup (Goatmeat)", 1)], "preparing"):
            db.add(oi)

        await db.flush()

        # ── Payments + Exit passes for paid orders ───────────────────────────
        for order_id, v_id, amount, session in paid_orders:
            pay_id = nid()
            db.add(Payment(
                id=pay_id,
                order_id=order_id,
                venue_id=v_id,
                amount=amount,
                method="cash",
                recorded_by=staff_ids.get("cashier"),
            ))
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
        print("  3 paid orders with exit passes")
        print("  3 active orders (kitchen/bar display shows pending items)")
        print("  Tonight revenue: see /owner/tonight")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(seed())

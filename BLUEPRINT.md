# EASYSERVE — MASTER PROJECT BLUEPRINT

> **Read this file before writing any code.** This is the single source of truth for the EasyServe project. Architecture, database, API, features, UI/UX, and build phases are all defined here. Do not deviate from this blueprint without explicit instruction.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema](#5-database-schema)
6. [API Contract](#6-api-contract)
7. [Feature Specifications](#7-feature-specifications)
8. [Design System](#8-design-system)
9. [Frontend Pages & UI Specs](#9-frontend-pages--ui-specs)
10. [Real-Time Events (WebSocket)](#10-real-time-events-websocket)
11. [Authentication & Roles](#11-authentication--roles)
12. [Build Phases](#12-build-phases)
13. [Environment Variables](#13-environment-variables)
14. [Naming Conventions](#14-naming-conventions)
15. [Do Not Do List](#15-do-not-do-list)
16. [V5 Post-MVP Feature Additions](#16-v5-post-mvp-feature-additions)

---

## 1. PROJECT OVERVIEW

**Product Name:** EasyServe
**Type:** Hospitality Operating System (HOS) — Progressive Web App (PWA) SaaS
**Built by:** SMAT Concept & Innovative Solutions Ltd
**Market:** Bars, lounges, and nightlife venues across Nigeria and Africa
**Core Problem:** Nigerian bars and lounges lose significant revenue and operational efficiency daily — customers leave without paying, orders are shouted or handwritten, staff stand idle waiting at the bar, and owners have zero real-time visibility into what is happening in their venue.

### Core Service Flow
```
SCAN → ORDER → ROUTE → PREPARE → DELIVER → PAY → EXIT VERIFIED
```

### Primary User Types
- **Venue Owner** — Abuja or Lagos lounge owner who manages 5–30 tables, 3–10 staff, and wants operational control and live sales visibility
- **Attendant/Waiter** — Floor staff who receive instant order notifications and ready-buzz alerts on their phone
- **Bartender** — Bar staff who see a live drink queue on a TV screen and mark orders ready
- **Kitchen Staff** — Kitchen staff who see a live food queue on a separate TV screen and mark orders ready
- **Cashier** — Manages payment confirmation and generates QR Exit Passes
- **Security** — Scans QR Exit Passes at the door to verify payment
- **Customer** — End user who scans a table QR code — no account, no app download needed

### User Roles

| Role | Description |
|------|-------------|
| `owner` | Venue admin — full dashboard, analytics, menu, staff, promo management |
| `attendant` | Floor staff — receives order alerts and bar/kitchen ready buzzes, marks delivered |
| `bartender` | Bar station — sees live drink queue, marks drink orders ready |
| `kitchen` | Kitchen station — sees live food queue, marks food orders ready |
| `cashier` | Payment desk — confirms payments, generates QR Exit Passes |
| `security` | Exit gate — scans QR Exit Passes, sees VALID/EXPIRED/USED status |
| `customer` | No account — scans QR, orders, pays via session token |

### Product Tiers (V5)

| Tier | Monthly Price | Setup Fee | Best For | Key Features |
|------|--------------|-----------|----------|--------------|
| Starter | ₦35,000/month | Free (BYOD) | Small bars – up to 20 tables | Ordering, payments, basic dashboard, QR Exit Pass, 1 cashier terminal |
| Growth | ₦65,000/month | ₦50,000 | Mid-size lounges – up to 50 tables | + Kitchen/bar display, AI insights, loyalty engine, 3 staff accounts |
| Pro | ₦110,000/month | ₦150,000–₦500,000 | Large clubs/lounges – unlimited tables | + Staff analytics, fraud detection, customer profiles, 10 staff accounts |
| Enterprise | Custom | Custom | Hotel groups, multi-branch chains | All Pro + custom integrations, white-labelling, dedicated account manager |

---

## 2. TECH STACK

### Backend

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | Python 3.11+ | — |
| Framework | FastAPI (latest) | Async throughout |
| ORM | SQLAlchemy 2.x async | No sync sessions |
| Database | PostgreSQL 15+ | Primary data store |
| Cache / Pub-Sub | Redis 7+ | WebSocket pub/sub + sessions |
| Real-Time | WebSockets (native FastAPI) | Per-venue channels |
| Auth | JWT (python-jose) + bcrypt | Staff auth only |
| File Storage | Supabase Storage | Menu images |
| Migrations | Alembic | Never modify DB directly |

### Frontend

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 App Router | — |
| Language | TypeScript 5+ | No `any` types |
| Styling | Tailwind CSS 3+ | Custom config |
| Fonts | Syne + Plus Jakarta Sans | Google Fonts |
| State | Zustand | Auth + order + alert stores |
| HTTP | Axios | With interceptors |
| Real-Time | Native WebSocket API | With reconnect logic |
| Icons | Lucide React | — |
| Charts | Recharts | Custom dark theme |
| PWA | next-pwa | Customer interface must be installable |

### Infrastructure

| Layer | Service |
|-------|---------|
| Backend | Railway or Render |
| Frontend | Vercel |
| Database | Supabase PostgreSQL |
| Redis | Upstash |
| File Storage | Supabase Storage |

---

## 3. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                 │
│  Customer PWA  Staff App  Bar Display  Kitchen Display  Cashier      │
│  (No Auth)     (Mobile)   (TV/Tablet)  (TV/Tablet)      (Tablet)     │
│                                                  Security  Dashboard  │
│                                                  (Phone)   (Web)      │
└─────────┬────────────┬─────────────┬──────────────┬───────────┬──────┘
          └────────────┴─────────────┴──────────────┴───────────┘
                                    │
                         HTTPS + WebSocket
                                    │
┌───────────────────────────────────▼──────────────────────────────────┐
│                           FASTAPI BACKEND                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │  Orders  │ │   Menu   │ │  Alerts  │ │ Exit Pass│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Payments │ │  Promos  │ │Analytics │ │  WS Hub  │ │ Routing  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└──────────┬───────────────────────────────────────────┬──────────────┘
     ┌─────▼─────┐                             ┌───────▼───────┐
     │ PostgreSQL│                             │     Redis     │
     │ (Main DB) │                             │  WS Pub/Sub   │
     └───────────┘                             └───────────────┘
```

### Key Design Decisions
- **No app download required** — customer interface is a PWA in browser
- **WebSocket per venue** — each venue has isolated WS channel by `venue_id`
- **Stateless API** — JWT tokens carry all auth context
- **Multi-tenant** — every record scoped by `venue_id`
- **Customer sessions** — identified by `session_token` (UUID in localStorage), no account needed
- **Offline-tolerant** — orders queued locally if connection drops, synced on reconnect
- **Parallel routing** — on order placement, drinks routed to bar, food to kitchen, full order to assigned attendant — simultaneously, before attendant takes a step
- **Table assignment** — each table pre-assigned to an attendant; unassigned tables go to a general queue

---

## 4. FOLDER STRUCTURE

### Backend (`/backend`)
```
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── dependencies.py
│   ├── models/
│   │   ├── venue.py
│   │   ├── user.py
│   │   ├── table.py
│   │   ├── menu_category.py
│   │   ├── menu_item.py
│   │   ├── promo.py
│   │   ├── order.py
│   │   ├── order_item.py
│   │   ├── payment.py
│   │   ├── exit_pass.py
│   │   ├── alert.py
│   │   └── feedback.py
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── venue.py
│   │   ├── table.py
│   │   ├── menu.py
│   │   ├── order.py
│   │   ├── payment.py
│   │   ├── exit_pass.py
│   │   ├── alert.py
│   │   ├── feedback.py
│   │   └── analytics.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── venues.py
│   │   ├── tables.py
│   │   ├── menu.py
│   │   ├── orders.py
│   │   ├── payments.py
│   │   ├── exit_pass.py
│   │   ├── alerts.py
│   │   ├── promos.py
│   │   ├── feedback.py
│   │   ├── analytics.py
│   │   └── websocket.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── order_service.py
│   │   ├── routing_service.py      # Parallel bar/kitchen routing logic
│   │   ├── payment_service.py
│   │   ├── exit_pass_service.py
│   │   ├── menu_service.py
│   │   ├── promo_service.py
│   │   ├── analytics_service.py
│   │   ├── alert_service.py
│   │   └── ws_manager.py
│   └── utils/
│       ├── security.py
│       └── helpers.py
├── tests/
├── alembic.ini
├── requirements.txt
└── .env
```

### Frontend (`/frontend`)
```
frontend/
├── app/
│   ├── layout.tsx
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (customer)/                    # No auth required
│   │   └── table/[qr_token]/
│   │       ├── page.tsx               # Menu + ordering
│   │       ├── bill/page.tsx          # Live bill tracker
│   │       └── payment/page.tsx       # Feedback screen
│   ├── (staff)/                       # Auth required — attendant
│   │   └── staff/page.tsx             # Alert console + order cards
│   ├── (bar)/                         # Auth required — bartender
│   │   └── bar/page.tsx               # Live drink order queue (TV display)
│   ├── (kitchen)/                     # Auth required — kitchen
│   │   └── kitchen/page.tsx           # Live food order queue (TV display)
│   ├── (cashier)/                     # Auth required — cashier
│   │   └── cashier/page.tsx           # Bills due, payment confirm, exit pass gen
│   ├── (security)/                    # Auth required — security
│   │   └── security/page.tsx          # QR scanner + VALID/EXPIRED/USED display
│   └── (dashboard)/                   # Auth required — owner
│       └── dashboard/
│           ├── layout.tsx
│           ├── page.tsx               # Overview
│           ├── orders/page.tsx
│           ├── tables/page.tsx        # Table management + attendant assignment
│           ├── menu/page.tsx
│           ├── promos/page.tsx
│           ├── staff/page.tsx
│           ├── analytics/page.tsx
│           └── settings/page.tsx
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── Skeleton.tsx
│   ├── customer/
│   │   ├── MenuGrid.tsx
│   │   ├── MenuItemCard.tsx
│   │   ├── CategoryTabs.tsx
│   │   ├── OrderSummary.tsx
│   │   ├── BillTracker.tsx
│   │   ├── AlertButton.tsx
│   │   ├── ReorderSuggestions.tsx
│   │   ├── SplitBill.tsx
│   │   ├── ExitPassDisplay.tsx        # Shows QR + countdown timer
│   │   └── FeedbackScreen.tsx
│   ├── staff/
│   │   ├── AlertCard.tsx
│   │   ├── OrderCard.tsx
│   │   ├── ReadyBuzzBanner.tsx        # Bar/kitchen ready popup
│   │   └── ZoneFilter.tsx
│   ├── bar/
│   │   ├── DrinkOrderQueue.tsx
│   │   ├── DrinkOrderRow.tsx
│   │   └── LowStockBanner.tsx
│   ├── kitchen/
│   │   ├── FoodOrderQueue.tsx
│   │   └── FoodOrderRow.tsx
│   ├── cashier/
│   │   ├── BillCard.tsx
│   │   ├── PaymentConfirmModal.tsx
│   │   └── ExitPassGenerator.tsx
│   ├── security/
│   │   └── QRScanner.tsx
│   └── dashboard/
│       ├── StatCard.tsx
│       ├── PeakHeatmap.tsx
│       ├── RevenueChart.tsx
│       ├── SlowTableAlert.tsx
│       ├── TopItemsTable.tsx
│       ├── StaffScorecard.tsx
│       ├── FeedbackSummary.tsx
│       ├── TableAssignmentGrid.tsx    # Drag-assign tables to attendants
│       └── PromoEngine.tsx
├── hooks/
│   ├── useWebSocket.ts
│   ├── useOrders.ts
│   ├── useMenu.ts
│   ├── useAuth.ts
│   ├── useQRScanner.ts
│   └── useAnalytics.ts
├── store/
│   ├── authStore.ts
│   ├── orderStore.ts
│   └── alertStore.ts
├── lib/
│   ├── axios.ts
│   ├── websocket.ts
│   └── constants.ts
├── types/index.ts
└── public/
    ├── manifest.json
    └── icons/
```

---

## 5. DATABASE SCHEMA

> All tables: `created_at` + `updated_at`. All records scoped by `venue_id`.

### venues
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
name         VARCHAR(255) NOT NULL
slug         VARCHAR(100) UNIQUE NOT NULL
address      TEXT
city         VARCHAR(100)
phone        VARCHAR(20)
plan         ENUM('starter','growth','pro','enterprise') DEFAULT 'starter'
is_active    BOOLEAN DEFAULT TRUE
created_at   TIMESTAMPTZ DEFAULT NOW()
updated_at   TIMESTAMPTZ DEFAULT NOW()
```

### users (staff)
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE
full_name     VARCHAR(255) NOT NULL
email         VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
role          ENUM('owner','attendant','bartender','kitchen','cashier','security') NOT NULL
zone          VARCHAR(100)
is_active     BOOLEAN DEFAULT TRUE
created_at    TIMESTAMPTZ DEFAULT NOW()
updated_at    TIMESTAMPTZ DEFAULT NOW()
```

### tables
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id             UUID REFERENCES venues(id) ON DELETE CASCADE
table_number         VARCHAR(20) NOT NULL
zone                 VARCHAR(100)
qr_token             VARCHAR(255) UNIQUE NOT NULL
assigned_attendant_id UUID REFERENCES users(id) ON DELETE SET NULL  -- nullable; null = general queue
is_active            BOOLEAN DEFAULT TRUE
created_at           TIMESTAMPTZ DEFAULT NOW()
updated_at           TIMESTAMPTZ DEFAULT NOW()
```

### menu_categories
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id   UUID REFERENCES venues(id) ON DELETE CASCADE
name       VARCHAR(100) NOT NULL
sort_order INTEGER DEFAULT 0
is_active  BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ DEFAULT NOW()
```

### menu_items
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE
category_id     UUID REFERENCES menu_categories(id)
name            VARCHAR(255) NOT NULL
description     TEXT
price           NUMERIC(12,2) NOT NULL
image_url       TEXT
item_type       ENUM('drink','food','other') NOT NULL DEFAULT 'other'  -- controls routing destination
is_available    BOOLEAN DEFAULT TRUE
stock_threshold INTEGER DEFAULT 10
order_count     INTEGER DEFAULT 0
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### promos (happy hour engine)
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id     UUID REFERENCES venues(id) ON DELETE CASCADE
name         VARCHAR(255) NOT NULL
discount_pct NUMERIC(5,2) NOT NULL
start_time   TIME NOT NULL
end_time     TIME NOT NULL
days_active  VARCHAR(50) DEFAULT 'all'
applies_to   TEXT[]
is_active    BOOLEAN DEFAULT TRUE
created_at   TIMESTAMPTZ DEFAULT NOW()
```

### orders
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE
table_id      UUID REFERENCES tables(id)
assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL  -- attendant assigned at order time (snapshot from table assignment)
session_token VARCHAR(255) NOT NULL
status        ENUM('open','partially_served','fully_served','paid','cancelled') DEFAULT 'open'
order_source  ENUM('qr_scan','whatsapp','walk_in') DEFAULT 'qr_scan'
total_amount  NUMERIC(12,2) DEFAULT 0
created_at    TIMESTAMPTZ DEFAULT NOW()
updated_at    TIMESTAMPTZ DEFAULT NOW()
```

### order_items
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id        UUID REFERENCES orders(id) ON DELETE CASCADE
menu_item_id    UUID REFERENCES menu_items(id)
name            VARCHAR(255) NOT NULL
price           NUMERIC(12,2) NOT NULL
quantity        INTEGER NOT NULL DEFAULT 1
item_type       ENUM('drink','food','other') NOT NULL  -- snapshot of menu_item.item_type at order time
routed_to       ENUM('bar','kitchen','none') NOT NULL  -- tracks which station received this item
status          ENUM('pending','preparing','ready','delivered','cancelled') DEFAULT 'pending'
notes           TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### payments
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id    UUID REFERENCES orders(id)
venue_id    UUID REFERENCES venues(id)
amount      NUMERIC(12,2) NOT NULL
method      ENUM('cash','transfer','pos','card','mobile_wallet') NOT NULL
recorded_by UUID REFERENCES users(id)
is_split    BOOLEAN DEFAULT FALSE
split_data  JSONB
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### exit_passes
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id       UUID REFERENCES orders(id) UNIQUE
venue_id       UUID REFERENCES venues(id)
token          VARCHAR(255) UNIQUE NOT NULL       -- cryptographically signed token
expires_at     TIMESTAMPTZ NOT NULL               -- configurable 5 or 10 minutes after generation
used_at        TIMESTAMPTZ                        -- set on first valid scan
scanned_by     UUID REFERENCES users(id)          -- security staff who scanned
status         ENUM('valid','expired','used') GENERATED ALWAYS AS (
                 CASE
                   WHEN used_at IS NOT NULL THEN 'used'
                   WHEN NOW() > expires_at THEN 'expired'
                   ELSE 'valid'
                 END
               ) STORED
delivery_method ENUM('whatsapp','sms','cashier_screen') DEFAULT 'cashier_screen'
created_at     TIMESTAMPTZ DEFAULT NOW()
```

### alerts
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE
table_id        UUID REFERENCES tables(id)
order_id        UUID REFERENCES orders(id)
type            ENUM('order_more','need_help','urgent','request_payment')
status          ENUM('pending','acknowledged','resolved') DEFAULT 'pending'
acknowledged_by UUID REFERENCES users(id)
created_at      TIMESTAMPTZ DEFAULT NOW()
resolved_at     TIMESTAMPTZ
```

### feedback
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
venue_id    UUID REFERENCES venues(id) ON DELETE CASCADE
order_id    UUID REFERENCES orders(id)
table_id    UUID REFERENCES tables(id)
rating      ENUM('great','okay','poor') NOT NULL
attended_by UUID REFERENCES users(id)
created_at  TIMESTAMPTZ DEFAULT NOW()
```

---

## 6. API CONTRACT

**Base URL:** `/api/v1` | **Staff Auth:** `Authorization: Bearer <token>`

### Auth
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
```

### Venues
```
GET    /api/v1/venues/me
PATCH  /api/v1/venues/me
GET    /api/v1/venues/{venue_slug}/menu       # WhatsApp / shareable link entry point
```

### Tables
```
GET    /api/v1/tables
POST   /api/v1/tables
PATCH  /api/v1/tables/{id}
DELETE /api/v1/tables/{id}
GET    /api/v1/tables/{id}/qr
PATCH  /api/v1/tables/{id}/assign            # Assign attendant to table { attendant_id }
PATCH  /api/v1/tables/{id}/unassign          # Remove attendant assignment
```

### Menu
```
GET    /api/v1/menu/categories
POST   /api/v1/menu/categories
PATCH  /api/v1/menu/categories/{id}
DELETE /api/v1/menu/categories/{id}
GET    /api/v1/menu/items
POST   /api/v1/menu/items
PATCH  /api/v1/menu/items/{id}
DELETE /api/v1/menu/items/{id}
PATCH  /api/v1/menu/items/{id}/availability
PATCH  /api/v1/menu/items/{id}/reset-count
```

### Customer — No Auth Required
```
GET    /api/v1/customer/menu/{qr_token}         # Menu + active promos applied
POST   /api/v1/customer/orders/{qr_token}        # Place or add to order
GET    /api/v1/customer/orders/{session_token}   # Live bill
POST   /api/v1/customer/alerts/{qr_token}        # Send priority alert
POST   /api/v1/customer/feedback/{order_id}      # Submit post-pay feedback
GET    /api/v1/customer/exit-pass/{session_token} # View own exit pass (QR + countdown)
```

### Orders (Staff Auth)
```
GET    /api/v1/orders
GET    /api/v1/orders/{id}
PATCH  /api/v1/orders/items/{id}/status          # pending → preparing → ready → delivered
PATCH  /api/v1/orders/{id}/assign                # Reassign order to different attendant
```

### Payments
```
POST   /api/v1/payments                          # Record digital payment, auto-generate exit pass
POST   /api/v1/payments/cash                     # Cashier confirms cash received, generate exit pass
GET    /api/v1/payments/{order_id}
```

### Exit Pass
```
GET    /api/v1/exit-pass/{order_id}              # Get exit pass for an order (cashier view)
POST   /api/v1/exit-pass/scan/{token}            # Security scans QR — returns VALID/EXPIRED/USED
POST   /api/v1/exit-pass/{order_id}/resend       # Resend via WhatsApp or SMS
```

### Alerts
```
GET    /api/v1/alerts
PATCH  /api/v1/alerts/{id}/acknowledge
PATCH  /api/v1/alerts/{id}/resolve
```

### Promos
```
GET    /api/v1/promos
POST   /api/v1/promos
PATCH  /api/v1/promos/{id}
DELETE /api/v1/promos/{id}
GET    /api/v1/promos/active
```

### Analytics (Owner — Growth/Pro Plan)
```
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/peak-hours
GET    /api/v1/analytics/top-items
GET    /api/v1/analytics/slow-tables
GET    /api/v1/analytics/staff-scores
GET    /api/v1/analytics/feedback
GET    /api/v1/analytics/inventory
GET    /api/v1/analytics/exit-pass-log          # End-of-night reconciliation
```

### WebSocket
```
WS     /ws/{venue_id}?token={jwt}               # Staff + owner channel
WS     /ws/bar/{venue_id}?token={jwt}           # Bar display channel (drink orders only)
WS     /ws/kitchen/{venue_id}?token={jwt}       # Kitchen display channel (food orders only)
WS     /ws/customer/{qr_token}                  # Customer bill updates
WS     /ws/security/{venue_id}?token={jwt}      # Exit pass scan confirmations
```

---

## 7. FEATURE SPECIFICATIONS

### 7.1 QR Code System
- Each table: unique `qr_token` (UUID), generates URL: `https://app.easyserve.ng/table/{qr_token}`
- QR printed and placed on physical table — scanning opens customer PWA in browser
- `session_token` (new UUID) generated on customer's first order, stored in localStorage
- QR codes downloadable as PNG from owner dashboard for printing

### 7.2 Full Order Flow
1. Customer scans QR → menu loads with active promos applied
2. Customer adds items → order created with `status: open`
3. **Instant triple routing** — system SIMULTANEOUSLY sends:
   - Drink items → Bar Display (WebSocket: `new_order_bar`)
   - Food items → Kitchen Display (WebSocket: `new_order_kitchen`)
   - Full order → Assigned Attendant's phone (WebSocket: `new_order_attendant`)
4. Bar marks drink items: `pending` → `preparing` → `ready` — fires `bar_order_ready` buzz to attendant
5. Kitchen marks food items: `pending` → `preparing` → `ready` — fires `kitchen_order_ready` buzz to attendant
6. Attendant receives ready buzz, picks up from correct station, marks `delivered`
7. Customer bill updates in real time
8. Customer taps "Request Payment" → `request_payment` alert sent to cashier
9. Cashier confirms payment (digital or cash) → system generates QR Exit Pass
10. Exit Pass sent to customer via WhatsApp/SMS or shown on cashier screen
11. Customer presents QR at exit → security scans → VALID confirmation → customer exits
12. Order → `paid` → feedback screen shown to customer

### 7.3 Smart Table Assignment Engine

**Setup (before shift):**
- Manager assigns tables to each attendant via dashboard (drag-and-drop grid)
- Example: Attendant A → Tables 1–5, Attendant B → Tables 6–10
- Unassigned tables → General Queue visible to all attendants
- Manager can reassign any table or order at any time during service

**Routing on order placement:**
- System reads `table.assigned_attendant_id` at order creation time
- Snapshots into `order.assigned_to` — routing is fixed even if assignment changes mid-service
- `order_items.item_type` determines routing destination: `drink` → bar, `food` → kitchen, `other` → kitchen (default)

**Flexibility rules:**
- One attendant can be assigned multiple zones if short-staffed
- If attendant goes offline, manager can bulk-reassign their tables
- Split-billing supported per order

### 7.4 Parallel Bar & Kitchen Routing

**Order splitting logic:**
- Drink items (beer, cocktails, water, soft drinks): `item_type = 'drink'` → routed to Bar Display only
- Food items (snacks, meals): `item_type = 'food'` → routed to Kitchen Display only
- Each station operates independently — bar can mark ready before kitchen and vice versa
- Attendant receives separate buzzes as each station completes

**Bar Display behaviour:**
- TV screen shows all incoming drink orders grouped by table number
- Colour-coded status: Pending (red), Preparing (amber), Ready (green)
- Attendant name shown per order for accountability
- Bartender taps "Ready" → fires `bar_order_ready` buzz to assigned attendant

**Kitchen Display behaviour:**
- Separate TV screen, identical layout to bar but shows food orders only
- Kitchen staff taps "Ready" → fires `kitchen_order_ready` buzz to assigned attendant

### 7.5 Buzz Notification System (Attendant Ready Alerts)

| Notification Type | Trigger | Message Shown | Action Required |
|------------------|---------|---------------|-----------------|
| New Order Alert | Customer confirms order | "New order — Table [X] — [item summary]" | Attendant acknowledges |
| Bar Ready Buzz | Bartender taps Ready | "Table [X] DRINKS ready at Bar — pick up now" | Attendant goes to bar |
| Kitchen Ready Buzz | Kitchen staff taps Ready | "Table [X] FOOD ready at Kitchen — pick up now" | Attendant goes to kitchen |
| Delayed Order Alert | Order not marked Ready within threshold | "Table [X] order delayed — check with Bar/Kitchen" | Attendant investigates |
| Delivery Confirmed | Attendant marks Delivered | Order removed from all displays | None — automatic |

**Nearest Station Pickup Popup (non-blocking banner):**

| Scenario | Popup Message |
|----------|--------------|
| Only bar is ready | "Table 3 — Drinks ready at Bar. Food still preparing. Pick up drinks now." |
| Only kitchen is ready | "Table 3 — Food ready at Kitchen. Drinks still preparing. Pick up food now." |
| Both ready simultaneously | "Table 3 — Both drinks and food are ready. Pick up from nearest station first." |
| Bar ready, kitchen already collected | "Table 3 — Drinks ready at Bar. Deliver with remaining items." |

- Popup is non-blocking — appears as a banner, does not freeze the screen
- No tap required — attendant acts on it, system tracks pickup via `delivered` status
- Venue layout is not mapped — attendant uses physical judgment for nearest station

### 7.6 QR Exit Pass System

**How it works:**
1. Customer requests bill → cashier confirms payment received (digital or cash)
2. Cashier marks payment as confirmed in system
3. System instantly generates a unique, time-limited QR Exit Pass
4. Exit Pass sent to customer via WhatsApp/SMS or displayed on cashier screen
5. Customer presents QR at door — security scans with EasyServe Security app
6. System shows VALID / EXPIRED / USED in large colour-coded display
7. Customer exits only on VALID confirmation

**Technical specifications:**
- Validity window: configurable per venue — 5 minutes (high-footfall) or 10 minutes (standard)
- Single-use: token marked `used` after first valid scan, prevents screenshot reuse
- Cryptographically signed: token tied to `order_id`, `venue_id`, and timestamp
- Cash payments: cashier physically confirms cash before system generates pass
- Fallback: cashier can show QR on their screen if customer's phone is unavailable
- Customer sees live countdown timer on their phone

**Security display:**
- Large colour-coded status: GREEN (Valid), RED (Expired/Invalid), ORANGE (Already Used)
- Table number and customer name shown for dispute resolution
- Full audit log of all exits accessible in owner dashboard

**Plan availability:** All plans (Starter, Growth, Pro, Enterprise)

### 7.7 Priority-Coded Alert System

| Alert Type | Color | Label | What It Means |
|-----------|-------|-------|---------------|
| `order_more` | GREEN | "Ready to Order More" | Revenue opportunity — attend immediately |
| `need_help` | YELLOW | "I Need Help" | General assistance needed |
| `urgent` | RED | "Urgent Issue" | Complaint — escalate immediately |
| `request_payment` | BLUE | "Request Payment" | Route to cashier for bill processing |

- All alerts broadcast via WebSocket to all attendants and owner
- RED alerts pulse with CSS animation
- Unresolved alerts older than 5 minutes get escalated highlight
- Staff can Acknowledge (removes from top) or Resolve (closes alert)

### 7.8 Happy Hour / Promo Engine
- Owner sets: name, discount %, start time, end time, days active, applicable items
- `GET /customer/menu/{qr_token}` checks active promos and applies to returned prices
- Menu returns: `original_price` and `effective_price`
- Customer sees original price struck through, effective price shown
- `order_items.price` stores `effective_price` at time of order (price snapshot)

### 7.9 Smart Reorder Suggestions
- Customer's `session_token` used to retrieve current session's `order_items`
- Most ordered items (by quantity) returned in `suggestions` array on menu load
- Frontend shows "Order Again?" section at top of menu grid (max 3 items)
- Only shown if customer has ordered before in this session

### 7.10 Inventory Depletion Alerts
- Each `menu_item` has `stock_threshold` (default: 10)
- `order_count` incremented on every order
- Background task every 15 mins: check `order_count >= stock_threshold`
- If threshold crossed: WebSocket event `inventory_alert` to owner + bartender + kitchen
- Owner can reset `order_count` from menu management (after restocking)

### 7.11 Split Bill
- Customer taps "Split Bill" when requesting payment
- UI shows all order items — customer assigns each item to Person 1, 2, 3... (max 6)
- System calculates each person's subtotal
- `payments.split_data` stores JSON breakdown
- Cashier sees split on their device, collects from each person separately

### 7.12 Post-Visit Feedback (1-Tap)
- Triggered when order status → `paid`
- Customer sees 3 tap targets: 😊 Great | 😐 Okay | 😞 Poor
- Saved with `order_id`, `table_id`, `attended_by`
- Auto-dismisses after submission, clears session from localStorage

### 7.13 Venue Intelligence Dashboard

| Widget | Data | Refresh |
|--------|------|---------|
| Today's Revenue | SUM(payments.amount) | Every 5 mins |
| Active Orders | COUNT(orders) status != paid | Real-time WS |
| Peak Hour Heatmap | Orders by hour (7-day) | Daily |
| Slow Tables | Tables with no order in 45 mins | Every 10 mins |
| Top Items by Revenue | SUM(price × qty) by item | Daily |
| Staff Efficiency | Orders delivered / hours | Per shift |
| Feedback Summary | COUNT by rating | Daily |
| Inventory Alerts | Items at threshold | Every 15 mins |
| Exit Pass Log | All scans with VALID/EXPIRED/USED | Real-time |

---

## 8. DESIGN SYSTEM

### 8.1 Aesthetic Direction
**"Vibrant Nigerian Nightlife — Electric Dark with Teal & Amber Glow"**

Think: the energy of a premium Abuja lounge on a Friday night. Dark environment, glowing screens, vibrant accent colors. The customer QR interface must look exciting and modern the instant it opens. The staff console must be fast, clear, and instantly readable — even in a dim, loud environment.

### 8.2 Color Palette
```css
:root {
  /* Backgrounds */
  --bg-primary:   #080D14;  /* Deep dark — main background */
  --bg-secondary: #0F1623;  /* Cards, panels */
  --bg-elevated:  #162032;  /* Modals, bottom sheets */
  --bg-input:     #0D1420;  /* Input fields */

  /* Brand — Electric Teal */
  --teal:         #00D4B4;
  --teal-glow:    rgba(0, 212, 180, 0.15);
  --teal-dark:    #007A6A;

  /* Secondary — Warm Amber */
  --amber:        #FF9500;
  --amber-glow:   rgba(255, 149, 0, 0.15);

  /* Alert Priority Colors */
  --alert-green:  #00E676;  /* order_more */
  --alert-yellow: #FFD600;  /* need_help */
  --alert-red:    #FF3D71;  /* urgent */
  --alert-blue:   #2979FF;  /* request_payment */

  /* Exit Pass Status Colors */
  --exit-valid:   #00E676;  /* GREEN — valid */
  --exit-expired: #FF3D71;  /* RED — expired/invalid */
  --exit-used:    #FF9500;  /* ORANGE — already used */

  /* Order Item Status */
  --status-pending:   #FF9500;
  --status-preparing: #2979FF;
  --status-ready:     #00D4B4;
  --status-delivered: #00E676;

  /* Text */
  --text-primary:   #F0F4FF;
  --text-secondary: #8896A8;
  --text-muted:     #435060;

  /* Borders */
  --border:       #1A2535;
  --border-teal:  rgba(0, 212, 180, 0.2);

  /* Gradients */
  --grad-teal: linear-gradient(135deg, #00D4B4 0%, #00A896 100%);
  --grad-amber: linear-gradient(135deg, #FF9500 0%, #FF6B00 100%);
  --grad-card: linear-gradient(145deg, #0F1623 0%, #162032 100%);
}
```

### 8.3 Typography
```css
--font-display: 'Syne', sans-serif;          /* Headlines, venue name, section titles */
--font-body: 'Plus Jakarta Sans', sans-serif; /* All UI text, prices, labels */

h1     { font: 800 2.25rem/1.15 var(--font-display); }
h2     { font: 700 1.625rem/1.2 var(--font-display); }
h3     { font: 600 1.125rem/1.3 var(--font-display); }
p      { font: 400 1rem/1.6 var(--font-body); }
.price { font: 700 1.25rem/1 var(--font-display); color: var(--teal); }
```

### 8.4 Animation Rules
```css
:root {
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --transition-fast: 150ms var(--ease);
  --transition-base: 250ms var(--ease);
  --transition-slow: 400ms var(--ease);
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 61, 113, 0.2); }
  50%       { box-shadow: 0 0 0 12px rgba(255, 61, 113, 0); }
}

@keyframes countdown-tick {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: 283; }  /* SVG circle circumference */
}
```

### 8.5 Micro-Interactions

| Element | Trigger | Effect |
|---------|---------|--------|
| CTA buttons | Hover | `translateY(-2px)` + deeper teal glow |
| CTA buttons | Click | `scale(0.98)` |
| Menu item card | Tap | `scale(0.99)` + teal border flash |
| Cart badge | Item added | `scale(1.3)` bounce |
| Alert card (red) | Idle | Pulse glow `rgba(255,61,113,0.2)` |
| New alert | Arrive | Slide in from top |
| Alert resolved | Dismiss | Slide out left + collapse |
| Item status chip | Change | Color transition + `scale(1.1)` pulse |
| Stat numbers | Page load | Count up from 0 over 1.2s |
| Feedback button | Select | Scale up 1.3× + colored ring appears |
| Bottom sheet | Open | Slide up from bottom |
| Ready buzz banner | Arrive | Slide down from top + amber glow pulse |
| Exit pass QR | Generated | Fade in + countdown ring starts animating |
| Exit scan result | Valid | Full-screen green flash |
| Exit scan result | Expired/Used | Full-screen red/orange flash |

---

## 9. FRONTEND PAGES & UI SPECS

### 9.1 Customer Menu Page (`/table/[qr_token]`)
- Sticky top bar: venue name + "Table 7" in teal accent
- Category tabs: horizontal pill scroll, active tab glows teal
- "Order Again?" strip (if previous orders): 3 items, teal border
- Menu items: full-width card, square image (80×80px) left, name + description (max 2 lines) + price right. Item type badge (Drink/Food) subtle display.
- Quantity selector: `−` | count | `+` with teal controls
- Sticky bottom bar: 🔔 bell → alert sheet | 🛒 `X items · ₦XX,XXX` → bill page
- Cart badge bounces on add

### 9.2 Bill Tracker Page (`/table/[qr_token]/bill`)
- Each item row: name, qty, price, live status chip
- Status: Pending (amber) → Preparing (blue pulse) → Ready (teal) → Delivered (green)
- Running total: large teal number
- Happy Hour banner if promo active (amber)
- Buttons: "Add More Items" (ghost) | "Request Payment" (teal primary with glow)
- "Split with friends?" toggle → split bill UI
- Exit Pass section (after payment): QR code + live countdown ring (green → amber → red)

### 9.3 Priority Alert Bottom Sheet
- Slides up from bottom, handle bar at top
- Title: "How can we help?"
- 3 large stacked tap targets: 🟢 Order More | 🟡 I Need Assistance | 🔴 Urgent Issue
- Tap → sheet closes + toast: "Your attendant has been notified ✓"

### 9.4 Feedback Screen (`/table/[qr_token]/payment`)
- Full-screen centered, Syne display font
- 3 emoji tap buttons: 😊 Great | 😐 Okay | 😞 Poor
- On tap: selected emoji scales 1.3× → "Thank you! See you soon 👋"
- Session cleared from localStorage after submission

### 9.5 Staff Alert Console (`/staff`)
- Alert cards sorted: RED → BLUE → YELLOW → GREEN
- Each card: colored left border + glow, table number, alert label, time elapsed
- Two action buttons: "Acknowledge" (ghost) | "Resolve" (solid teal)
- RED cards: continuous pulse animation
- **Ready Buzz Banner**: slides down from top when bar or kitchen marks ready. Shows table, what's ready, where to pick up. Non-blocking. Auto-dismisses after 10s.
- **Order section below alerts**: cards for each active table showing item statuses
- Empty state: large ✓ in teal + "All clear"

### 9.6 Bar Display (`/bar`) — optimized for TV/tablet landscape
- Low stock banner: amber full-width at top
- Drink order cards grouped by table number
- Each card: table number (large), attendant name, list of drink items with qty
- Status dots: Pending (red) → Preparing (amber) → Ready (green)
- Tap card to cycle status: Pending → Preparing → Ready (instant, no confirm)
- Completed table card: collapses and fades
- Shows ONLY drink items (`item_type = 'drink'`)

### 9.7 Kitchen Display (`/kitchen`) — optimized for TV/tablet landscape
- Identical layout to Bar Display but shows ONLY food items (`item_type = 'food'`)
- Separate WebSocket channel from bar
- Separate low stock alerts for food items

### 9.8 Cashier Terminal (`/cashier`)
- List of tables with unpaid bills, sorted by bill total (descending)
- Each row: table number, assigned attendant, items count, total amount, payment status
- Tap row → payment confirmation modal:
  - Select payment method (POS / Transfer / Cash / Mobile Wallet)
  - Cash: manual confirmation checkbox ("Cash received physically")
  - Confirm → system generates Exit Pass
- Exit Pass display: large QR code + "Send via WhatsApp" and "Send via SMS" buttons
- Countdown visible on cashier screen too
- "Print / Show QR" option if customer phone unavailable

### 9.9 Security Scanner (`/security`)
- Full-screen minimal interface optimized for one-hand phone use
- Large camera viewfinder for QR scanning (uses device camera)
- After scan:
  - **VALID** → full-screen green, table number, customer name, large ✓
  - **EXPIRED** → full-screen red, time expired, "Ask customer to return to cashier"
  - **USED** → full-screen orange, first use timestamp, "Already scanned"
- Scan log: last 10 scans visible at bottom of screen

### 9.10 Owner Dashboard (`/dashboard`)
- Greeting: "Good evening, [Name]" in Syne 800
- 4 stat cards: Today's Revenue | Active Orders | Pending Alerts | Tables Served
- Numbers count up from 0 on load
- Revenue chart: smooth teal line, last 7 days
- Active alerts live feed: top 3 newest
- Exit Pass log widget: recent exits with VALID/EXPIRED/USED tags

### 9.11 Table Management Page (`/dashboard/tables`)
- Grid of all tables with their current assignment status
- Drag-and-drop or dropdown to assign attendant per table
- Visual indicator: assigned (teal border) vs unassigned (grey border)
- "Unassign All" and "Auto-distribute" buttons for shift start
- QR code download per table

---

## 10. REAL-TIME EVENTS (WEBSOCKET)

### Server → Staff Channel (`/ws/{venue_id}`)
```json
{ "event": "new_order_attendant",  "data": { "order_id": "", "table_id": "", "table_number": "", "zone": "", "assigned_to": "", "items": [], "drink_count": 0, "food_count": 0 } }
{ "event": "order_item_update",    "data": { "item_id": "", "order_id": "", "table_number": "", "status": "preparing|ready|delivered", "item_type": "drink|food" } }
{ "event": "bar_order_ready",      "data": { "order_id": "", "table_number": "", "items": [], "assigned_to": "" } }
{ "event": "kitchen_order_ready",  "data": { "order_id": "", "table_number": "", "items": [], "assigned_to": "" } }
{ "event": "new_alert",            "data": { "alert_id": "", "type": "order_more|need_help|urgent|request_payment", "table_number": "", "zone": "" } }
{ "event": "alert_resolved",       "data": { "alert_id": "" } }
{ "event": "inventory_alert",      "data": { "item_id": "", "item_name": "", "order_count": 0, "item_type": "drink|food" } }
{ "event": "payment_recorded",     "data": { "order_id": "", "table_number": "" } }
{ "event": "exit_pass_used",       "data": { "order_id": "", "table_number": "", "scanned_at": "" } }
```

### Server → Bar Channel (`/ws/bar/{venue_id}`)
```json
{ "event": "new_order_bar",        "data": { "order_id": "", "table_number": "", "attendant_name": "", "items": [{ "name": "", "qty": 0, "notes": "" }] } }
{ "event": "order_cancelled",      "data": { "order_id": "", "table_number": "" } }
```

### Server → Kitchen Channel (`/ws/kitchen/{venue_id}`)
```json
{ "event": "new_order_kitchen",    "data": { "order_id": "", "table_number": "", "attendant_name": "", "items": [{ "name": "", "qty": 0, "notes": "" }] } }
{ "event": "order_cancelled",      "data": { "order_id": "", "table_number": "" } }
```

### Server → Customer Channel (`/ws/customer/{qr_token}`)
```json
{ "event": "item_status_update",   "data": { "item_id": "", "status": "preparing|ready|delivered" } }
{ "event": "payment_confirmed",    "data": { "order_id": "" } }
{ "event": "exit_pass_generated",  "data": { "token": "", "expires_at": "", "qr_image_url": "" } }
```

### Server → Security Channel (`/ws/security/{venue_id}`)
```json
{ "event": "pass_scan_result",     "data": { "token": "", "status": "valid|expired|used", "table_number": "", "order_id": "" } }
```

### Client → Server (all channels)
```json
{ "event": "ping" }   // keepalive every 30s
```

---

## 11. AUTHENTICATION & ROLES

### JWT Payload
```json
{
  "sub": "user_id",
  "venue_id": "venue_uuid",
  "role": "owner|attendant|bartender|kitchen|cashier|security",
  "exp": 1234567890
}
```

### Permissions Matrix

| Endpoint | owner | attendant | bartender | kitchen | cashier | security | customer |
|----------|-------|-----------|-----------|---------|---------|----------|----------|
| View/manage menu | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Read-only |
| View/manage tables | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Assign tables to attendants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View/manage staff | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage promos | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View/update orders | ✅ | ✅ | Drink only | Food only | View only | ❌ | Own only |
| Update item status | ✅ | ✅ | Drink only | Food only | ❌ | ❌ | ❌ |
| Record payments | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Generate exit pass | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Scan exit pass | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Acknowledge alerts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Submit feedback | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Role Login Routing
After login, the system checks `role` and redirects:

| Role | Default Redirect |
|------|----------------|
| `owner` | `/dashboard` |
| `attendant` | `/staff` |
| `bartender` | `/bar` |
| `kitchen` | `/kitchen` |
| `cashier` | `/cashier` |
| `security` | `/security` |

---

## 12. BUILD PHASES

> **Build strictly in this order. Do not start Phase N+1 before Phase N passes its checkpoint.**

### Phase 1 — Backend Foundation (Days 1–5)
- [ ] FastAPI project with complete folder structure
- [ ] Async PostgreSQL + SQLAlchemy configured
- [ ] All DB models created + Alembic migration run (including exit_passes table, item_type, assigned_attendant_id)
- [ ] JWT auth: register, login, refresh, me — all 6 roles supported
- [ ] Venue profile CRUD
- [ ] Auth endpoint tests
- **Checkpoint:** Register venue, login as any role, get profile ✓

### Phase 2 — Menu & Tables (Days 6–8)
- [ ] Menu categories CRUD
- [ ] Menu items CRUD with `item_type` field (drink/food/other)
- [ ] Tables CRUD with QR token generation
- [ ] Table attendant assignment: `PATCH /tables/{id}/assign` and `/unassign`
- [ ] QR code image generation endpoint
- [ ] Promo model + basic CRUD
- **Checkpoint:** Full menu (with item types) and table management including assignments via API ✓

### Phase 3 — Customer Ordering Flow (Days 9–13)
- [ ] `GET /customer/menu/{qr_token}` — menu + active promos applied
- [ ] `POST /customer/orders/{qr_token}` — create/add to order with session_token
  - Reads `table.assigned_attendant_id`, snapshots into `order.assigned_to`
  - Splits items by `item_type` and sets `order_items.routed_to` accordingly
- [ ] `GET /customer/orders/{session_token}` — live bill
- [ ] Smart reorder suggestions in menu endpoint
- [ ] `GET /venues/{venue_slug}/menu` — WhatsApp/shareable entry point
- **Checkpoint:** Full ordering flow works via API, items have correct routing ✓

### Phase 4 — WebSocket Layer (Days 14–16)
- [ ] WS connection manager with per-venue channels
- [ ] `/ws/{venue_id}` staff/owner channel
- [ ] `/ws/bar/{venue_id}` bar channel — receives only drink items on new order
- [ ] `/ws/kitchen/{venue_id}` kitchen channel — receives only food items on new order
- [ ] `/ws/customer/{qr_token}` customer channel
- [ ] Broadcast `new_order_attendant` when order placed (to assigned attendant's channel)
- [ ] Broadcast `new_order_bar` and `new_order_kitchen` simultaneously on order placement
- [ ] Broadcast `bar_order_ready` and `kitchen_order_ready` when stations mark ready
- [ ] Customer receives real-time bill updates
- **Checkpoint:** Orders appear simultaneously on bar, kitchen, and staff screens in real time ✓

### Phase 5 — Payments & Exit Pass (Days 17–20)
- [ ] `POST /customer/alerts/{qr_token}` — submit priority alert
- [ ] Broadcast `new_alert` to staff channel
- [ ] Alert acknowledge + resolve endpoints
- [ ] `POST /payments` — record digital payment → auto-generate exit pass
- [ ] `POST /payments/cash` — cashier confirms cash → generate exit pass
- [ ] Exit pass generation: cryptographic token, expiry, single-use enforcement
- [ ] `GET /exit-pass/{order_id}` — cashier view of exit pass
- [ ] `POST /exit-pass/scan/{token}` — security scans QR, returns status
- [ ] `POST /exit-pass/{order_id}/resend` — resend pass
- [ ] Broadcast `payment_confirmed` to customer channel with exit pass data
- [ ] Broadcast `exit_pass_used` to owner channel when security scans
- **Checkpoint:** Full flow order → payment → exit pass → security scan works end-to-end ✓

### Phase 6 — Supporting Features (Days 21–23)
- [ ] Inventory tracking: increment `order_count` on order
- [ ] Background task: check thresholds, emit `inventory_alert`
- [ ] `POST /customer/feedback/{order_id}`
- [ ] Promo active status check in menu endpoint
- [ ] Split bill: `split_data` JSONB storage in payments
- **Checkpoint:** Promos, feedback, split bill, inventory alerts working ✓

### Phase 7 — Analytics Endpoints (Days 24–26)
- [ ] All analytics endpoints with correct aggregations
- [ ] Plan check (Growth/Pro) on AI insight analytics routes
- [ ] `GET /analytics/exit-pass-log` for end-of-night reconciliation
- **Checkpoint:** All analytics return correct data ✓

### Phase 8 — Frontend: Auth + Shell (Days 27–29)
- [ ] Next.js 14 setup with TypeScript, Tailwind, PWA config
- [ ] Full CSS variable design system including exit pass status colors
- [ ] Syne + Plus Jakarta Sans fonts loaded
- [ ] Login page with role-based redirect after login
- [ ] Dashboard layout: sidebar desktop, bottom tabs mobile
- [ ] Axios interceptor + Zustand auth store
- **Checkpoint:** Login works, role-based redirect works, dashboard shell renders ✓

### Phase 9 — Frontend: Customer PWA (Days 30–34)
- [ ] `/table/[qr_token]` — menu page, category tabs, menu cards, reorder strip, item type badges
- [ ] Sticky bottom bar with cart count
- [ ] `/table/[qr_token]/bill` — live bill tracker with status chips + exit pass display section
- [ ] Alert bottom sheet with 3 priority options
- [ ] Split bill UI
- [ ] Request payment button
- [ ] Exit Pass display: QR code + live countdown ring animation
- [ ] `/table/[qr_token]/payment` — feedback screen
- [ ] WebSocket hook for real-time bill updates + exit pass generation event
- **Checkpoint:** Customer can scan, order, track bill, receive exit pass, submit feedback ✓

### Phase 10 — Frontend: Staff, Bar, Kitchen (Days 35–38)
- [ ] `/staff` — alert console with priority cards + zone filter
- [ ] Ready Buzz Banner component (non-blocking, slides from top)
- [ ] Acknowledge + resolve buttons
- [ ] Order item status update from staff screen
- [ ] `/bar` — drink-only order queue: columns by table, tap to cycle status
- [ ] Low stock banner on bar screen
- [ ] `/kitchen` — food-only order queue: identical layout to bar, separate WS channel
- [ ] Low stock banner on kitchen screen
- **Checkpoint:** Staff see and act on orders + alerts; bar sees only drinks; kitchen sees only food ✓

### Phase 11 — Frontend: Cashier & Security (Days 39–41)
- [ ] `/cashier` — bill list, payment confirmation modal (all payment methods), exit pass generator
- [ ] Cash confirmation checkbox enforced before exit pass generation
- [ ] Exit pass QR display on cashier screen with WhatsApp/SMS send buttons
- [ ] `/security` — full-screen QR scanner, large colour-coded result display (GREEN/RED/ORANGE)
- [ ] Scan log (last 10) at bottom of security screen
- **Checkpoint:** Cashier can confirm payment and generate exit pass; security can scan and see valid/expired/used ✓

### Phase 12 — Frontend: Owner Dashboard (Days 42–47)
- [ ] Overview: stat cards, alerts feed, slow table banner, revenue chart, exit pass log widget
- [ ] Table management: grid with drag-assign attendants, QR download
- [ ] Menu management: categories + items with item_type selector + stock controls
- [ ] Promo engine UI: active/inactive cards, toggle, create form
- [ ] Staff management: list + add (all roles)
- [ ] Analytics: all charts + scorecards, plan gate for AI insights
- [ ] Settings: venue profile edit, exit pass validity window config
- **Checkpoint:** Owner has full operational visibility including exit pass audit log ✓

### Phase 13 — Polish & Deploy (Days 48–53)
- [ ] End-to-end test: scan → order → bar/kitchen routing → serve → pay → exit pass → security scan → feedback
- [ ] Mobile audit — customer PWA must be perfect at 375px
- [ ] TV display audit — bar and kitchen displays must be readable at TV distance
- [ ] Low bandwidth simulation test
- [ ] Skeleton screens on all loading states
- [ ] Error + empty states everywhere
- [ ] PWA manifest + service worker validation
- [ ] Deploy backend (Railway/Render) + frontend (Vercel)
- [ ] Production PostgreSQL + Redis + Supabase configured
- **Checkpoint:** Live, functional, mobile-optimized, all interfaces working ✓

---

## 13. ENVIRONMENT VARIABLES

### Backend (`.env`)
```env
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/easyserve
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-key
SUPABASE_BUCKET_MENU=menu-images
EXIT_PASS_DEFAULT_MINUTES=10
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:3000,https://app.easyserve.ng
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000/ws
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 14. NAMING CONVENTIONS

### Python
- Files: `snake_case.py` | Classes: `PascalCase` | Functions: `snake_case`
- Models: singular — `Order`, `Alert`, `ExitPass`, `Feedback`
- Schemas: `OrderCreate`, `OrderUpdate`, `OrderResponse`

### TypeScript
- Components: `PascalCase.tsx` | Utilities/hooks: `camelCase.ts`
- Hooks: `useHookName` | Stores: `camelCaseStore.ts`
- Interfaces: `PascalCase` — no `any` types

### API + Database
- Routes: `kebab-case` | JSON fields: `snake_case` | PKs: UUID
- Tables: `snake_case` plural | FKs: `{table_singular}_id`

---

## 15. DO NOT DO LIST

- ❌ Do NOT use integer IDs — UUID everywhere
- ❌ Do NOT store raw passwords — always bcrypt
- ❌ Do NOT skip `venue_id` scope on any DB query
- ❌ Do NOT expose private venue data on customer endpoints
- ❌ Do NOT put business logic in route handlers — service layer only
- ❌ Do NOT use synchronous SQLAlchemy — async sessions throughout
- ❌ Do NOT allow customer to access another table's order
- ❌ Do NOT hardcode prices on the frontend — always fetch from API
- ❌ Do NOT make WebSocket connections without proper reconnect logic
- ❌ Do NOT use Arial, Inter, Roboto, or system fonts
- ❌ Do NOT use light/white backgrounds
- ❌ Do NOT leave empty states blank — always illustration + CTA
- ❌ Do NOT use `any` type in TypeScript
- ❌ Do NOT build Phase N+1 before Phase N checkpoint is passed
- ❌ Do NOT skip Alembic migrations — never modify DB schema directly
- ❌ Do NOT use hover-only interactions on customer interface
- ❌ Do NOT route food items to the bar display or drink items to the kitchen display
- ❌ Do NOT generate an exit pass before payment is confirmed — cash requires cashier physical confirmation checkbox
- ❌ Do NOT allow the same exit pass QR to be scanned twice — mark as USED on first valid scan
- ❌ Do NOT broadcast bar-only or kitchen-only orders to the general staff channel — use separate WS channels

---

## 16. V5 POST-MVP FEATURE ADDITIONS

> Build these **after** core platform (Phases 1–13) is stable and live. These are included in **Growth** and **Pro** subscription tiers.

### 16.1 WhatsApp Ordering Integration (Growth+)
Link shared via WhatsApp opens existing customer PWA. Customer selects table from dropdown. No bot, no Business API required.

**Already scaffolded:** `order_source` field on orders, `GET /venues/{venue_slug}/menu` endpoint.

**Additional work:**
- Table selection dropdown on menu page when accessed via venue slug URL (not QR)
- WhatsApp share button on cashier terminal and owner dashboard

**Plan:** Growth ✅ | Pro ✅ | Starter ❌

### 16.2 AI & Data Intelligence Layer (Growth+)
Transforms venue transaction data into actionable insights:
- Peak Hour Prediction — alerts venue when to increase staff
- Menu Performance Analytics — best-selling vs low-performing items
- Dynamic Pricing Suggestions — when to apply peak pricing or promotions
- Revenue Anomaly Detection — flags unusual dips (may indicate fraud or theft)
- Customer Lifetime Value Scoring (Pro only)
- Demand Forecasting — stock re-ordering thresholds based on sales velocity

**Plan:** Growth ✅ (basic) | Pro ✅ (full) | Starter ❌

### 16.3 Fraud & Revenue Leakage Detection (Pro only)
8 automated detection rules evaluated every 15 minutes. High-severity rules fire real-time WebSocket alerts. Daily fraud report at 8:00 AM.

**Detection rules:** Item delivered without payment (45 min) | Unusual void pattern (3+ cancels/shift) | Cash payment gap | Unassigned table payment | Revenue gap >10% | After-hours order | Repeated free items | Speed anomaly (<60s delivery)

**Plan:** Starter ❌ | Growth ❌ | Pro ✅

### 16.4 Customer Intelligence Profiles + Loyalty Engine (Pro only)
Customer identified by phone number. Tracks visits, spend, favourite items. Points system with 4 tiers: Standard → Silver → Gold → VIP. Redemption applied on bill.

**Plan:** Starter ❌ | Growth ❌ | Pro ✅

### 16.5 Post-MVP Build Sequence (Phase 14)
- **14A** — WhatsApp Ordering full integration (Week 1)
- **14B** — AI Insights Module (Week 2–3)
- **14C** — Fraud Detection Engine (Week 4)
- **14D** — Customer Intelligence Profiles + Loyalty Engine (Week 5–6)

---

*Last updated: May 2026 | Version: 5.0 | Owner: SMAT Concept & Innovative Solutions Ltd | Product: EasyServe*

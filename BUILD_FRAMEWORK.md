# EASYSERVE — BUILD FRAMEWORK & PROCESS

> How we build EasyServe from zero to live in 48 days (core), then V4 in 4 weeks.

---

## THE GOLDEN RULE
```
Backend phase MUST pass its checkpoint before frontend phase begins.
Phase N+1 never starts before Phase N checkpoint is passed.
```

---

## THE CORE SERVICE FLOW
Everything we build serves exactly this sequence:
```
SCAN QR → BROWSE MENU → PLACE ORDER → PREPARE → DELIVER → PAY
```

---

## BUILD LAYERS AT A GLANCE

```
LAYER 1 ─── Backend Foundation          Phase 1       Days 1–5
LAYER 2 ─── Data Layer (Menu/Tables)    Phase 2       Days 6–8
LAYER 3 ─── Core Transaction Engine     Phases 3–5    Days 9–19
LAYER 4 ─── Smart Features + Analytics  Phases 6–7    Days 20–25
LAYER 5 ─── Frontend (4 interfaces)     Phases 8–11   Days 26–42
LAYER 6 ─── Polish + Ship               Phase 12      Days 43–48
LAYER 7 ─── V4 Feature Block            Phase 13      +4 weeks
```

---

## LAYER 1 — BACKEND FOUNDATION

```
┌──────────────────────────────────────────────────────┐
│                  PHASE 1 (Days 1–5)                  │
│                 BACKEND FOUNDATION                   │
│                                                      │
│  1. Scaffold FastAPI project (exact folder structure)│
│  2. Configure async PostgreSQL + SQLAlchemy          │
│  3. Write all 11 DB models                           │
│     venues / users / tables / menu_categories /      │
│     menu_items / promos / orders / order_items /     │
│     payments / alerts / feedback                     │
│  4. Run first Alembic migration                      │
│  5. JWT auth (register / login / refresh / me)       │
│  6. Venue profile CRUD                               │
│                                                      │
│  ✓ CHECKPOINT: Register venue → login → get profile  │
└──────────────────────────────────────────────────────┘
```

**What to verify before moving on:**
- `POST /auth/register` creates venue + owner user
- `POST /auth/login` returns access + refresh token
- `GET /auth/me` returns user with correct venue_id
- All tables exist in DB with correct columns and constraints

---

## LAYER 2 — DATA LAYER

```
┌──────────────────────────────────────────────────────┐
│                  PHASE 2 (Days 6–8)                  │
│                  MENU & TABLES                       │
│                                                      │
│  1. Menu categories CRUD (owner only)                │
│  2. Menu items CRUD                                  │
│     — availability toggle                            │
│     — stock threshold field                          │
│     — image upload to Supabase Storage               │
│  3. Tables CRUD                                      │
│     — auto-generate unique qr_token (UUID)           │
│  4. QR code PNG generation endpoint                  │
│  5. Promos model + CRUD                              │
│     — start_time, end_time, discount_pct, applies_to │
│                                                      │
│  ✓ CHECKPOINT: Full menu + table management via API  │
└──────────────────────────────────────────────────────┘
```

---

## LAYER 3 — CORE TRANSACTION ENGINE

```
┌──────────────────────────────────────────────────────┐
│              PHASE 3 (Days 9–13)                     │
│            CUSTOMER ORDERING FLOW                    │
│                                                      │
│  GET /customer/menu/{qr_token}                       │
│    — validate qr_token → get venue + table           │
│    — fetch menu items + categories                   │
│    — check active promos, apply discounts            │
│    — return original_price + effective_price         │
│    — return suggestions (if session_token provided)  │
│                                                      │
│  POST /customer/orders/{qr_token}                    │
│    — generate session_token if first order           │
│    — create order (status: open)                     │
│    — add order_items, store effective_price          │
│    — increment order_count on menu_items             │
│                                                      │
│  GET /customer/orders/{session_token}                │
│    — return full order with item statuses            │
│    — this is the live bill endpoint                  │
│                                                      │
│  ✓ CHECKPOINT: Full ordering flow works via API      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 4 (Days 14–16)                    │
│              WEBSOCKET LAYER                         │
│                                                      │
│  ws_manager.py                                       │
│    — ConnectionManager class                         │
│    — connect(venue_id, websocket)                    │
│    — disconnect(venue_id, websocket)                 │
│    — broadcast_to_venue(venue_id, message)           │
│    — send_to_customer(qr_token, message)             │
│                                                      │
│  /ws/{venue_id}?token={jwt}  → staff + owner        │
│  /ws/customer/{qr_token}     → customer bill         │
│                                                      │
│  Events wired up:                                    │
│    new_order        → fires on POST /customer/orders │
│    item_status_update → fires on PATCH item status   │
│    item_status_update → pushed to customer channel   │
│                                                      │
│  ✓ CHECKPOINT: Orders appear real-time on screens    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 5 (Days 17–19)                    │
│             ALERTS & PAYMENTS                        │
│                                                      │
│  POST /customer/alerts/{qr_token}                    │
│    — type: order_more | need_help | urgent |         │
│             request_payment                          │
│    — broadcast new_alert to venue WS channel         │
│                                                      │
│  PATCH /alerts/{id}/acknowledge                      │
│  PATCH /alerts/{id}/resolve                          │
│    — resolve broadcasts alert_resolved to venue      │
│                                                      │
│  POST /payments                                      │
│    — record payment (cash/transfer/pos/card)         │
│    — set order.status → paid                         │
│    — broadcast payment_confirmed to customer channel │
│                                                      │
│  ✓ CHECKPOINT: Full order → payment works E2E        │
└──────────────────────────────────────────────────────┘
```

---

## LAYER 4 — SMART FEATURES + ANALYTICS

```
┌──────────────────────────────────────────────────────┐
│              PHASE 6 (Days 20–22)                    │
│            SUPPORTING FEATURES                       │
│                                                      │
│  Inventory tracking                                  │
│    — increment order_count on every order            │
│    — background task (every 15 min):                 │
│      check order_count >= stock_threshold            │
│      → broadcast inventory_alert to owner+bartender  │
│    — PATCH /menu/items/{id}/reset-count              │
│                                                      │
│  Feedback                                            │
│    — POST /customer/feedback/{order_id}              │
│    — store rating + attended_by                      │
│                                                      │
│  Promo engine                                        │
│    — check time + days in menu endpoint              │
│    — apply discount_pct to matching items            │
│                                                      │
│  Split bill                                          │
│    — split_data JSONB in payments table              │
│    — client sends item→person assignments            │
│                                                      │
│  ✓ CHECKPOINT: All supporting features working       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 7 (Days 23–25)                    │
│             ANALYTICS ENDPOINTS                      │
│                                                      │
│  GET /analytics/summary      → today's revenue,      │
│                                active orders,        │
│                                tables served         │
│  GET /analytics/peak-hours   → orders by hour        │
│  GET /analytics/top-items    → revenue + volume      │
│  GET /analytics/slow-tables  → 45+ min inactive      │
│  GET /analytics/staff-scores → orders/response time  │
│  GET /analytics/feedback     → rating breakdown      │
│  GET /analytics/inventory    → items at threshold    │
│                                                      │
│  All routes: check venue.plan == 'pro'               │
│  Return 403 with upgrade message for 'lite'          │
│                                                      │
│  ✓ CHECKPOINT: All analytics return correct data     │
└──────────────────────────────────────────────────────┘
```

---

## LAYER 5 — FRONTEND (4 INTERFACES)

```
┌──────────────────────────────────────────────────────┐
│              PHASE 8 (Days 26–28)                    │
│              AUTH + SHELL                            │
│                                                      │
│  Setup                                               │
│    npx create-next-app@14 --typescript               │
│    Install: tailwind, zustand, axios, lucide-react,  │
│             recharts, next-pwa                       │
│    Load Google Fonts: Syne + Plus Jakarta Sans       │
│                                                      │
│  globals.css                                         │
│    All CSS variables (colors, fonts, gradients)      │
│    Animation keyframes (fadeSlideUp, pulse-red)      │
│                                                      │
│  Axios instance (lib/axios.ts)                       │
│    baseURL from NEXT_PUBLIC_API_BASE_URL             │
│    Request interceptor: attach Bearer token          │
│    Response interceptor: handle 401, refresh token   │
│                                                      │
│  Zustand stores                                      │
│    authStore: user, token, login(), logout()         │
│    orderStore: current order, items, total           │
│    alertStore: active alerts, add, remove            │
│                                                      │
│  Login page (/login)                                 │
│    Dark themed, teal CTA button, Syne heading        │
│                                                      │
│  Dashboard layout                                    │
│    Desktop: 220px sidebar + main content             │
│    Mobile: bottom tab navigation                     │
│                                                      │
│  ✓ CHECKPOINT: Login works, dashboard shell renders  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 9 (Days 29–33)                    │
│          CUSTOMER PWA (mobile-first 375px)           │
│                                                      │
│  /table/[qr_token]  (main menu page)                 │
│    ┌────────────────────────┐                        │
│    │ VENUE NAME   TABLE 7   │ ← sticky top           │
│    │ [Drinks][Spirits]...   │ ← pill tabs            │
│    │ ORDER AGAIN? (if prev) │ ← reorder strip        │
│    │  ┌────┐ Item Name      │                        │
│    │  │img │ Description    │ ← full-width cards     │
│    │  └────┘ ₦2,500 − 1 +  │                        │
│    │──────────────────────  │                        │
│    │ 🔔 Alert  🛒 2 ₦6,500  │ ← sticky bottom        │
│    └────────────────────────┘                        │
│                                                      │
│  /table/[qr_token]/bill                              │
│    — Each item with live status chip                 │
│    — Status animation: amber→blue→teal→green         │
│    — Total in large teal                             │
│    — "Request Payment" button (teal glow)            │
│    — Split bill toggle                               │
│                                                      │
│  Alert bottom sheet                                  │
│    — Slides up from bottom                           │
│    — 3 large tap targets (56px min height)           │
│    — Toast on send                                   │
│                                                      │
│  /table/[qr_token]/payment (feedback)                │
│    — Full screen, 3 emoji buttons                    │
│    — Clears localStorage after submit                │
│                                                      │
│  useWebSocket hook                                   │
│    — Auto-reconnect on disconnect                    │
│    — ping every 30s                                  │
│    — Handles: item_status_update, payment_confirmed  │
│                                                      │
│  ✓ CHECKPOINT: Customer can scan→order→track→pay     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 10 (Days 34–36)                   │
│           STAFF + BARTENDER INTERFACES               │
│                                                      │
│  /staff  (Attendant Alert Console)                   │
│    ┌────────────────────────┐                        │
│    │ EasyServe  Zone: VIP   │ ← sticky top + clock   │
│    │ [All][VIP][Main]...    │ ← zone filter tabs     │
│    │ ─────────────────────  │                        │
│    │ 🔴 Table 3 — Urgent   │ ← priority sorted      │
│    │ 🟡 Table 7 — Help     │                        │
│    │ 🟢 Table 11 — Order   │ ← live via WebSocket   │
│    │ 🔵 Table 2 — Payment  │                        │
│    │ [Acknowledge][Resolve] │                        │
│    └────────────────────────┘                        │
│    — New alert slides in from top                    │
│    — Red cards pulse continuously                    │
│    — Empty state: ✓ teal "All clear"                 │
│                                                      │
│  /bar  (Bartender Queue — tablet landscape)          │
│    ┌──────────────────────────────────────────────┐  │
│    │ 🍺 BAR QUEUE  [⚠️ Heineken low stock]        │  │
│    │ [TABLE 3]     [TABLE 7]     [TABLE 12]       │  │
│    │ Heineken x2   Whisky x1     Star x3          │  │
│    │ [PREPARING]   [PREPARING]   [PENDING]        │  │
│    └──────────────────────────────────────────────┘  │
│    — Tap item to cycle: Pending→Preparing→Ready      │
│    — New table column slides in from right           │
│    — Done table fades + collapses                    │
│                                                      │
│  ✓ CHECKPOINT: Staff act on orders+alerts real-time  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              PHASE 11 (Days 37–42)                   │
│            OWNER DASHBOARD (desktop 1280px+)         │
│                                                      │
│  ┌────────────┬────────────────────────────────────┐ │
│  │  SIDEBAR   │  TOP BAR                           │ │
│  │ ─────────  │ ──────────────────────────────── │ │
│  │ 📊 Overview│  [₦] Revenue [🔔] Orders          │ │
│  │ 📋 Orders  │  [⚠] Alerts  [📍] Tables Served   │ │
│  │ 📍 Tables  │ ──────────────────────────────── │ │
│  │ 🎯 Promos  │  Revenue Chart (7-day teal line)  │ │
│  │ 👤 Staff   │  Slow Table Alerts (amber banner) │ │
│  │ 📈 Analytics│  Active Alerts Live Feed         │ │
│  │ ⚙️ Settings │                                   │ │
│  └────────────┴────────────────────────────────────┘ │
│                                                      │
│  Pages to build:                                     │
│    /dashboard         — stat cards, charts, feeds    │
│    /dashboard/menu    — categories + items + stock   │
│    /dashboard/tables  — list + QR download           │
│    /dashboard/promos  — toggle, schedule, preview    │
│    /dashboard/staff   — list + add                   │
│    /dashboard/analytics — all charts (Pro gate)      │
│    /dashboard/settings — venue profile edit          │
│                                                      │
│  ✓ CHECKPOINT: Owner has full operational visibility │
└──────────────────────────────────────────────────────┘
```

---

## LAYER 6 — POLISH & SHIP

```
┌──────────────────────────────────────────────────────┐
│              PHASE 12 (Days 43–48)                   │
│              POLISH & DEPLOY                         │
│                                                      │
│  Quality Checks                                      │
│    □ E2E flow: scan → order → serve → pay → feedback │
│    □ Mobile audit at 375px (every customer screen)   │
│    □ Low bandwidth test (throttle to 3G)             │
│    □ Skeleton screens on ALL loading states          │
│    □ Error states (network, 404, 403, 500)           │
│    □ Empty states with illustration + CTA            │
│    □ PWA manifest + service worker valid             │
│    □ Offline queue test (drop connection, reconnect) │
│                                                      │
│  Deploy Sequence                                     │
│    1. Supabase PostgreSQL — provision + migrate      │
│    2. Upstash Redis — provision                      │
│    3. Supabase Storage — create menu-images bucket   │
│    4. Railway/Render — deploy backend, set env vars  │
│    5. Vercel — deploy frontend, set env vars         │
│    6. Test production E2E                            │
│                                                      │
│  ✓ CHECKPOINT: Live, functional, mobile-optimized    │
└──────────────────────────────────────────────────────┘
```

---

## LAYER 7 — V4 FEATURE BLOCK

> Only after Phase 12 is live and stable in production.

```
┌──────────────────────────────────────────────────────┐
│              PHASE 13A — QR Exit Pass (Week 1–2)     │
│                                                      │
│  Problem: customers leaving without paying           │
│  Solution: one-time, 15-min expiring exit QR         │
│                                                      │
│  Customer pays → system generates exit_pass_token    │
│  WebSocket pushes exit_pass_ready to customer        │
│  Customer shows QR to security at door               │
│  Security scans → validates → marks used             │
│  Invalid/expired → security holds customer           │
│                                                      │
│  New: security role, exit pass DB fields,            │
│       /security/{venue_id} PWA view                  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│           PHASE 13B — WhatsApp Ordering (Week 2)     │
│                                                      │
│  Problem: customers discover via WhatsApp            │
│  Solution: share link → opens customer PWA           │
│                                                      │
│  Link: /order/{venue_slug}?src=whatsapp              │
│  Customer picks table from dropdown                  │
│  Same order flow as QR scan                          │
│  Staff see 📱 WhatsApp badge on order cards          │
│  Analytics: order_source breakdown                   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│         PHASE 13C — Fraud Detection (Week 3)         │
│                           Pro plan only              │
│                                                      │
│  8 Detection Rules (batch every 15 mins):            │
│    🟡 Item delivered, no payment in 45 mins          │
│    🔴 3+ order cancels by same staff/shift           │
│    🔴 Cash amount < order total                      │
│    🟡 Payment on table with no assigned attendant    │
│    🔴 Orders vs paid items differ >10%               │
│    🟡 Order placed outside business hours            │
│    🔴 Same item marked free >3x by same staff        │
│    🟡 Order marked delivered in <60 seconds          │
│                                                      │
│  Daily fraud report at 8:00 AM on owner dashboard   │
│  All alerts are permanent audit records              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│         PHASE 13D — Loyalty Engine (Week 4)          │
│                           Pro plan only              │
│                                                      │
│  Customer identified by phone number (optional)      │
│  Profile tracks: visits, spend, favourite items      │
│                                                      │
│  Loyalty Tiers                                       │
│    Standard  (0+)     → basic tracking               │
│    Silver    (500+)   → 5% discount                  │
│    Gold      (1,500+) → 10% discount + priority tag  │
│    VIP       (5,000+) → 15% discount + free item     │
│                                                      │
│  Customer features:                                  │
│    "Your Usuals" section on menu (top 3 items)       │
│    Points balance on bill screen                     │
│    "Redeem Points" button on bill                    │
│    "+50 points" notification after payment           │
└──────────────────────────────────────────────────────┘
```

---

## DATA FLOW DIAGRAM

```
CUSTOMER (browser, no account)
    │
    │  1. scans QR → GET /customer/menu/{qr_token}
    │                returns: menu items + promo prices
    │
    │  2. taps items → POST /customer/orders/{qr_token}
    │                  body: items[], session_token (or null)
    │                  returns: order_id, session_token
    │
    │  WebSocket broadcast →────────────────────────────┐
    │                                                   ▼
    │                                    BARTENDER + ATTENDANT
    │                                    see new_order in real-time
    │
    │  3. tracks bill → GET /customer/orders/{session_token}
    │  (also via WS: item_status_update events)
    │
    │  4. taps "Request Payment" → POST /customer/alerts/{qr_token}
    │                              type: request_payment
    │
    │  WebSocket broadcast →────────────────────────────┐
    │                                                   ▼
    │                                    ATTENDANT
    │                                    sees 🔵 Payment alert
    │                                    goes to table, collects
    │
    │  5. Attendant records: POST /payments
    │                        order → paid
    │
    │  WebSocket push →─────────────────────────────────┐
    │                                                   ▼
    │                                    CUSTOMER
    │                                    sees payment_confirmed
    │
    │  6. Feedback screen shown → POST /customer/feedback
    │     session_token cleared from localStorage
    │
    ▼
  DONE
```

---

## WEBSOCKET CHANNEL ARCHITECTURE

```
Redis Pub/Sub
    │
    ├── channel: venue:{venue_id}
    │     Subscribers: all owner + staff WebSocket connections
    │     Events published:
    │       new_order, order_item_update, new_alert,
    │       alert_resolved, inventory_alert, payment_recorded
    │
    └── channel: customer:{qr_token}
          Subscribers: customer's WebSocket connection
          Events published:
            item_status_update, payment_confirmed, exit_pass_ready
```

---

## DAILY DECISION CHECKLIST

Before writing any code, ask:

| Check | Question |
|-------|----------|
| Scope | Does this DB query filter by `venue_id`? |
| Layer | Is business logic in the service layer, not the router? |
| Auth | Is this endpoint protected by the right role? |
| Async | Is SQLAlchemy async throughout (no sync sessions)? |
| IDs | UUID everywhere (no integer IDs)? |
| Theme | Dark background, Syne+Jakarta Sans fonts, teal accent? |
| Touch | Touch-first on customer UI (no hover-only interactions)? |
| Phase | Did the previous phase pass its checkpoint? |

---

## TECH DECISIONS — WHY WE CHOSE WHAT WE CHOSE

| Decision | Why |
|----------|-----|
| FastAPI over Django/Flask | Native async, automatic OpenAPI docs, excellent WebSocket support |
| SQLAlchemy async over Tortoise ORM | More mature, better control, blueprint requirement |
| Redis for WS pub/sub | Allows horizontal scaling — multiple backend instances share state |
| Next.js 14 App Router | Server components for fast initial load on customer PWA |
| Zustand over Redux | Simpler API, less boilerplate for 3 small stores |
| Native WebSocket over Socket.io | No extra dependency, reconnect logic in `useWebSocket` hook |
| Supabase for DB + Storage | Managed PostgreSQL + S3-compatible storage in one provider |
| PWA over native app | Zero friction for customers — scan, browse, done (no install) |

---

## MILESTONE DATES (48-DAY CORE TARGET)

| Milestone | Day | What's Done |
|-----------|-----|-------------|
| Backend API complete | Day 25 | All endpoints, WS, background tasks working |
| Frontend shell + auth | Day 28 | Login, dashboard layout, design system |
| Customer PWA live | Day 33 | Full scan → order → pay flow in browser |
| Staff interfaces live | Day 36 | Alerts + bar queue working real-time |
| Owner dashboard live | Day 42 | Full operational visibility |
| Production deployed | Day 48 | Live on Railway + Vercel + Supabase |
| V4 complete | Day 48+28 | Exit pass, WhatsApp, fraud, loyalty |

---

*Last updated: May 2026 | EasyServe by SMAT Concept & Innovative Solutions Ltd*

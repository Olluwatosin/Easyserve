# EasyServe

**Hospitality Operating System for African nightlife venues.**
Built by SMAT Concept & Innovative Solutions Ltd.

Guests scan a QR code at their table, order from their own phone, and pay before
they leave. Orders route automatically to the bar or kitchen screen, the assigned
attendant gets buzzed when they're ready, and a signed QR exit pass at the door
proves the bill was settled.

```
SCAN → ORDER → ROUTE → PREPARE → DELIVER → PAY → EXIT VERIFIED
```

---

## Contents

- [Quick start](#quick-start)
- [The demo venue](#the-demo-venue)
- [Architecture](#architecture)
- [Roles and interfaces](#roles-and-interfaces)
- [Environment variables](#environment-variables)
- [Tests](#tests)
- [Database migrations](#database-migrations)
- [Deployment](#deployment)
- [Operational runbook](#operational-runbook)
- [Things that will bite you](#things-that-will-bite-you)

---

## Quick start

Requires Docker and [uv](https://docs.astral.sh/uv/).

```bash
git clone <repo> && cd EasyServe
cp backend/.env.example backend/.env          # then edit SECRET_KEY
cp frontend/.env.local.example frontend/.env.local

docker compose up --build                     # api :8000, web :3000, db, redis
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py    # full demo venue
```

- Web app — http://localhost:3000
- API docs — http://localhost:8000/docs
- Health — http://localhost:8000/health

### Without Docker

```bash
uv sync                                       # workspace root
cd backend && uv run alembic upgrade head
uv run uvicorn app.main:app --reload

cd frontend && npm install --legacy-peer-deps && npm run dev
```

You still need Postgres and Redis running somewhere; point `DATABASE_URL` and
`REDIS_URL` at them. Redis is optional in development — the WebSocket manager
falls back to single-instance mode and logs a warning.

---

## The demo venue

`backend/seed.py` builds **The Grand Noir** — a complete fictional lounge with
staff, menu, promos, live orders and exit passes. It is the fastest way to see
the whole product, and it's what the public demo runs on.

| Who | Role | Login |
|-----|------|-------|
| Owner | `owner` | `owner@grandnoir.com` / `GrandNoir2024!` |
| Emeka | `bartender` | PIN `1111` |
| Ngozi | `kitchen` | PIN `2222` |
| Tunde | `cashier` | PIN `3333` |
| Amara | `attendant` | PIN `4444` |
| Olu | `security` | PIN `5555` |

Staff sign in at `/pin-login` — built for shared floor devices, so nobody types
an email at 1am. Owners sign in at `/login`.

To walk the guest side, open a table's QR from the owner's Tables page
(`GET /api/v1/tables/{id}/qr`) or hit `/table/{qr_token}` directly.

---

## Architecture

```
                    ┌──────────────┐
   Guest phone ────►│              │
   (no app, PWA)    │   Next.js    │◄──── Staff phones / bar & kitchen TVs
                    │   App Router │
                    └──────┬───────┘
                           │ REST + WebSocket
                    ┌──────▼───────┐
                    │   FastAPI    │──── Paystack (webhook-confirmed payments)
                    │   async      │
                    └──┬────────┬──┘
                       │        │
                ┌──────▼──┐  ┌──▼──────┐
                │ Postgres│  │  Redis  │  pub/sub fanout across workers
                └─────────┘  └─────────┘
```

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend | FastAPI + SQLAlchemy 2.x async | Async throughout, no sync sessions |
| Database | PostgreSQL 16 | Alembic migrations, never edit schema directly |
| Real-time | Native WebSockets + Redis pub/sub | Five per-venue channels |
| Frontend | Next.js 14 App Router, TypeScript | Zustand state, Tailwind, PWA |
| Payments | Paystack | Card / bank transfer / USSD |
| Proxy | Caddy | Automatic HTTPS in production |

### Backend layout

```
backend/app/
  routers/     HTTP + WebSocket endpoints (73 REST routes, 5 WS channels)
  services/    Business logic — orders, payments, routing, analytics, alerts
  models/      SQLAlchemy models
  schemas/     Pydantic request/response contracts
  utils/       Security, rate limiting, QR generation
```

Routers stay thin; anything with real logic lives in `services/`.

---

## Roles and interfaces

| Role | Route | What they do |
|------|-------|--------------|
| `owner` | `/owner` | Dashboard, menu, tables, staff, promos, analytics, tonight summary |
| `attendant` | `/staff` | Order alerts, ready buzzes, mark delivered |
| `bartender` | `/bar` | Live drink queue on a TV, mark ready |
| `kitchen` | `/kitchen` | Live food queue on a TV, mark ready |
| `cashier` | `/cashier` | Confirm payment, issue exit pass |
| `security` | `/security` | Scan exit passes — VALID / EXPIRED / USED |
| guest | `/table/[qr_token]` | Menu, order, tab, bill, pay |

---

## Environment variables

Backend — see `backend/.env.example`.

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `postgresql+asyncpg://…` |
| `SECRET_KEY` | yes | ≥32 chars. **Boot fails outside development if it's the placeholder.** |
| `REDIS_URL` | no | Omit for single-instance WebSockets |
| `FRONTEND_URL` | yes in prod | **Baked into printed table QR codes — see below** |
| `ALLOWED_ORIGINS` | yes in prod | Comma-separated CORS allowlist |
| `PAYSTACK_SECRET_KEY` | no | Empty disables online payment (endpoints return 503) |
| `SENTRY_DSN` | no | No-op when empty |

Frontend — `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`. Both are baked in at
**build** time, so changing them requires a rebuild, not a restart.

---

## Tests

```bash
cd backend && uv run python -m pytest -v
```

Use `python -m pytest`, not `uv run pytest` — the latter resolves `pytest` from
`PATH` and will silently pick up a shadowing system interpreter.

CI runs the suite against real Postgres and Redis service containers, then lints
and builds the frontend.

---

## Database migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "what changed"
uv run alembic upgrade head
uv run alembic downgrade -1
```

Use `uv run alembic`, **not** `python -m alembic` — `backend/alembic/` shadows
the installed package and the module form fails with a confusing import error.

Migrations run automatically on container start in production. The chain is
linear — check `alembic history` before adding one, and never edit a migration
that has been applied anywhere real.

---

## Deployment

### Production (a venue depends on this)

A small VPS running the compose stack. Caddy gets certificates automatically.

```bash
# On the VPS, with a .env beside docker-compose.prod.yml:
#   APP_DOMAIN, API_DOMAIN, SECRET_KEY, POSTGRES_PASSWORD,
#   ALLOWED_ORIGINS, PUBLIC_API_URL, PUBLIC_WS_URL
#   optional: PAYSTACK_SECRET_KEY, SENTRY_DSN
docker compose -f docker-compose.prod.yml up --build -d
```

Gives you Caddy on 80/443 with automatic HTTPS, Postgres and Redis behind health
gates, Alembic on boot, and four uvicorn workers with Redis pub/sub fanning
WebSocket events between them.

Pushing to `main` triggers CI and SSH-deploys via the `VPS_HOST`, `VPS_USER`,
`VPS_SSH_KEY` and `VPS_PATH` repository secrets.

The deploy job is gated on a repository **variable** `VPS_CONFIGURED=true`, so it
stays skipped until a server actually exists. Set the four secrets, then set that
variable to switch it on. Without the gate the job fails on every push purely
because the secrets are unset, which teaches you to ignore a red CI — the one
thing CI must never do.

### Free demo

Vercel (frontend) + Render (backend) + Neon (Postgres), no Redis, single worker.
See `docs/DEPLOY_DEMO.md`.

### Backups

`scripts/backup.sh` dumps Postgres and the uploads volume to S3-compatible
storage nightly. **Wire it into cron and restore from it once before go-live** —
an untested backup is not a backup.

---

## Operational runbook

| Symptom | First thing to check |
|---------|---------------------|
| Site down | `curl https://<api>/health` — returns 503 when Postgres is unreachable |
| Orders not appearing live | Redis. WebSockets degrade to per-worker mode; the manager retries with backoff and self-heals |
| Payments not confirming | Paystack webhook URL points at `API_DOMAIN`, and `PAYSTACK_SECRET_KEY` matches the dashboard |
| Guest QR codes 404 | `FRONTEND_URL` no longer matches the printed codes — see below |
| Staff locked out | `tokens_valid_after` on the user revokes all live sessions; a password change sets it |

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml exec db psql -U easyserve easyserve
```

---

## Things that will bite you

**Printed QR codes hard-code your domain.** `GET /tables/{id}/qr` bakes
`FRONTEND_URL` into the image as `{FRONTEND_URL}/table/{qr_token}`. Change the
domain after printing and every code in the venue is dead. **Buy and configure
the real domain before printing anything.**

**Frontend env vars are build-time.** `NEXT_PUBLIC_*` values are compiled into
the bundle. Changing the API URL means a rebuild.

**`SECRET_KEY` rotation logs everyone out**, staff and guests, immediately.

**Bill charges are snapshots.** Service charge and VAT are computed onto the
order when it changes, so editing venue percentages never rewrites an existing
bill. That's deliberate — don't "fix" it.

**Exit pass status is computed, not stored.** It derives from `expires_at` and
`used_at`, so there's no expiry job to forget.

**The webhook is the source of truth for online payments.** Never confirm a
Paystack payment from a client callback; `confirm_gateway_payment` is idempotent
and rejects underpayment on purpose.

**`python -m alembic` doesn't work from `backend/`.** The local `alembic/`
directory shadows the installed package. Use `uv run alembic`.

**`uv run pytest` can resolve the wrong pytest.** Use `uv run python -m pytest`,
which pins it to the project venv.

**Promo time windows can't cross midnight.** `apply_promo` compares against UTC
with `start_time <= now <= end_time`, so a 22:00–02:00 happy hour — the normal
shape for nightlife — never matches. Windows are also UTC, not WAT. Both need
fixing before promos are sold as a feature.

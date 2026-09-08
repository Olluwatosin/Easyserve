# Deploying the free demo

The public demo — a seeded venue anyone can click through, at ₦0/month.

**This is not the production stack.** A real venue runs `docker-compose.prod.yml`
on a VPS. Free tiers sleep, have no backup guarantee, and no support path. Never
put a paying venue on this.

| Layer | Service | Cost |
|-------|---------|------|
| Database | Neon Postgres | free |
| Backend | Render web service (Docker) | free |
| Frontend | Vercel | free |
| Redis | *omitted* — single worker, in-process WebSockets | — |
| Keep-warm + hourly reset | GitHub Actions | free |

---

## Before you start

Generate two secrets and keep them somewhere you can paste from:

```bash
openssl rand -hex 32   # SECRET_KEY
openssl rand -hex 32   # DEMO_RESET_TOKEN
```

> **There is a chicken-and-egg here.** The backend needs the frontend's URL for
> CORS; the frontend bakes the backend's URL in at build time. So you deploy the
> backend with a placeholder, deploy the frontend, then come back and fix the
> backend's two URL variables. Step 4 is that second pass — don't skip it.

---

## 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech). Pick the region closest to
   Nigeria (usually `eu-central-1`).
2. Copy the **pooled** connection string.
3. Rewrite it for SQLAlchemy's async driver:

```
postgresql+asyncpg://USER:PASSWORD@HOST/DBNAME?ssl=require
```

**Two edits that will cost you an hour if you miss them:**

- The scheme must be `postgresql+asyncpg://`, not `postgres://`.
- The SSL parameter must be **`?ssl=require`**. Neon hands you
  `?sslmode=require`, which asyncpg does not understand and which fails with a
  confusing `invalid dsn` error. Also strip `&channel_binding=...` if present.

Migrations run automatically when the backend boots, so there's nothing to run
here by hand.

---

## 2. Backend — Render

1. New → **Blueprint**, point it at this repo. Render reads `render.yaml`.
2. Fill in the variables it marks as required:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | the rewritten Neon URL from step 1 |
| `SECRET_KEY` | your first generated secret |
| `DEMO_RESET_TOKEN` | your second generated secret |
| `ALLOWED_ORIGINS` | `http://localhost:3000` for now — fixed in step 4 |
| `FRONTEND_URL` | `http://localhost:3000` for now — fixed in step 4 |
| `SENTRY_DSN` | optional |

`ENVIRONMENT=demo` is already set in the blueprint. It does two things: it makes
the config validator demand a real `SECRET_KEY`, and it's one of the two guards
on the reset endpoint.

3. Deploy, then confirm:

```bash
curl https://<your-api>.onrender.com/health
# {"status":"ok","version":"5.0.0","db":"up","redis":"down"}
```

`"redis":"down"` is **expected and correct** here — there is no Redis, and the
WebSocket manager falls back to in-process fanout on purpose.

4. Seed the venue:

```bash
curl -X POST -H "X-Demo-Token: <DEMO_RESET_TOKEN>" \
  https://<your-api>.onrender.com/api/v1/demo/reset
```

A `404` means a guard rejected you: either `ENVIRONMENT` isn't `demo`, or the
token doesn't match. The endpoint 404s rather than 403s so it doesn't advertise
its own existence.

---

## 3. Frontend — Vercel

1. Import the repo. **Set Root Directory to `frontend`** — this is the one
   setting people miss.
2. Environment variables, for all environments:

```
NEXT_PUBLIC_API_URL = https://<your-api>.onrender.com/api/v1
NEXT_PUBLIC_WS_URL  = wss://<your-api>.onrender.com
```

Note `wss://`, not `https://`, and no `/api/v1` on the WebSocket URL.

3. Deploy. Note the resulting `https://<your-app>.vercel.app`.

`NEXT_PUBLIC_*` values are compiled into the client bundle at **build** time.
Changing them later requires a redeploy, not a restart.

---

## 4. Second pass — point the backend at the real frontend

Back in Render, update:

```
ALLOWED_ORIGINS = https://<your-app>.vercel.app
FRONTEND_URL    = https://<your-app>.vercel.app
```

No trailing slashes — `ALLOWED_ORIGINS` is compared exactly, and a trailing
slash produces CORS failures that look like the API being down.

Redeploy the backend. Until you do this, the frontend loads but every API call
is blocked by CORS.

---

## 5. Keep it warm

In the repo's **Settings → Secrets and variables → Actions**:

- Variable `DEMO_API_URL` = `https://<your-api>.onrender.com`
- Secret `DEMO_RESET_TOKEN` = the same token as the backend

`.github/workflows/demo-keepalive.yml` then pings `/health` every 10 minutes so
the service never sleeps, and reseeds the venue hourly so the last visitor can't
leave it in a broken state.

Run it once by hand from the Actions tab (**Run workflow**, tick *reset*) to
confirm both jobs pass before you rely on it.

> GitHub disables scheduled workflows on repositories with no activity for 60
> days. If the demo goes cold, check the Actions tab first.

---

## 6. Check it end to end

Walk the whole loop before you send the link to anyone:

- [ ] `/login` — `owner@grandnoir.com` / `GrandNoir2024!`
- [ ] `/owner/tonight` shows revenue and live orders
- [ ] `/owner/tables` — open a table's QR, scan it with a real phone
- [ ] Guest page loads, menu shows promo pricing, you can place an order
- [ ] `/bar` on another device shows that order appear **live** (this is the moment that sells it)
- [ ] `/pin-login` with `3333` reaches the cashier screen
- [ ] Cashier records a cash payment, exit pass QR appears
- [ ] `/security` scans that pass → VALID, then scanning again → USED

That last pair is the product's whole thesis. Make sure it works before a venue
owner sees it.

---

## What the demo deliberately doesn't do

- **No Paystack.** `PAYSTACK_SECRET_KEY` is unset, so online payment endpoints
  return 503 rather than touching a live merchant account. Demo cash payments
  through the cashier screen instead.
- **No Redis**, so WebSocket events don't cross workers. Irrelevant at one worker.
- **No backups.** It's disposable by design and wiped hourly.
- **No custom domain yet** — and that's fine *here*. But see below.

---

## Before the pilot venue: buy the domain first

`GET /tables/{id}/qr` bakes `FRONTEND_URL` into the QR image as
`{FRONTEND_URL}/table/{qr_token}`. That PNG is what gets printed onto table
tents.

If you print a venue's QR codes while `FRONTEND_URL` points at a `.vercel.app`
address and then move to `easyserve.ng`, **every printed code in the venue
stops working.** You reprint all of them, or you're stuck on the temporary
domain permanently.

Demo on `.vercel.app` for as long as you like. Just buy and configure the real
domain before a single QR code goes to print.

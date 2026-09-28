# Putting easyserveng.com live

Order matters. Steps 1–5 are reversible; **step 6 is not**, because it puts
addresses on furniture.

Two hosts stay where they are — Truehost is the registrar only, and its
nameservers do the pointing:

| What | Where it runs | Address |
|---|---|---|
| Guest + staff app | Vercel | `easyserveng.com`, `www.easyserveng.com` |
| API + WebSockets | Render | `api.easyserveng.com` |

Do not host the app on Truehost shared hosting. It serves PHP and static files;
this is a Next.js app and a Python API, and neither runs there.

---

## 0. Where the domain stands

Checked against the .com registry on 2026-09-28:

```
easyserveng.com   active
registered        2026-09-28 10:48 UTC
expires           2027-09-28
nameservers       NS1.CLOUDOON.COM, NS2.CLOUDOON.NET, NS3.CLOUDOON.ORG
```

Cloudoon is Truehost's nameserver brand, so DNS is edited in the Truehost panel
— which is what step 1 assumes.

The zone was not yet answering when this was written (resolvers returned
SERVFAIL, not "no such domain"). That is the normal state for a domain a few
hours old: the registry knows who is authoritative, and the nameservers have not
started serving it. It clears itself, usually within a few hours and sometimes up
to 48. Nothing to fix — add the records in step 1 and they will start resolving
as the zone comes up.

Recheck without needing `dig`:

```sh
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=easyserveng.com&type=A'
```

`"Status": 0` with an `Answer` means it is live. `"Status": 2` is still waiting;
`"Status": 3` would mean the name genuinely does not resolve, which at that point
would be a records problem rather than propagation.

---

## 1. DNS, in the Truehost control panel

Truehost's DNS editor is under **Domains → Manage → DNS Zone Editor** (their
panel is cPanel-based, so it may read "Zone Editor").

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 3600 |
| CNAME | `www` | `cname.vercel-dns.com` | 3600 |
| CNAME | `api` | `easyserve-demo-api.onrender.com` | 3600 |

Notes that save an evening:

- **Delete the parking records first.** Truehost points a new domain at its own
  landing page with an A record on `@` and often a `www` CNAME. Both must go, or
  the apex resolves to two places and roughly half of all requests reach
  Truehost's "coming soon" page instead. That failure looks intermittent, which
  is the worst kind to debug.
- **Do not proxy through Cloudflare yet.** It works, but it terminates TLS
  itself, and until the certificates below are issued it turns a clear error into
  a redirect loop.
- Render will give you the exact CNAME target when you add the domain in step 3.
  Use theirs if it differs from the line above.

## 2. Vercel

1. **Settings → Domains** → add `easyserveng.com` and `www.easyserveng.com`.
   Set one as primary and let the other redirect — `www` → apex is the usual
   choice.
2. **Settings → Environment Variables**, Production:

   ```
   NEXT_PUBLIC_API_URL  = https://api.easyserveng.com/api/v1
   NEXT_PUBLIC_WS_URL   = wss://api.easyserveng.com
   NEXT_PUBLIC_SITE_URL = https://easyserveng.com
   ```

   `NEXT_PUBLIC_*` values are baked in at build time, so **redeploy after
   saving** — editing them changes nothing until a new build runs.

   `NEXT_PUBLIC_WS_URL` is `wss://`, not `https://`. A plain `https` scheme here
   fails to connect with nothing in the UI to explain it: orders simply stop
   appearing on the bar screen while every page still loads.

## 3. Render

1. **Settings → Custom Domains** → add `api.easyserveng.com`. Render verifies it
   against the CNAME from step 1 and issues a certificate, usually in minutes.
2. **Environment** → set:

   ```
   ALLOWED_ORIGINS = https://easyserveng.com,https://www.easyserveng.com
   FRONTEND_URL    = https://easyserveng.com
   ```

   `ALLOWED_ORIGINS` is comma-separated with **no spaces after the commas** — the
   value is split on `,` and each entry compared exactly, so `, https://…` never
   matches and every request from that origin fails CORS.

   Include `www` even if it redirects. The redirect happens in the browser, and a
   request that started at `www` can still arrive carrying that origin.

   `FRONTEND_URL` is what Paystack sends a guest back to after paying — get it
   wrong and payment succeeds while the guest lands on a dead page, which reads
   to them as losing their money.

## 4. Paystack

**Settings → API Keys & Webhooks:**

```
Webhook URL   https://api.easyserveng.com/api/v1/payments/webhook/paystack
```

Note the order: `payments/webhook/paystack`, not `paystack/webhook`.

The callback is not configured here — the API sends it per transaction from
`FRONTEND_URL`, so step 3 already covers it.

Set the **live** keys in Render (`PAYSTACK_SECRET_KEY`) when you are ready to
take real money. Until then test keys are correct, and the webhook URL is the
same either way. Set that value in the Render dashboard yourself — a secret key
should not pass through a chat, a repo, or a file on a laptop.

## 5. Check it before anyone else does

```sh
curl https://api.easyserveng.com/health
# {"status":"ok","version":"5.0.0","db":"up", ...}
```

Then, in a browser:

- `https://easyserveng.com` loads and the owner can sign in
- a table QR page opens and shows the menu
- the bar screen receives an order placed from a phone — this is the one that
  proves `NEXT_PUBLIC_WS_URL` is right, and nothing else does
- pay a test order; the guest returns to the bill on `easyserveng.com`
- scan the exit pass QR from the security screen on a second phone

## 6. Only now, print the QR codes

The print sheet reads `NEXT_PUBLIC_SITE_URL`, so once step 2 is deployed the
stickers say `easyserveng.com` even if you print them from somewhere else. The
sheet tells you which address it is encoding — read that line before spending
money at a print shop.

`https://easyserveng.com/print/tables`

A table's QR token never changes once issued: renaming a table, re-zoning it or
changing its minimum spend all leave the sticker working, and the demo reset
preserves tokens too. So these are printed once, and only a new table needs a
new one.

## What does not need touching

- **Table QR tokens** — the domain is in the printed URL, not the token.
- **Staff PINs and passwords** — unrelated to the domain.
- **The database** — no migration, no data change.

## If something is wrong

| Symptom | Almost always |
|---|---|
| Apex shows a Truehost parking page | A leftover `@` A record from step 1 |
| App loads, every request fails | `ALLOWED_ORIGINS` missing the origin, or a space after a comma |
| Pages fine, nothing updates live | `NEXT_PUBLIC_WS_URL` not `wss://`, or not redeployed |
| Payment works, guest lands nowhere | `FRONTEND_URL` still the Vercel address |
| Certificate warning | DNS still propagating; wait, do not re-add the domain |

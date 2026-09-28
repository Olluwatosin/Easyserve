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

### 1a. Find the right screen — there are two, and only one will work

Truehost's client area is WHMCS; its hosting is cPanel. DNS lives in a different
place depending on whether this domain has hosting attached to it.

**Start here:** log in at `my.truehost.cloud` (or whichever Truehost client area
you bought through) → top menu **Domains** → **My Domains** → click
`easyserveng.com` → look down the left sidebar.

- If you see **DNS Management** in that sidebar, that is the screen. Use it.
- If there is no such entry, this domain is attached to a hosting package, and
  DNS is in **cPanel → Domains → Zone Editor** instead. Same records either way;
  only the form differs.

If **DNS Management** opens empty, errors, or says there is no zone for this
domain, that is the lame delegation described above. Opening the page is often
enough to create the zone. If it is not, raise a ticket with exactly this:

> easyserveng.com is delegated to NS1/2/3.CLOUDOON.COM but the nameservers
> return SERVFAIL for the zone — please create the DNS zone for this domain.

That is a two-minute fix on their side, and it is not something you can do from
the panel.

### 1b. Delete what is already there

A newly registered Truehost domain usually arrives with records pointing at their
own parking page — typically an `A` on the root and a `CNAME` or `A` on `www`,
sometimes a `URL Redirect`.

**Delete those two before adding yours.** Not edit — delete. If an old root `A`
survives beside the new one, DNS hands out both addresses in rotation and roughly
half of all visitors land on Truehost's "coming soon" page. The site then appears
to work intermittently, which is far harder to diagnose than being broken.

Leave alone: `MX` records, `TXT` records (SPF/DKIM), and the `NS` records. Those
are mail and delegation; nothing here touches them.

### 1c. Add the three records

| Type | Name | Value / Points to |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `api` | `easyserve-demo-api.onrender.com` |

**The Name field is where this goes wrong.** Panels disagree about whether they
want the label or the whole hostname, and they do not tell you which:

- If the field shows the domain as a greyed-out suffix, or a hint like
  `.easyserveng.com`, type only `www` and `api`, and `@` for the root.
- If it expects a full hostname — WHMCS DNS Management usually does — type
  `easyserveng.com`, `www.easyserveng.com`, `api.easyserveng.com`.

Get it the wrong way round and you create `www.easyserveng.com.easyserveng.com`,
which resolves for nobody. **Save one record, then check how the panel displays it
back to you** — the saved list shows the true name, and it is the only reliable
way to tell which convention you are in. Fix the first one before adding the other
two.

Two more things the form may ask:

- **TTL**: `3600` if offered. If there is no TTL field, WHMCS is managing it;
  that is fine.
- **Priority**: only used by `MX`. Leave blank or `0`.

Why the root is an `A` and not a `CNAME`: DNS does not allow a CNAME on the root
of a domain alongside the NS records that have to live there. Vercel publishes
`76.76.21.21` as a fixed anycast address for exactly this reason. Subdomains have
no such restriction, which is why `www` and `api` are CNAMEs.

### 1d. Confirm before moving on

```sh
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=easyserveng.com&type=A'
```

Looking for `"Status": 0` and `"data": "76.76.21.21"`. Then the same for
`www.` and `api.`.

`"Status": 2` means the zone is still not being served — back to 1a. `"Status": 3`
means it resolves but that name has no record, which is a typo in the Name field
— back to 1c.

Give it 15–30 minutes after saving. If a record was queried while wrong, the bad
answer may be cached for up to its TTL.

### 1e. If the Truehost panel fights you

Truehost's DNS editor is limited, and their nameservers have already proved slow
to serve a new zone. A common alternative is to keep Truehost as the **registrar**
and move DNS to Cloudflare, which is free:

1. Add `easyserveng.com` as a site in Cloudflare; it imports what it can find.
2. Add the three records above, and set each to **DNS only** — the grey cloud,
   not the orange one.
3. In Truehost: **Domains → My Domains → easyserveng.com → Nameservers**, and
   replace the Cloudoon entries with the two Cloudflare gives you.

Keep the proxy off. Proxying works, but Cloudflare then terminates TLS itself and
will not pass a WebSocket upgrade through on the free plan without care — so
orders stop reaching the bar screen while every page still loads. That is the
hardest failure in this whole document to diagnose, and turning the proxy on is
the only way to cause it.

This is optional. The records in 1c are the same either way.

---

One more thing, once you reach step 3: Render shows you the exact CNAME target
for `api` when you add the custom domain. If it differs from
`easyserve-demo-api.onrender.com`, use Render's value and update the record.

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

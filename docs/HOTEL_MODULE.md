# Hotel module — blueprint

**Status:** not built. The capability exists (`hotel.rooms`, `hotel.bookings`)
and is granted by no plan below enterprise, so this can be merged and deployed
without changing anything for a working venue.

**Why it is written down before it is built:** the lounge opens first, and the
hotel work has to happen alongside a system people are already trading on. A
module that arrives as one large merge after two months on a branch is how a
working system gets disrupted. This describes something that can land in pieces,
dark, and be switched on for one venue when it is ready.

---

## The situation this is for

One owner, one building, a lounge and a hotel, both brand new. No existing
system on either side, no data to migrate, no habits to fight.

That last part is the opportunity: a guest staying upstairs and drinking
downstairs is **one customer**, and nobody selling him a lounge POS or a hotel
PMS can see both. That is the feature worth building, and everything below is
arranged around making it possible.

## The decision that shapes everything

**Rooms belong to the same venue as the lounge — not a second venue.**

`User.venue_id` is singular and there is nothing above venue, so two properties
would mean two accounts, two logins, two sets of staff, and no way for a lounge
bill to reach a room. For one owner in one building that is all cost and no
benefit.

A proper `organisation` layer above venue is the correct general answer and will
be needed the day a hotel *chain* asks. It is a migration rather than a rewrite,
because `venue_id` is already threaded through every table. Do it when a chain
asks, not before.

## What to build, in the order it earns its keep

### Phase 1 — Occupancy (about a week)

Not reservations. A new hotel takes its first bookings by phone, WhatsApp and
walk-in, and a notebook handles that fine at low volume. What a notebook cannot
do is tell the lounge cashier that the man ordering a bottle is in Room 204.

- `rooms` — number, type, nightly rate, status (clean / occupied / out of service)
- `stays` — a guest in a room: checked in, expected out, actually out
- Check-in and check-out screens, shaped like the existing station screens
- **Charge to room** from the lounge: an order settles against an open stay
  instead of a payment
- Checkout settles the folio — room nights plus everything charged to it —
  through the payment path that already works

This phase alone is what makes him want the product. It needs no availability
engine, no calendar, no rate rules.

### Phase 2 — Reservations (later, and larger)

Only once his real booking flow has been watched rather than guessed.

- Availability across date ranges, which is the part that is genuinely hard
- Rates by season and day of week
- Deposits, cancellation, no-show policy
- Overbooking rules, if he wants them

Its failure mode is a guest in reception at 11pm with nowhere to sleep, so it
does not get rushed for a launch date.

### Phase 3 — What only this product can say

- What a staying guest spends downstairs versus a walk-in
- Occupancy against lounge takings on the same night
- Which room types bring the guests who spend

## Data model sketch

Everything hangs off the existing venue. Nothing here requires a change to a
table the lounge already uses, except one nullable column on `orders`.

```
rooms
  id, venue_id, number, room_type, rate_per_night,
  status, is_active

stays                                   -- a guest, in a room, for some nights
  id, venue_id, room_id,
  guest_name, guest_phone,
  checked_in_at, expected_out, checked_out_at,
  status,                               -- in_house | departed | cancelled
  business_date                         -- stamped, like orders and payments

folio_items                             -- what a stay owes
  id, venue_id, stay_id,
  kind,                                 -- room_night | order | adjustment
  order_id,                             -- set when it came from the lounge
  description, amount, business_date

orders
  + stay_id  (nullable)                 -- set when charged to a room
```

**`orders.stay_id` is the whole integration.** One nullable column, and a lounge
order becomes a line on a room bill.

## Rules worth deciding now, because they are expensive later

**Charging to a room needs proof, not a name.** Anyone can say "room 204". The
cashier should pick from rooms that are *currently occupied*, and the stay should
carry the guest's name so the screen can show it back. Get this wrong and the
hotel subsidises strangers' drinks.

**A stay is stamped with a business date like everything else.** Room nights are
a nightly figure and must roll at the same 6am as the lounge, or the two halves
of the same evening land on different days and no report reconciles.

**Room nights are posted per night, not at checkout.** Otherwise a guest staying
five nights appears as a single enormous Friday, and every occupancy and revenue
figure is wrong until they leave.

**Checkout must refuse to complete with an unsettled folio** — or produce a
deliberate, audited exception. This is the hotel equivalent of the exit pass,
and it is the same problem: money walking out of a door.

**Housekeeping status is not occupancy.** A room can be empty and dirty. Keep
`status` about the room and `stays` about the guest, or "is 204 free?" gets two
answers.

## How it ships without disrupting anything

1. `hotel.rooms` is already declared in `app/entitlements.py` and granted by no
   plan below enterprise. Routes can be merged and deployed today; every
   existing venue simply does not have the capability and sees nothing.
2. Gate every hotel route with `require_feature("hotel.rooms")`.
3. Gate the hotel navigation in the app on the venue's `features`, which
   `/venues/me` already returns.
4. Switch it on for one venue with `extra_features` — no plan change, no
   migration, reversible in a second.
5. Only when it has run a real week does it go into a plan.

The point of this sequence is that **the lounge never notices**. There is no
long-lived branch, no big-bang merge, and no moment where a half-finished module
is live for someone trading on it.

## What this must not become

**Do not model a room as a table.** They look similar and are not: a table's
inventory is the object, a room's inventory is *time*. Every hospitality system
that is miserable to use made this shortcut first.

**Do not build reservations to hit a launch date.** Phase 1 is genuinely useful
on its own. Phase 2 rushed is a double-booked room.

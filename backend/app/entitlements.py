"""What a venue is entitled to use.

Gating used to name plans at the call site — `require_plan("growth", "pro",
"enterprise")`. That works while there are three call sites and becomes a
liability at thirty: renaming a tier, repricing one, or adding a new module
turns a commercial decision into a search through the codebase, and the kind of
search where missing one leaves a paying venue locked out of something it bought.

So call sites name a **capability** and this file decides who has it. Repricing
is then an edit here, not a deployment of scattered changes.

It is also what lets a half-finished module live in the system without
disrupting anything. Hotel rooms can be merged, deployed and exercised against a
real database while every venue's feature list simply does not contain
`hotel.rooms` — so the routes exist, refuse politely, and the working system is
untouched. That is a far safer way to build a second domain than a long-lived
branch that drifts from main for two months.
"""
from __future__ import annotations

#: Everything a venue gets for existing. These are not sold separately, and
#: nothing here should ever be gated — a venue that cannot take an order is not
#: a customer, it is a support ticket.
CORE: frozenset[str] = frozenset({
    "orders",
    "tables",
    "menu",
    "stock",
    "payments",
    "exit_passes",
    "staff",
    "shifts",
    "promos",
    "analytics.basic",
})

#: Sold. Each is a capability a call site can ask for by name.
PREMIUM: frozenset[str] = frozenset({
    # Per-staff performance, peak hours, item-level margin.
    "analytics.advanced",
    # Reorder suggestions and nights-of-cover, once there is history to use.
    "forecasting",
    # Rooms, occupancy, and charging a lounge bill to a room. Deliberately
    # listed before it is finished: the module ships dark and is switched on
    # per venue when it is ready, rather than waiting on a branch.
    "hotel.rooms",
    # Availability, rates and reservations. A later, larger thing than rooms.
    "hotel.bookings",
})

ALL: frozenset[str] = CORE | PREMIUM

#: Plans, in the order a venue grows through them. A plan is a bundle of
#: capabilities and nothing else — no behaviour hangs off the plan's name.
PLANS: dict[str, frozenset[str]] = {
    "starter": CORE,
    "growth": CORE | {"analytics.advanced"},
    "pro": CORE | {"analytics.advanced", "forecasting"},
    "enterprise": ALL,
}

#: What an unrecognised plan gets. Falling back to core rather than to nothing
#: means a typo in a plan name costs a venue its premium features, not its till.
_FALLBACK = CORE


def features_for(plan: str | None, extra: list[str] | None = None) -> frozenset[str]:
    """Everything this venue may use.

    `extra` is the per-venue override, and it exists for a specific reason: the
    first venues are pilots running free, and they need the premium modules
    without inventing a fake tier that then has to be un-invented at the first
    real invoice.
    """
    granted = PLANS.get((plan or "").lower(), _FALLBACK)
    if extra:
        # Only capabilities that exist. An override naming something removed in
        # a later release should be ignored, not carried around forever.
        granted = granted | (frozenset(extra) & ALL)
    return granted


def has_feature(plan: str | None, feature: str, extra: list[str] | None = None) -> bool:
    return feature in features_for(plan, extra)

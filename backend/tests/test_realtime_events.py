"""Every event the server broadcasts must be classified by the frontend.

This exists because of a bug that happened twice in the same shape. The server
broadcast `order_item_update` on every item transition; four of the five live
screens never listened for it. A bartender accepting a ticket left the floor
stale, and a table finishing its last item never moved into the cashier's pay
queue — a walkout risk that would only surface on a busy night.

Nothing was broken. Something was merely *not mentioned*, in four separate
files, and an omission leaves nothing to review.

Screens now declare which data an event invalidates rather than naming events
one by one, in `frontend/src/lib/venueChannel.ts`. This test closes the loop: add
a broadcast on the server without classifying it there and the build fails, in
CI, with the event name in the message. That is the part that makes it
structural rather than merely fixed.
"""
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent / "app"
CHANNEL = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend" / "src" / "lib" / "venueChannel.ts"
)

#: Events sent to a guest's own socket, not the venue channel. The guest pages
#: handle these directly; they are out of scope for the staff taxonomy.
CUSTOMER_ONLY = {"item_status_update", "payment_confirmed", "alert_acknowledged"}


def _broadcast_events() -> set[str]:
    """Event names the backend sends to any staff-facing channel."""
    found: set[str] = set()
    for path in BACKEND.rglob("*.py"):
        src = path.read_text()
        # manager.broadcast_staff(venue_id, "event_name", {...})
        found |= set(
            re.findall(
                r"broadcast_(?:staff|bar|kitchen|security)\(\s*[^,]+,\s*\n?\s*\"([a-z_]+)\"",
                src,
            )
        )
        # routing_service picks the event name before broadcasting it
        found |= set(re.findall(r'event = "([a-z_]+)" if .* else "([a-z_]+)"', src))
    flat: set[str] = set()
    for item in found:
        flat |= set(item) if isinstance(item, tuple) else {item}
    return {e for e in flat if e}


def _classified_events() -> set[str]:
    """Event names listed in the frontend's INVALIDATES map."""
    src = CHANNEL.read_text()
    block = src[src.index("export const INVALIDATES"): src.index("} as const;")]
    return set(re.findall(r'"([a-z_]+)"', block))


def test_the_channel_file_is_where_we_think_it_is():
    """A moved or renamed file must fail loudly, not quietly pass this suite."""
    assert CHANNEL.exists(), f"venueChannel.ts not found at {CHANNEL}"
    assert "INVALIDATES" in CHANNEL.read_text()


def test_the_backend_actually_broadcasts_something():
    """Guards against a regex that silently matches nothing and passes."""
    events = _broadcast_events()
    assert len(events) >= 8, f"only found {events} — has the broadcast style changed?"
    assert "order_item_update" in events


@pytest.mark.parametrize("event", sorted(_broadcast_events()))
def test_every_broadcast_event_is_classified(event):
    """The guard. A new server event with no classification fails here, named."""
    assert event in _classified_events(), (
        f'The server broadcasts "{event}" but frontend/src/lib/venueChannel.ts '
        f"does not classify it, so every live screen will ignore it. Add it to "
        f"the INVALIDATES group whose data it changes."
    )


def test_no_classified_event_is_dead():
    """The other direction: an event listed but never sent is stale config that
    misleads the next reader."""
    stale = _classified_events() - _broadcast_events() - CUSTOMER_ONLY
    assert not stale, f"classified but never broadcast: {sorted(stale)}"


def test_order_events_include_the_one_that_was_missed():
    """A named regression: order_item_update must invalidate orders."""
    src = CHANNEL.read_text()
    orders_block = src[src.index("orders: ["): src.index("]", src.index("orders: ["))]
    assert "order_item_update" in orders_block
    assert "payment_recorded" in orders_block

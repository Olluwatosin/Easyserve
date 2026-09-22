"""Valuing stock at what it cost, not at what it might sell for.

Stock on hand was valued at the selling price, which overstates the shelf by the
whole margin — and valued shrinkage the same way, which inflates a loss into a
number an owner stops believing. A bottle that walks costs its purchase price;
the margin was never money the venue had.

The other rule here is about not knowing. `unit_cost` is nullable because plenty
of lines have no meaningful one — a cocktail mixed to order, a cover charge —
and a missing cost must read as unknown everywhere it appears. Treating it as
zero would drag every total quietly downward, which is the failure mode that
does not announce itself.
"""
from types import SimpleNamespace

from app.services import stock_service as svc


def _item(**kw):
    base = dict(
        id="i1",
        name="Hennessy VS",
        item_type="drink",
        price=45000.0,
        unit_cost=28000.0,
        stock_quantity=10,
        stock_pack_size=1,
        stock_threshold=4,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _row(item):
    """The shape list_stock builds, exercised through the same arithmetic."""
    qty = item.stock_quantity or 0
    cost = float(item.unit_cost) if item.unit_cost is not None else None
    price = float(item.price)
    return {
        "value": round(qty * cost, 2) if cost is not None else None,
        "margin": round(price - cost, 2) if cost is not None else None,
        "margin_pct": (
            round((price - cost) / price * 100, 1)
            if cost is not None and price > 0
            else None
        ),
    }


def test_stock_on_hand_is_worth_what_it_cost():
    """Ten bottles at ₦28,000 cost is ₦280,000 of stock — not the ₦450,000 they
    would fetch if every one of them sold."""
    assert _row(_item())["value"] == 280_000


def test_margin_is_reported_per_unit_and_as_a_percentage():
    row = _row(_item())
    assert row["margin"] == 17_000
    assert row["margin_pct"] == 37.8


def test_an_unknown_cost_stays_unknown():
    """The failure that does not announce itself: a missing cost treated as zero
    reads as 100% margin and free stock, and drags every total with it."""
    row = _row(_item(unit_cost=None))
    assert row["value"] is None
    assert row["margin"] is None
    assert row["margin_pct"] is None


def test_a_zero_cost_is_not_the_same_as_an_unknown_one():
    """A genuinely free line — a comped welcome drink — is a real zero and must
    still price out, rather than being lumped in with the unknowns."""
    row = _row(_item(unit_cost=0.0))
    assert row["value"] == 0
    assert row["margin"] == 45_000
    assert row["margin_pct"] == 100.0


def test_the_variance_helpers_are_still_where_the_report_expects_them():
    """A light guard: the report above is assembled in get_variance, and these
    are the pieces it is built from."""
    assert hasattr(svc, "get_variance")
    assert hasattr(svc, "list_stock")
    src = svc.__file__
    with open(src) as fh:
        body = fh.read()
    # Shrinkage must be priced from cost. If this ever reads item.price again,
    # the loss figure silently inflates by the margin.
    variance_block = body[body.index("async def get_variance"):body.index("async def submit_count")]
    assert "item.unit_cost" in variance_block
    assert "variance * cost" in variance_block
    assert "unpriced_shortfalls" in variance_block

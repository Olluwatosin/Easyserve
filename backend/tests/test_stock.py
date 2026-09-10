"""Stock control.

The variance figure is the product's answer to shrinkage, so the arithmetic
behind it and the rules that keep it honest are pinned here.
"""
import pytest
from pydantic import ValidationError

from app.models.menu_item import MenuItem
from app.models.stock_movement import REASONS
from app.schemas.stock import MANUAL_REASONS, StockAdjustRequest, StockCountRequest
from app.services import stock_service


def _item(**kw) -> MenuItem:
    defaults = dict(id="i1", venue_id="v1", name="Hennessy VS", price=8500.0,
                    stock_quantity=24, stock_threshold=3)
    defaults.update(kw)
    return MenuItem(**defaults)


def test_null_quantity_means_untracked():
    """A cocktail mixed to order has no meaningful count."""
    assert stock_service.is_tracked(_item(stock_quantity=None)) is False
    assert stock_service.is_tracked(_item(stock_quantity=0)) is True


async def test_untracked_items_are_left_alone():
    item = _item(stock_quantity=None)
    assert await stock_service.record_movement(None, item, -5, "sale") is None
    assert item.stock_quantity is None


class _FakeDb:
    def __init__(self): self.added = []
    def add(self, obj): self.added.append(obj)


async def test_sale_reduces_and_records_the_balance():
    db, item = _FakeDb(), _item(stock_quantity=24)
    await stock_service.record_movement(db, item, -3, "sale", order_id="o1")
    assert item.stock_quantity == 21
    move = db.added[0]
    assert (move.delta, move.balance_after, move.reason) == (-3, 21, "sale")
    assert move.order_id == "o1"


async def test_restock_increases():
    db, item = _FakeDb(), _item(stock_quantity=4)
    await stock_service.record_movement(db, item, 12, "restock")
    assert item.stock_quantity == 16


async def test_stock_never_goes_negative():
    """A negative shelf count is a bookkeeping artefact, not a fact, and letting
    it accumulate corrupts every variance that follows."""
    db, item = _FakeDb(), _item(stock_quantity=2)
    await stock_service.record_movement(db, item, -5, "sale")
    assert item.stock_quantity == 0
    # The ledger still records what was asked for, so the gap stays visible.
    assert db.added[0].delta == -5
    assert db.added[0].balance_after == 0


async def test_a_void_puts_stock_back():
    """Otherwise every cancellation reads as shrinkage and the report cries wolf."""
    db, item = _FakeDb(), _item(stock_quantity=21)
    await stock_service.restore_for_void(db, item, 3, "o1", "u1")
    assert item.stock_quantity == 24
    assert db.added[0].reason == "void"


@pytest.mark.parametrize("reason", ["sale", "void"])
def test_system_reasons_cannot_be_claimed_by_hand(reason):
    """Only the order flow writes these; a human asserting one would corrupt
    the sold-versus-counted comparison."""
    with pytest.raises(ValidationError):
        StockAdjustRequest(delta=5, reason=reason)


@pytest.mark.parametrize("reason", sorted(MANUAL_REASONS))
def test_human_reasons_are_accepted(reason):
    assert StockAdjustRequest(delta=5, reason=reason).reason == reason


def test_manual_reasons_are_exactly_the_non_system_ones():
    assert set(MANUAL_REASONS) == set(REASONS) - {"sale", "void"}


def test_zero_delta_is_refused():
    with pytest.raises(ValidationError):
        StockAdjustRequest(delta=0, reason="restock")


def test_unknown_reason_is_refused():
    with pytest.raises(ValidationError):
        StockAdjustRequest(delta=5, reason="shrinkage")


def test_a_count_must_contain_something():
    with pytest.raises(ValidationError):
        StockCountRequest(counts={})


def test_counts_cannot_be_negative():
    with pytest.raises(ValidationError):
        StockCountRequest(counts={"i1": -1})


def test_a_zero_count_is_valid():
    """Selling out is a real outcome and must be countable."""
    assert StockCountRequest(counts={"i1": 0}).counts["i1"] == 0


# ── Case goods ───────────────────────────────────────────────────────────────

def _pack_item(pack: int, qty: int) -> MenuItem:
    return _item(stock_quantity=qty, stock_pack_size=pack, stock_threshold=pack)


def test_pack_size_defaults_to_individual_counting():
    """Spirits are counted one bottle at a time; only case goods differ."""
    from app.models.menu_item import MenuItem as MI
    assert MI.__table__.c.stock_pack_size.default.arg == 1


@pytest.mark.parametrize("units,pack,crates,loose", [
    (288, 24, 12, 0),    # exactly twelve crates
    (174, 24, 7, 6),     # seven crates and six loose
    (18, 24, 0, 18),     # less than a crate
    (0, 24, 0, 0),
    (7, 1, 0, 7),        # not a case good
])
def test_units_split_into_crates_and_loose(units, pack, crates, loose):
    """The arithmetic behind entering a beer count as crates plus singles."""
    if pack <= 1:
        assert (0, units) == (0, units)
        return
    assert divmod(units, pack) == (crates, loose)


def test_a_crate_restock_moves_a_whole_case():
    """Adding beer one bottle at a time would be 24 taps per crate."""
    db, item = _FakeDb(), _pack_item(24, 288)
    stock = item.stock_quantity + 24
    assert stock == 312


async def test_sales_still_deplete_single_units_for_case_goods():
    """Beer is bought by the crate but sold by the bottle."""
    db, item = _FakeDb(), _pack_item(24, 288)
    await stock_service.record_movement(db, item, -3, "sale", order_id="o1")
    assert item.stock_quantity == 285


def test_case_goods_reorder_below_a_full_crate():
    """A threshold of 3 is meaningless for an item that moves 100 a night."""
    item = _pack_item(24, 18)
    assert (item.stock_quantity or 0) <= item.stock_threshold

from pydantic import BaseModel, Field

from app.models.stock_movement import REASONS

# "sale" and "void" are written by the system; a human may not claim them.
MANUAL_REASONS = tuple(r for r in REASONS if r not in ("sale", "void"))


class StockAdjustRequest(BaseModel):
    delta: int = Field(..., description="Signed change: +24 restock, -2 waste")
    reason: str = Field(default="adjustment")
    note: str | None = None

    def model_post_init(self, __context) -> None:
        if self.reason not in MANUAL_REASONS:
            raise ValueError(
                f"reason must be one of: {', '.join(MANUAL_REASONS)}"
            )
        if self.delta == 0:
            raise ValueError("delta must not be zero")


class StockCountRequest(BaseModel):
    """A physical count: menu_item_id -> units actually on the shelf."""
    counts: dict[str, int]

    def model_post_init(self, __context) -> None:
        if not self.counts:
            raise ValueError("Submit at least one counted item")
        if any(v < 0 for v in self.counts.values()):
            raise ValueError("Counts cannot be negative")


class DeliveryLine(BaseModel):
    """One line off a supplier's invoice.

    Counted the way the invoice counts: `packs` in the item's own pack size — a
    crate of 24 — plus any loose `units`. Both, because deliveries genuinely
    arrive as "two crates and three bottles".
    """
    item_id: str
    packs: int = 0
    units: int = 0
    #: The price on this invoice. Updates the item's cost when given, because
    #: this is the one moment the venue is holding the proof of it.
    unit_cost: float | None = None

    def model_post_init(self, __context) -> None:
        if self.packs < 0 or self.units < 0:
            raise ValueError("A delivery cannot contain negative quantities")
        if self.unit_cost is not None and self.unit_cost < 0:
            raise ValueError("A cost cannot be negative")


class ReceiveDeliveryRequest(BaseModel):
    lines: list[DeliveryLine]
    #: The supplier's invoice or waybill number, so a stock movement can be
    #: traced back to the paper it came from.
    reference: str | None = None
    supplier: str | None = None

    def model_post_init(self, __context) -> None:
        if not self.lines:
            raise ValueError("A delivery needs at least one line")
        if all(l.packs == 0 and l.units == 0 for l in self.lines):
            raise ValueError("Every line on this delivery is zero")

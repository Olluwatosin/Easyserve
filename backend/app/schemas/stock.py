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

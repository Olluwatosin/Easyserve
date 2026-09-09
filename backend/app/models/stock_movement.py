import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

#: Why stock moved. "sale" is written automatically; the rest are human acts.
REASONS = ("sale", "void", "restock", "waste", "count", "adjustment")


class StockMovement(Base):
    """Every change to an item's stock level, and why.

    A bare quantity column answers "how many are left" but not "where did they
    go", which is the question a venue owner actually has. Sales are recorded
    automatically, counts and waste by hand, and the gap between them is the
    variance — the number that reveals shrinkage.
    """

    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    menu_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Signed: negative for sales and waste, positive for restocks.
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Level after this movement, so history reads without replaying the ledger.
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    menu_item = relationship("MenuItem")
    actor = relationship("User", foreign_keys=[actor_id])

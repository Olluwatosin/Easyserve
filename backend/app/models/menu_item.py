import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    item_type: Mapped[str] = mapped_column(String(20), default="other", nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Units on hand. NULL means this item is not stock-tracked — a cocktail
    # made to order has no meaningful count, a bottle of Hennessy does.
    stock_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # How many units come in a pack, for items bought and counted by the case.
    # A lounge counts beer in crates of 24 and spirits one bottle at a time;
    # 1 means the item is simply counted individually.
    stock_pack_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Warn the owner at or below this level, in units.
    stock_threshold: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    order_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    venue = relationship("Venue", back_populates="menu_items")
    category = relationship("MenuCategory", back_populates="items")

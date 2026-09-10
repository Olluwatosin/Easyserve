import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    table_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    # The guest channel to answer on. Taken from the guest directly rather
    # than inferred from an open order, because the first thing someone does
    # on sitting down may be to call staff — before ordering anything.
    session_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # The attendant this table belongs to. An alert aimed at one person gets
    # answered; an alert aimed at everyone is an alert aimed at nobody.
    assigned_to: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # 0 = with the assigned attendant, 1 = opened to the whole floor,
    # 2 = raised to the owner. Stored so the sweeper never re-raises the same
    # alert, and so an unanswered table is visible after the fact.
    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    acknowledged_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    venue = relationship("Venue", back_populates="alerts")
    table = relationship("Table", back_populates="alerts")
    order = relationship("Order", back_populates="alerts")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])
    assignee = relationship("User", foreign_keys=[assigned_to])

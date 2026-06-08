import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    table_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[str] = mapped_column(
        Enum("order_more", "need_help", "urgent", "request_payment", "call_attendant", name="alert_type_enum"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "acknowledged", "resolved", name="alert_status_enum"),
        default="pending",
        nullable=False,
    )
    acknowledged_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    venue = relationship("Venue", back_populates="alerts")
    table = relationship("Table", back_populates="alerts")
    order = relationship("Order", back_populates="alerts")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    table_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    session_token: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        Enum("open", "partially_served", "fully_served", "paid", "cancelled", name="order_status"),
        default="open",
        nullable=False,
    )
    order_source: Mapped[str] = mapped_column(
        Enum("qr_scan", "whatsapp", "walk_in", name="order_source_enum"),
        default="qr_scan",
        nullable=False,
    )
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def table_label(self) -> str | None:
        return self.table.label if self.table is not None else None

    venue = relationship("Venue", back_populates="orders")
    table = relationship("Table", back_populates="orders")
    assigned_attendant = relationship("User", foreign_keys=[assigned_to])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)
    exit_pass = relationship("ExitPass", back_populates="order", uselist=False)
    alerts = relationship("Alert", back_populates="order")
    feedback = relationship("Feedback", back_populates="order", uselist=False)

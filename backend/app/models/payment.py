import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_split: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    split_data: Mapped[dict | None] = mapped_column(JSONB)
    # "confirmed" for cashier-recorded payments; gateway payments start
    # "pending" and are confirmed by the provider webhook.
    status: Mapped[str] = mapped_column(String(20), default="confirmed", nullable=False)
    # How much this payment can be trusted:
    #   "gateway" — a provider webhook confirmed the money moved. Trustworthy.
    #   "cash"    — the cashier physically confirmed notes in hand.
    #   "manual"  — the cashier asserted a transfer landed, with a reference.
    #               Nothing verified it; this is the line the owner must review.
    verification: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    # Bank narration / session ID the guest showed for a manual transfer. The
    # thing the owner reconciles against their statement.
    transfer_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    provider_ref: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order = relationship("Order", back_populates="payment")
    cashier = relationship("User", foreign_keys=[recorded_by])

    @property
    def is_verified(self) -> bool:
        """False only for a transfer a human asserted with nothing checking it."""
        return self.verification in ("gateway", "cash")

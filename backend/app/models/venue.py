import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    plan: Mapped[str] = mapped_column(
        String(20),
        default="starter",
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Whether floor staff may take payment, or only the cashier.
    #
    # Off by default, and deliberately a venue decision rather than ours: a
    # venue that employs a cashier has centralised money handling on purpose,
    # and that is an internal control. Turning it on suits venues where the
    # attendant is who stands at the table when the guest reaches for cash.
    attendants_take_payment: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    exit_pass_minutes: Mapped[int] = mapped_column(default=10, nullable=False)
    # Bill percentages (10.00 = 10%). Snapshotted onto each order at creation.
    service_charge_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    vat_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    users = relationship("User", back_populates="venue", cascade="all, delete-orphan")
    tables = relationship("Table", back_populates="venue", cascade="all, delete-orphan")
    menu_categories = relationship("MenuCategory", back_populates="venue", cascade="all, delete-orphan")
    menu_items = relationship("MenuItem", back_populates="venue", cascade="all, delete-orphan")
    promos = relationship("Promo", back_populates="venue", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="venue", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="venue", cascade="all, delete-orphan")

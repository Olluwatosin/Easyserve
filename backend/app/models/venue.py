import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text, func
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
    exit_pass_minutes: Mapped[int] = mapped_column(default=10, nullable=False)
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

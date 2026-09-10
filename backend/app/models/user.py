import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # E.164, e.g. +2348012345678. Used for WhatsApp password recovery.
    # Set while signed in, so it carries the same trust as changing the email.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    # Tokens issued (iat) before this instant are rejected — used to log out all
    # sessions on password change. Null means no cut-off.
    tokens_valid_after: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    zone: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def has_pin(self) -> bool:
        """Whether this account can sign in at a station keypad.

        A PIN is stored hashed and can never be read back, so the only thing an
        owner can be shown is whether one exists. Staff created before this was
        enforced — and owners, who sign in with an email — have none, and
        without this flag a keypad login just fails with nothing on screen
        explaining why.
        """
        return self.pin_hash is not None

    venue = relationship("Venue", back_populates="users")
    assigned_tables = relationship(
        "Table", back_populates="assigned_attendant", foreign_keys="Table.assigned_attendant_id"
    )

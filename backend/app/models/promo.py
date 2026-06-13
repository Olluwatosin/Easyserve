import uuid
from datetime import time

from sqlalchemy import ARRAY, Boolean, ForeignKey, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Promo(Base):
    __tablename__ = "promos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    days_active: Mapped[list] = mapped_column(ARRAY(String), default=list, nullable=True)
    applies_to: Mapped[list] = mapped_column(ARRAY(String), default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    venue = relationship("Venue", back_populates="promos")

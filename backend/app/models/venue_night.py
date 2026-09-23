"""What made a night what it was.

A forecast built only on sales learns that some Fridays are enormous and some
Tuesdays are dead, and has no idea why — so it treats a live act, a public
holiday and a power cut as the same unexplained noise. One line per night is
what turns those from outliers into features.

Written by whoever closes, which is the only moment anybody remembers.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

#: Tags the reports can group on. Free text explains; a tag counts.
NIGHT_TAGS = (
    "live_music",
    "dj",
    "holiday",
    "match_day",
    "private_event",
    "power_cut",
    "rain",
    "quiet",
    "other",
)


class VenueNight(Base):
    __tablename__ = "venue_nights"
    __table_args__ = (
        # One per night. A second is an edit, not another record.
        UniqueConstraint("venue_id", "business_date", name="uq_venue_nights_venue_date"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False
    )
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag: Mapped[str | None] = mapped_column(String(40), nullable=True)
    recorded_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

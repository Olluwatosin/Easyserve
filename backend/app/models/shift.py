"""A shift: when somebody started, when they stopped, and who says so.

This feeds payroll, which changes what the record has to survive. A rough
attendance log only has to be roughly right. A record someone is paid from has
to withstand being disputed weeks later by a person who remembers the night
differently — so every correction keeps what it replaced, and every row says
whether it was closed by the person who worked it or by somebody else.

Deliberately independent of the business day. A 24-hour venue's overnight shift
crosses the 6am rollover, and a shift cut in half by an accounting boundary is
half a night's pay.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

#: How a shift ended, which is the thing a payroll dispute turns on.
#:   staff      — the person clocked themselves out
#:   owner      — closed or corrected by management
#:   unclosed   — still open past the rollover; nobody has said when it ended
END_REASONS = ("staff", "owner", "unclosed")


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    venue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    #: Null while the shift is still running.
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_by_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)

    #: Set when a shift is still open past the venue's rollover. Never closed
    #: silently: guessing an end time means paying somebody for going home.
    flagged_unclosed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    #: Who last changed the times, if anyone. Present means "these are not the
    #: times that were clocked", which is exactly what a dispute needs to know.
    corrected_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    corrected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: What the clock actually said before a correction, kept verbatim. A
    #: corrected record that discards the original is one person's word.
    original_times: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", foreign_keys=[user_id])

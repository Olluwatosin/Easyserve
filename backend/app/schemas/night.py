from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.models.venue_night import NIGHT_TAGS


class NightUpsert(BaseModel):
    """One line about what made a night what it was.

    Both fields are optional because they answer different questions: the tag is
    what a report can group on, the note is what a person reads six weeks later
    when the tag alone does not explain the figure.
    """
    note: str | None = None
    tag: str | None = None

    @field_validator("tag")
    @classmethod
    def _known_tag(cls, v: str | None) -> str | None:
        if v in (None, ""):
            return None
        if v not in NIGHT_TAGS:
            raise ValueError(f"Unknown tag. Choose one of: {', '.join(NIGHT_TAGS)}")
        return v

    @field_validator("note")
    @classmethod
    def _trimmed(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class NightResponse(BaseModel):
    business_date: date
    note: str | None
    tag: str | None
    recorded_by: str | None
    recorded_by_name: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

from datetime import datetime
from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    venue_id: str
    order_id: str | None
    table_id: str | None
    rating: int
    comment: str | None
    attended_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

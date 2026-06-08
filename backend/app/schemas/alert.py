from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class AlertCreate(BaseModel):
    type: Literal["order_more", "need_help", "urgent", "request_payment", "call_attendant"]


class AlertResponse(BaseModel):
    id: str
    venue_id: str
    table_id: str | None
    order_id: str | None
    type: str
    status: str
    acknowledged_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

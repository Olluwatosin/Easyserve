from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class AlertCreate(BaseModel):
    type: Literal["order_more", "need_help", "urgent", "request_payment", "call_attendant"]
    # Lets us tell this guest who is coming, even before they have ordered.
    session_token: str | None = None


class AlertResponse(BaseModel):
    id: str
    venue_id: str
    table_id: str | None
    order_id: str | None
    type: str
    status: str
    assigned_to: str | None = None
    escalation_level: int = 0
    acknowledged_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

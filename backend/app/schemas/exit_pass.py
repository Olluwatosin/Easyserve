from datetime import datetime
from pydantic import BaseModel


class ExitPassResponse(BaseModel):
    id: str
    order_id: str
    token: str
    expires_at: datetime
    used_at: datetime | None
    status: str
    delivery_method: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanResult(BaseModel):
    status: str
    order_id: str
    table_number: str | None = None
    message: str

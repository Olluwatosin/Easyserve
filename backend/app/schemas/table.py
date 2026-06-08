from datetime import datetime
from pydantic import BaseModel


class TableCreate(BaseModel):
    label: str
    capacity: int | None = None
    zone: str | None = None


class TableUpdate(BaseModel):
    label: str | None = None
    capacity: int | None = None
    zone: str | None = None
    is_active: bool | None = None


class TableAssign(BaseModel):
    attendant_id: str | None = None


class TableResponse(BaseModel):
    id: str
    venue_id: str
    label: str
    capacity: int | None
    zone: str | None
    qr_token: str
    assigned_attendant_id: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

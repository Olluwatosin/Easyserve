from datetime import datetime
from typing import List
from pydantic import BaseModel, model_validator


class TableCreate(BaseModel):
    label: str
    capacity: int | None = None
    zone: str | None = None
    min_spend: float = 0


class TableUpdate(BaseModel):
    label: str | None = None
    capacity: int | None = None
    zone: str | None = None
    is_active: bool | None = None
    min_spend: float | None = None


class TableAssign(BaseModel):
    attendant_id: str | None = None


class TableAssignMulti(BaseModel):
    attendant_ids: List[str]


class TableResponse(BaseModel):
    id: str
    venue_id: str
    label: str
    capacity: int | None
    zone: str | None
    qr_token: str
    assigned_attendant_id: str | None
    extra_attendant_ids: str
    attendant_ids: List[str] = []
    min_spend: float
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def build_attendant_ids(self) -> "TableResponse":
        primary = self.assigned_attendant_id
        extra = [x for x in (self.extra_attendant_ids or "").split(",") if x.strip()]
        result = [primary] if primary else []
        result.extend(x for x in extra if x != primary)
        self.attendant_ids = result
        return self

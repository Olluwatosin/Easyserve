from datetime import datetime
from pydantic import BaseModel


class VenueResponse(BaseModel):
    id: str
    name: str
    slug: str
    address: str | None
    city: str | None
    phone: str | None
    plan: str
    is_active: bool
    exit_pass_minutes: int
    service_charge_pct: float
    vat_pct: float
    created_at: datetime

    model_config = {"from_attributes": True}


class VenueUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    exit_pass_minutes: int | None = None
    service_charge_pct: float | None = None
    vat_pct: float | None = None

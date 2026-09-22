from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class OrderItemInput(BaseModel):
    menu_item_id: str
    quantity: int = 1
    notes: str | None = None


class PlaceOrderRequest(BaseModel):
    # Set by the client so a queued order replayed after a network drop is
    # recognised rather than duplicated.
    client_request_id: str | None = None
    items: list[OrderItemInput]
    session_token: str | None = None
    order_source: Literal["qr_scan", "whatsapp", "walk_in"] = "qr_scan"
    # Optional — enables repeat-guest recognition and WhatsApp receipts
    customer_phone: str | None = None


class StaffOrderRequest(BaseModel):
    """An order taken at the table by a member of staff.

    Plenty of guests will not scan — an older regular, a phone on 3%, a bottle
    table who expect to be waited on, or someone who simply does not want to.
    Before this, that guest could not be served through the system at all, which
    meant their round was on paper and outside every total the venue relies on.

    Addressed by table_id rather than the table's QR token: the attendant is
    standing at the table, not reading the sticker on it.
    """
    table_id: str
    items: list[OrderItemInput]
    #: Set by the client so a double-tap, or a retry after a dropped network,
    #: does not put the round on the bill twice.
    client_request_id: str | None = None
    customer_phone: str | None = None


class OrderItemResponse(BaseModel):
    id: str
    menu_item_id: str | None
    name: str
    price: float
    quantity: int
    item_type: str
    routed_to: str
    status: str
    notes: str | None
    accepted_at: datetime | None = None
    ready_at: datetime | None = None
    # How long this station said it would take, so the guest's countdown
    # needs no second request and no knowledge of venue settings.
    prep_minutes: int | None = None

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: str
    venue_id: str
    table_id: str | None
    table_label: str | None
    assigned_to: str | None
    session_token: str
    status: str
    order_source: str
    total_amount: float
    service_charge: float
    vat_amount: float
    grand_total: float
    customer_phone: str | None
    items: list[OrderItemResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ItemStatusUpdate(BaseModel):
    status: Literal["pending", "preparing", "ready", "delivered", "cancelled"]


class OrderAssign(BaseModel):
    attendant_id: str

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

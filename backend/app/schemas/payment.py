from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class PaymentCreate(BaseModel):
    order_id: str
    amount: float
    method: Literal["cash", "transfer", "pos", "card", "mobile_wallet"]
    is_split: bool = False
    split_data: dict | None = None


class CashPaymentCreate(BaseModel):
    order_id: str
    amount: float
    cash_confirmed: bool  # cashier must physically tick this

    def model_post_init(self, __context):
        if not self.cash_confirmed:
            raise ValueError("Cash must be physically confirmed before recording")


class PaymentResponse(BaseModel):
    id: str
    order_id: str
    venue_id: str
    amount: float
    method: str
    recorded_by: str | None
    is_split: bool
    split_data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}

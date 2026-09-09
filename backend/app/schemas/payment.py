from datetime import datetime
from typing import Literal
from pydantic import BaseModel, model_validator


# Methods where the cashier is asserting money arrived somewhere they cannot
# see. These require a reference the owner can reconcile against a statement.
UNVERIFIABLE_METHODS = {"transfer", "mobile_wallet"}


class PaymentCreate(BaseModel):
    order_id: str
    amount: float
    method: Literal["cash", "transfer", "pos", "card", "mobile_wallet"]
    is_split: bool = False
    split_data: dict | None = None
    # Bank narration or session ID shown by the guest. Required for transfers.
    transfer_reference: str | None = None

    @model_validator(mode="after")
    def _reference_required_for_transfers(self) -> "PaymentCreate":
        if self.method in UNVERIFIABLE_METHODS:
            ref = (self.transfer_reference or "").strip()
            if len(ref) < 4:
                raise ValueError(
                    "Enter the transfer reference from the guest's payment alert"
                )
            self.transfer_reference = ref
        return self


class CashPaymentCreate(BaseModel):
    order_id: str
    amount: float
    cash_confirmed: bool  # cashier must physically tick this

    def model_post_init(self, __context):
        if not self.cash_confirmed:
            raise ValueError("Cash must be physically confirmed before recording")


class InitiateGatewayPayment(BaseModel):
    order_id: str
    email: str | None = None


class PaymentResponse(BaseModel):
    id: str
    order_id: str
    venue_id: str
    amount: float
    method: str
    recorded_by: str | None
    is_split: bool
    split_data: dict | None
    status: str
    provider: str | None
    verification: str
    transfer_reference: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

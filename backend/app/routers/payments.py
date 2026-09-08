import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import CashPaymentCreate, PaymentCreate, PaymentResponse
from app.services import paystack_service
from app.services.payment_service import confirm_gateway_payment, record_cash_payment, record_payment

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook/paystack", include_in_schema=False)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # Authenticated by the HMAC signature over the raw body — no bearer token.
    raw = await request.body()
    signature = request.headers.get("x-paystack-signature")
    if not paystack_service.verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = json.loads(raw)
    if event.get("event") == "charge.success":
        data = event.get("data", {})
        reference = data.get("reference")
        amount_kobo = int(data.get("amount", 0))
        if reference:
            await confirm_gateway_payment(db, reference, amount_kobo)
    # Always 200 — Paystack retries anything else and we handle our own errors.
    return {"status": "ok"}


@router.post("", status_code=201)
async def create_payment(
    req: PaymentCreate,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    payment, exit_pass = await record_payment(db, req, current_user.id, current_user.venue_id)
    return {
        "payment": PaymentResponse.model_validate(payment),
        "exit_pass": {"token": exit_pass.token, "expires_at": exit_pass.expires_at.isoformat(), "status": exit_pass.status},
    }


@router.post("/cash", status_code=201)
async def create_cash_payment(
    req: CashPaymentCreate,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    payment, exit_pass = await record_cash_payment(db, req, current_user.id, current_user.venue_id)
    return {
        "payment": PaymentResponse.model_validate(payment),
        "exit_pass": {"token": exit_pass.token, "expires_at": exit_pass.expires_at.isoformat(), "status": exit_pass.status},
    }


@router.get("/{order_id}", response_model=PaymentResponse)
async def get_payment(
    order_id: str,
    current_user: User = Depends(require_roles("owner", "cashier", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    # An order can have several payment rows (e.g. an abandoned online checkout
    # left pending, then cash at the cashier) — prefer the confirmed one.
    result = await db.execute(
        select(Payment)
        .where(Payment.order_id == order_id, Payment.venue_id == current_user.venue_id)
        .order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()
    p = next((x for x in payments if x.status == "confirmed"), payments[0] if payments else None)
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    return p

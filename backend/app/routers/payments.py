import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.payment import Payment
from app.models.user import User
from app.models.venue import Venue
from app.schemas.payment import CashPaymentCreate, PaymentCreate, PaymentResponse
from app.services import paystack_service
from app.services.payment_service import confirm_gateway_payment, record_cash_payment, record_payment

router = APIRouter(prefix="/payments", tags=["payments"])

#: What an attendant may take at the table when the venue allows it.
#: Cash gets counted at close and POS leaves a terminal receipt, so both have an
#: independent record. A transfer has neither — nothing but the staff member's
#: word confirms it arrived — so it stays with the cashier, or the guest pays
#: from their own phone and the webhook confirms it.
ATTENDANT_METHODS = {"cash", "pos"}


async def _authorise_payment(
    db: AsyncSession, user: User, method: str
) -> None:
    """Who may record this payment.

    Owners and cashiers always may. Attendants may only when the venue has
    turned it on, and only for methods with their own paper trail — a venue that
    employs a cashier centralised money handling deliberately, and that choice
    is theirs to keep.
    """
    if user.role in ("owner", "cashier"):
        return

    if user.role != "attendant":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    venue = (
        await db.execute(select(Venue).where(Venue.id == user.venue_id))
    ).scalar_one_or_none()
    if venue is None or not venue.attendants_take_payment:
        raise HTTPException(
            status_code=403,
            detail="Only the cashier can take payment at this venue",
        )
    if method not in ATTENDANT_METHODS:
        raise HTTPException(
            status_code=403,
            detail=(
                "Attendants can take cash or POS. For a transfer, ask the guest "
                "to pay from their phone or send them to the cashier."
            ),
        )


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
    current_user: User = Depends(require_roles("owner", "cashier", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    await _authorise_payment(db, current_user, req.method)
    payment, exit_pass = await record_payment(db, req, current_user.id, current_user.venue_id)
    return {
        "payment": PaymentResponse.model_validate(payment),
        "exit_pass": {"token": exit_pass.token, "expires_at": exit_pass.expires_at.isoformat(), "status": exit_pass.status},
    }


@router.post("/cash", status_code=201)
async def create_cash_payment(
    req: CashPaymentCreate,
    current_user: User = Depends(require_roles("owner", "cashier", "attendant")),
    db: AsyncSession = Depends(get_db),
):
    await _authorise_payment(db, current_user, "cash")
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

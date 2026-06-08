from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_roles
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import CashPaymentCreate, PaymentCreate, PaymentResponse
from app.services.payment_service import record_cash_payment, record_payment

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("", status_code=201)
async def create_payment(
    req: PaymentCreate,
    current_user: User = Depends(require_roles("owner", "cashier")),
    db: AsyncSession = Depends(get_db),
):
    payment, exit_pass = await record_payment(db, req, current_user.id)
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
    payment, exit_pass = await record_cash_payment(db, req, current_user.id)
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
    result = await db.execute(
        select(Payment).where(Payment.order_id == order_id, Payment.venue_id == current_user.venue_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Payment not found")
    return p

import uuid
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.order import Order
from app.models.payment import Payment
from app.models.exit_pass import ExitPass
from app.models.venue import Venue
from app.schemas.payment import PaymentCreate, CashPaymentCreate
from app.services.ws_manager import manager
from app.utils.security import generate_exit_pass_token


async def record_payment(db: AsyncSession, req: PaymentCreate, cashier_id: str) -> tuple[Payment, ExitPass]:
    result = await db.execute(
        select(Order).where(Order.id == req.order_id).options(selectinload(Order.table))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    payment = Payment(
        id=str(uuid.uuid4()),
        order_id=order.id,
        venue_id=order.venue_id,
        amount=req.amount,
        method=req.method,
        recorded_by=cashier_id,
        is_split=req.is_split,
        split_data=req.split_data,
    )
    db.add(payment)

    order.status = "paid"

    # Generate exit pass
    exit_pass = await _create_exit_pass(db, order)

    await db.commit()
    await db.refresh(payment)
    await db.refresh(exit_pass)

    # Notify customer via session token
    if order.session_token:
        await manager.send_to_customer(
            order.session_token,
            "payment_confirmed",
            {
                "order_id": order.id,
                "exit_pass_token": exit_pass.token,
                "expires_at": exit_pass.expires_at.isoformat(),
            },
        )

    # Notify staff/owner
    await manager.broadcast_staff(
        order.venue_id,
        "payment_recorded",
        {"order_id": order.id, "table_label": order.table.label if order.table else None},
    )

    return payment, exit_pass


async def record_cash_payment(db: AsyncSession, req: CashPaymentCreate, cashier_id: str) -> tuple[Payment, ExitPass]:
    digital_req = PaymentCreate(
        order_id=req.order_id,
        amount=req.amount,
        method="cash",
    )
    return await record_payment(db, digital_req, cashier_id)


async def _create_exit_pass(db: AsyncSession, order: Order) -> ExitPass:
    # Get venue exit_pass_minutes
    result = await db.execute(select(Venue).where(Venue.id == order.venue_id))
    venue = result.scalar_one_or_none()
    minutes = venue.exit_pass_minutes if venue else 10

    token = generate_exit_pass_token(order.id, order.venue_id)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)

    exit_pass = ExitPass(
        id=str(uuid.uuid4()),
        order_id=order.id,
        venue_id=order.venue_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(exit_pass)
    await db.flush()
    return exit_pass

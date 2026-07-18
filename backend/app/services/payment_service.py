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
from app.services.audit_service import log_action
from app.services.ws_manager import manager
from app.utils.security import generate_exit_pass_token


async def record_payment(db: AsyncSession, req: PaymentCreate, cashier_id: str, venue_id: str) -> tuple[Payment, ExitPass]:
    result = await db.execute(
        select(Order)
        .where(Order.id == req.order_id, Order.venue_id == venue_id)
        .options(selectinload(Order.table))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    # Amount must cover the grand total incl. service charge and VAT
    # (split payments carry their own breakdown).
    amount_due = order.grand_total
    if not req.is_split and float(req.amount) < amount_due:
        raise HTTPException(
            status_code=400,
            detail=f"Amount {req.amount} is less than the amount due {amount_due}",
        )

    payment = Payment(
        id=str(uuid.uuid4()),
        order_id=order.id,
        venue_id=order.venue_id,
        amount=req.amount,
        method=req.method,
        recorded_by=cashier_id,
        is_split=req.is_split,
        split_data=req.split_data,
        status="confirmed",
    )
    db.add(payment)

    order.status = "paid"

    log_action(
        db,
        venue_id=order.venue_id,
        actor_id=cashier_id,
        action="payment_recorded",
        entity_type="payment",
        entity_id=payment.id,
        details={"order_id": order.id, "amount": float(req.amount), "method": req.method},
    )

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


async def initiate_gateway_payment(
    db: AsyncSession, session_token: str, order_id: str, email: str | None = None
) -> dict:
    """Customer-initiated Paystack checkout for their own order.

    Scoped by session_token (the customer's proof of ownership) — no staff
    auth involved. Creates a pending Payment that the webhook confirms.
    """
    from app.services import paystack_service

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.session_token == session_token)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")

    amount_due = order.grand_total
    if amount_due <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay on this order")

    reference = f"es_{uuid.uuid4().hex}"
    payment = Payment(
        id=str(uuid.uuid4()),
        order_id=order.id,
        venue_id=order.venue_id,
        amount=amount_due,
        method="transfer",
        recorded_by=None,
        status="pending",
        provider="paystack",
        provider_ref=reference,
    )
    db.add(payment)
    await db.commit()

    authorization_url = await paystack_service.initialize_transaction(
        email=email or f"guest+{reference}@easyserve.ng",
        amount_kobo=int(round(amount_due * 100)),
        reference=reference,
        metadata={"order_id": order.id, "venue_id": order.venue_id},
    )
    return {"authorization_url": authorization_url, "reference": reference, "amount": amount_due}


async def confirm_gateway_payment(db: AsyncSession, reference: str, amount_kobo: int) -> None:
    """Webhook-driven confirmation. Idempotent; unknown references are ignored
    (return 200 so the provider stops retrying)."""
    result = await db.execute(
        select(Payment).where(Payment.provider_ref == reference)
    )
    payment = result.scalar_one_or_none()
    if not payment or payment.status == "confirmed":
        return

    order_res = await db.execute(
        select(Order).where(Order.id == payment.order_id).options(selectinload(Order.table))
    )
    order = order_res.scalar_one_or_none()
    if not order:
        return

    # Guard against short payment (e.g. stale checkout after items were added)
    if amount_kobo < int(round(order.grand_total * 100)):
        log_action(
            db,
            venue_id=order.venue_id,
            actor_id=None,
            action="payment_underpaid",
            entity_type="payment",
            entity_id=payment.id,
            details={"order_id": order.id, "paid_kobo": amount_kobo, "due": order.grand_total},
        )
        await db.commit()
        return

    payment.status = "confirmed"
    payment.amount = round(amount_kobo / 100, 2)
    already_paid = order.status == "paid"
    order.status = "paid"

    log_action(
        db,
        venue_id=order.venue_id,
        actor_id=None,
        action="payment_confirmed",
        entity_type="payment",
        entity_id=payment.id,
        details={"order_id": order.id, "amount": float(payment.amount), "provider": "paystack", "reference": reference},
    )

    exit_pass = None
    if not already_paid:
        exit_pass = await _create_exit_pass(db, order)
    await db.commit()

    if exit_pass:
        await db.refresh(exit_pass)
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
        await manager.broadcast_staff(
            order.venue_id,
            "payment_recorded",
            {"order_id": order.id, "table_label": order.table.label if order.table else None, "method": "transfer"},
        )


async def record_cash_payment(db: AsyncSession, req: CashPaymentCreate, cashier_id: str, venue_id: str) -> tuple[Payment, ExitPass]:
    digital_req = PaymentCreate(
        order_id=req.order_id,
        amount=req.amount,
        method="cash",
    )
    return await record_payment(db, digital_req, cashier_id, venue_id)


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

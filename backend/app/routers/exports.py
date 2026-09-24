"""Download the venue's own records as spreadsheets.

An owner needs their data somewhere other than this system: an accountant wants
last month's sales, payroll is worked out from hours, and a bank or a landlord
occasionally wants figures nobody is going to read off a dashboard. That is
ordinary and should not require asking us for a database dump.

Two decisions shape everything here.

**Ranges are in business dates, not timestamps.** A night that opens at 10PM on
the 30th and closes at 3AM on the 1st is one night, and it belongs to the 30th.
Exporting "September" by wall-clock time would cut that last night in half and
hand the accountant a figure that matches nothing — not the till, not the shift
report, not the owner's memory of the night. Every range here is inclusive on
both ends and reads the same `business_date` the rest of the system stamps.

**Numbers are numbers.** No naira sign, no thousands separators, two decimal
places — a column that sums when somebody selects it. The symbol belongs on a
screen; in a spreadsheet it turns the column into text. Times are written in
venue-local time for the same reason: an owner reconciling a night against their
own memory should not be doing arithmetic on UTC.
"""
import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_roles
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.payment import Payment
from app.models.shift import Shift
from app.models.stock_movement import StockMovement
from app.models.table import Table
from app.models.user import User
from app.models.venue import Venue
from app.models.venue_night import VenueNight
from app.utils.venue_time import LAGOS, business_date

router = APIRouter(prefix="/exports", tags=["exports"])

#: A year and a bit. Long enough for "last year" and any annual return; short
#: enough that one click cannot ask for a decade and time the request out.
MAX_RANGE_DAYS = 370

DATASETS = ("orders", "items", "payments", "shifts", "stock", "nights")


def _resolve_range(start: date | None, end: date | None) -> tuple[date, date]:
    """Default to the current month, which is what "export my data" usually means."""
    today = business_date()
    end = end or today
    start = start or end.replace(day=1)
    if start > end:
        raise HTTPException(status_code=400, detail="The start date is after the end date")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Choose a range of {MAX_RANGE_DAYS} days or less",
        )
    return start, end


def _utc_window(start: date, end: date) -> tuple[datetime, datetime]:
    """The UTC instants bounding those business dates, for tables that store
    only a timestamp. 6AM local on the first day, to 6AM local the morning after
    the last — so the small hours land on the night that produced them."""
    opens = datetime.combine(start, time(6, 0), tzinfo=LAGOS)
    closes = datetime.combine(end + timedelta(days=1), time(6, 0), tzinfo=LAGOS)
    return opens.astimezone(timezone.utc), closes.astimezone(timezone.utc)


def _local(at: datetime | None) -> str:
    if at is None:
        return ""
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(LAGOS).strftime("%Y-%m-%d %H:%M")


def _money(value) -> str:
    """Plain to two places. A blank stays blank rather than becoming 0.00 —
    "we don't know" and "nothing" are different facts in a ledger."""
    if value is None:
        return ""
    return f"{float(value):.2f}"


def _ref(order_id: str) -> str:
    """The short form staff and guests actually quote."""
    return order_id[:8]


def _csv_response(venue_slug: str, dataset: str, start: date, end: date,
                  header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)

    # Excel assumes the system codepage unless a CSV opens with a BOM, which
    # turns names like "Sàngó" into mojibake on the machines these get opened
    # on. The BOM costs nothing everywhere else.
    body = ("﻿" + buf.getvalue()).encode("utf-8")
    name = f"{venue_slug}-{dataset}-{start:%Y-%m-%d}_to_{end:%Y-%m-%d}.csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            # Row counts are useful before opening the file, and the UI shows
            # them so an empty range is obvious without a download.
            "X-Row-Count": str(len(rows)),
        },
    )


# ── The five things worth taking out of here ─────────────────────────────────


async def _orders(db: AsyncSession, vid: str, start: date, end: date):
    # Payments are folded in per order rather than joined directly: a split bill
    # writes more than one row, and joining it plainly would list that order
    # twice and double its total in anyone's sum.
    paid = (
        select(
            Payment.order_id.label("order_id"),
            func.string_agg(Payment.method, "/").label("methods"),
            func.max(Payment.created_at).label("paid_at"),
        )
        .where(Payment.venue_id == vid, Payment.status == "confirmed")
        .group_by(Payment.order_id)
        .subquery()
    )
    rows = await db.execute(
        select(Order, Table.label, Table.zone, User.full_name, paid.c.methods, paid.c.paid_at)
        .outerjoin(Table, Table.id == Order.table_id)
        .outerjoin(User, User.id == Order.assigned_to)
        .outerjoin(paid, paid.c.order_id == Order.id)
        .where(Order.venue_id == vid, Order.business_date.between(start, end))
        .order_by(Order.business_date, Order.created_at)
        .options(selectinload(Order.items))
    )
    header = [
        "Night", "Opened", "Order", "Table", "Zone", "Source", "Status",
        "Attendant", "Covers", "Items", "Subtotal", "Service charge", "VAT",
        "Total", "Paid with", "Paid at", "Guest phone",
    ]
    out = []
    for o, label, zone, attendant, methods, paid_at in rows.all():
        live = [i for i in o.items if i.status != "cancelled"]
        out.append([
            o.business_date.isoformat(), _local(o.created_at), _ref(o.id),
            label or "", zone or "", o.order_source, o.status, attendant or "",
            o.covers if o.covers is not None else "",
            sum(i.quantity for i in live),
            _money(o.total_amount), _money(o.service_charge), _money(o.vat_amount),
            _money(o.grand_total), methods or "", _local(paid_at),
            o.customer_phone or "",
        ])
    return header, out


async def _items(db: AsyncSession, vid: str, start: date, end: date):
    """Line by line — what actually sold, which is the question a menu gets
    rewritten from."""
    rows = await db.execute(
        select(OrderItem, Order.business_date, Order.id, Order.status, Table.label)
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(Table, Table.id == Order.table_id)
        .where(Order.venue_id == vid, Order.business_date.between(start, end))
        .order_by(Order.business_date, Order.created_at, OrderItem.created_at)
    )
    header = [
        "Night", "Order", "Table", "Item", "Type", "Quantity", "Unit price",
        "Line total", "Sent to", "Item status", "Order status", "Ordered", "Notes",
    ]
    out = []
    for it, night, oid, ostatus, label in rows.all():
        out.append([
            night.isoformat(), _ref(oid), label or "", it.name, it.item_type,
            it.quantity, _money(it.price), _money(float(it.price) * it.quantity),
            it.routed_to, it.status, ostatus, _local(it.created_at), it.notes or "",
        ])
    return header, out


async def _payments(db: AsyncSession, vid: str, start: date, end: date):
    """What reconciles against the bank and the cash box."""
    rows = await db.execute(
        select(Payment, Order.id, Table.label, User.full_name)
        .outerjoin(Order, Order.id == Payment.order_id)
        .outerjoin(Table, Table.id == Order.table_id)
        .outerjoin(User, User.id == Payment.recorded_by)
        .where(Payment.venue_id == vid, Payment.business_date.between(start, end))
        .order_by(Payment.business_date, Payment.created_at)
    )
    header = [
        "Night", "Taken at", "Order", "Table", "Amount", "Method", "Status",
        "Verification", "Split", "Provider", "Provider reference",
        "Transfer reference", "Recorded by",
    ]
    out = []
    for p, oid, label, staff in rows.all():
        out.append([
            p.business_date.isoformat(), _local(p.created_at),
            _ref(oid) if oid else "", label or "", _money(p.amount), p.method,
            p.status, p.verification, "yes" if p.is_split else "",
            p.provider or "", p.provider_ref or "", p.transfer_reference or "",
            staff or "",
        ])
    return header, out


async def _shifts(db: AsyncSession, vid: str, start: date, end: date):
    """Hours worked — the payroll sheet.

    Hours are left blank on a shift nobody clocked out of, rather than filled in
    with a guess. A blank prompts somebody to look; a number gets paid.
    """
    opens, closes = _utc_window(start, end)
    rows = await db.execute(
        select(Shift, User.full_name, User.role)
        .outerjoin(User, User.id == Shift.user_id)
        .where(Shift.venue_id == vid, Shift.started_at >= opens, Shift.started_at < closes)
        .order_by(Shift.started_at)
    )
    header = [
        "Night", "Staff", "Role", "Clocked in", "Clocked out", "Hours",
        "Ended by", "Unclosed", "Corrected", "Note",
    ]
    out = []
    for s, name, role in rows.all():
        hours = ""
        if s.ended_at:
            hours = f"{(s.ended_at - s.started_at).total_seconds() / 3600:.2f}"
        out.append([
            business_date(s.started_at).isoformat(), name or "", role or "",
            _local(s.started_at), _local(s.ended_at), hours,
            s.ended_by_reason or "", "yes" if s.flagged_unclosed else "",
            "yes" if s.corrected_at else "", s.note or "",
        ])
    return header, out


async def _stock(db: AsyncSession, vid: str, start: date, end: date):
    """Every movement in and out, which is how a shortage gets traced back to a
    night rather than argued about."""
    opens, closes = _utc_window(start, end)
    rows = await db.execute(
        select(StockMovement, MenuItem.name, MenuItem.unit_cost, User.full_name)
        .outerjoin(MenuItem, MenuItem.id == StockMovement.menu_item_id)
        .outerjoin(User, User.id == StockMovement.actor_id)
        .where(
            StockMovement.venue_id == vid,
            StockMovement.created_at >= opens,
            StockMovement.created_at < closes,
        )
        .order_by(StockMovement.created_at)
    )
    header = [
        "Night", "At", "Item", "Change", "Balance after", "Reason",
        "Unit cost", "Value moved", "Staff", "Order", "Note",
    ]
    out = []
    for m, item, cost, staff in rows.all():
        value = _money(abs(m.delta) * float(cost)) if cost is not None else ""
        out.append([
            business_date(m.created_at).isoformat(), _local(m.created_at),
            item or "", m.delta, m.balance_after, m.reason, _money(cost), value,
            staff or "", _ref(m.order_id) if m.order_id else "", m.note or "",
        ])
    return header, out


async def _nights(db: AsyncSession, vid: str, start: date, end: date):
    """Why each night was what it was.

    Exported alongside the sales so the two can be joined: a figure and the live
    act, holiday or power cut that produced it. That join is the whole reason
    the notes are collected — on its own this file is a diary.
    """
    rows = await db.execute(
        select(VenueNight, User.full_name)
        .outerjoin(User, User.id == VenueNight.recorded_by)
        .where(
            VenueNight.venue_id == vid,
            VenueNight.business_date.between(start, end),
        )
        .order_by(VenueNight.business_date)
    )
    header = ["Night", "Day", "Tag", "Note", "Written by", "Written at"]
    out = []
    for n, name in rows.all():
        out.append([
            n.business_date.isoformat(),
            n.business_date.strftime("%A"),
            n.tag or "", n.note or "", name or "", _local(n.created_at),
        ])
    return header, out


BUILDERS = {
    "orders": _orders,
    "items": _items,
    "payments": _payments,
    "shifts": _shifts,
    "stock": _stock,
    "nights": _nights,
}


@router.get("/{dataset}.csv")
async def export_csv(
    dataset: str,
    start: date | None = Query(None, description="First night to include (inclusive)"),
    end: date | None = Query(None, description="Last night to include (inclusive)"),
    current_user: User = Depends(require_roles("owner")),
    db: AsyncSession = Depends(get_db),
):
    """One night, one month, or a year of it — as a spreadsheet.

    Owner only, and scoped to their own venue: this is the broadest read in the
    system, so it is not something a station account can reach.
    """
    if dataset not in BUILDERS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown export. Choose one of: {', '.join(DATASETS)}",
        )
    start, end = _resolve_range(start, end)

    venue = (
        await db.execute(select(Venue).where(Venue.id == current_user.venue_id))
    ).scalar_one()

    header, rows = await BUILDERS[dataset](db, current_user.venue_id, start, end)
    return _csv_response(venue.slug, dataset, start, end, header, rows)

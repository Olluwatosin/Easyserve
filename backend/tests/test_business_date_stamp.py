"""Which night a row belongs to is decided once, when it is written.

A nightlife day runs 6am to 6am, so a round poured at 1am on Saturday belongs to
Friday night. That was worked out at query time from a constant, and no row
remembered anything — which is fine exactly as long as the constant never moves.

It is about to. A venue will be able to set its own rollover once it learns its
real closing hour, and a brand-new lounge cannot know that before it opens. The
first time that setting changes under query-time arithmetic, **every past report
silently changes**: last month's Saturday total becomes a different number than
the one that was read, paid staff against, and settled with a supplier.

So the night is stamped on the row. These tests pin the two halves of that: the
stamp is correct when written, and it does not move afterwards.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.utils import venue_time


def _at(y, m, d, hh, mm=0):
    """A moment on the venue's own clock."""
    return datetime(y, m, d, hh, mm, tzinfo=venue_time.LAGOS)


@pytest.mark.parametrize(
    "moment,night,why",
    [
        (_at(2026, 9, 25, 21, 0), date(2026, 9, 25), "Friday evening is Friday"),
        (_at(2026, 9, 25, 23, 59), date(2026, 9, 25), "just before midnight"),
        (_at(2026, 9, 26, 0, 1), date(2026, 9, 25), "just after midnight is still Friday"),
        (_at(2026, 9, 26, 3, 0), date(2026, 9, 25), "3am is the middle of Friday night"),
        (_at(2026, 9, 26, 5, 59), date(2026, 9, 25), "the last minute of Friday night"),
        (_at(2026, 9, 26, 6, 0), date(2026, 9, 26), "the rollover — Saturday begins"),
        (_at(2026, 9, 26, 14, 0), date(2026, 9, 26), "Saturday afternoon"),
    ],
)
def test_the_night_a_moment_belongs_to(moment, night, why):
    assert venue_time.business_date(moment) == night, why


def test_the_rollover_is_where_the_constant_says():
    """One minute either side of the venue's own boundary."""
    h = venue_time.BUSINESS_DAY_START_HOUR
    before = _at(2026, 9, 26, h - 1, 59)
    after = _at(2026, 9, 26, h, 0)
    assert venue_time.business_date(before) != venue_time.business_date(after)


def test_a_stamp_does_not_move_when_the_rollover_changes(monkeypatch):
    """The reason this column exists.

    A venue trades for a month at a 6am rollover, then changes it to 4am because
    that is when it actually closes. A stamp written under the old rule keeps
    saying what it said. Arithmetic done at query time would not.
    """
    moment = _at(2026, 9, 26, 5, 0)  # 5am — Friday night under a 6am rollover

    stamped = venue_time.business_date(moment)
    assert stamped == date(2026, 9, 25)

    monkeypatch.setattr(venue_time, "BUSINESS_DAY_START_HOUR", 4)
    recomputed = venue_time.business_date(moment)

    assert recomputed == date(2026, 9, 26), (
        "with a 4am rollover, 5am is the next day — the rule really did change"
    )
    assert stamped != recomputed, (
        "this is the whole point: a figure computed at read time would have "
        "moved between two readings, with nothing in the system changed"
    )


def test_the_sql_backfill_matches_the_python_rule():
    """Migration 016 backfills with SQL, and the two must agree.

    They are the same rule written twice in different languages, which is how
    a backfill ends up an hour out from everything written after it.
    """
    from pathlib import Path

    migration = (
        Path(__file__).resolve().parent.parent
        / "alembic" / "versions" / "016_business_date.py"
    ).read_text()

    assert "AT TIME ZONE 'Africa/Lagos'" in migration, (
        "the backfill must convert to venue time, not the server's"
    )
    assert f"INTERVAL '{venue_time.BUSINESS_DAY_START_HOUR} hours'" in migration, (
        "the backfill's rollover must be the same number as the code's"
    )
    assert venue_time.VENUE_TZ_NAME in migration


def test_both_money_tables_carry_the_stamp():
    """Orders and payments, because both are reported on per night. A stamp on
    one and not the other produces two answers to 'what did we take'."""
    from app.models.order import Order
    from app.models.payment import Payment

    for model in (Order, Payment):
        col = model.__table__.c.business_date
        assert col is not None
        assert not col.nullable, (
            f"{model.__tablename__}.business_date must be NOT NULL — a row with "
            "no night is a row that falls out of every report silently"
        )


def test_the_analytics_read_the_stamp_rather_than_recomputing():
    """Stamping achieves nothing if the reports still work the night out for
    themselves. Guards the half that is easy to forget."""
    from pathlib import Path

    src = (
        Path(__file__).resolve().parent.parent / "app" / "services" / "analytics_service.py"
    ).read_text()

    assert "Payment.business_date == tonight" in src
    assert "Order.business_date == tonight" in src
    assert "Payment.created_at >= today_start" not in src, (
        "a money query is still deriving the night at read time"
    )
    assert "Order.created_at >= today_start" not in src

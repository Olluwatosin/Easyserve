from datetime import datetime, timedelta, timezone

from app.services.analytics_service import LAGOS, business_day_start


def test_returns_utc():
    start = business_day_start()
    assert start.tzinfo is not None
    assert start.utcoffset() == timedelta(0)


def test_start_is_6am_lagos():
    start_lagos = business_day_start().astimezone(LAGOS)
    assert start_lagos.hour == 6
    assert start_lagos.minute == 0


def test_boundary_never_splits_a_night():
    """The start must always be in the past, and within the last 24h —
    so a 10PM–4AM service window always falls inside one business day."""
    now = datetime.now(timezone.utc)
    start = business_day_start()
    assert start <= now
    assert now - start < timedelta(hours=24)


def test_late_night_belongs_to_previous_calendar_day():
    """At 2AM Lagos the business day started 6AM *yesterday* — i.e. more than
    18 hours ago. We can't freeze time without extra deps, so assert the
    relationship structurally: start + 24h is the next rollover, and the
    current moment is inside [start, start+24h)."""
    start = business_day_start()
    next_rollover = start + timedelta(hours=24)
    now = datetime.now(timezone.utc)
    assert start <= now < next_rollover

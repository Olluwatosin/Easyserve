"""Venue-local time, and what "today" means to a nightlife business.

Two conventions live here because two different features kept needing them and
had started to disagree.

**Local, not UTC.** UTC midnight is 1AM in Lagos, right in the middle of
service. Anything reasoning about "what time is it at the venue" — happy hours,
day-of-week rules, nightly totals — has to do it in local time or it is an hour
wrong and splits every Friday night in half.

**The day rolls at 6AM, not midnight.** To a lounge, Friday night includes
Saturday's small hours. A promo advertised as "Friday, 10pm till 2am" is one
Friday promo, not two windows on two days, and the staff who worked it were on
Friday's shift.
"""
from datetime import date, datetime, time, timedelta, timezone

#: West Africa Time. No daylight saving, so a fixed offset is exact.
LAGOS = timezone(timedelta(hours=1))

#: A nightlife "day" runs 6AM → 6AM local.
BUSINESS_DAY_START_HOUR = 6


def now_local() -> datetime:
    """Wall-clock time at the venue."""
    return datetime.now(LAGOS)


def business_day_start(at: datetime | None = None) -> datetime:
    """Start of the business day containing `at`, in UTC."""
    local = (at.astimezone(LAGOS) if at else now_local())
    # Before 6AM we are still inside yesterday's night.
    anchor = local - timedelta(hours=BUSINESS_DAY_START_HOUR)
    start_local = anchor.replace(
        hour=BUSINESS_DAY_START_HOUR, minute=0, second=0, microsecond=0
    )
    return start_local.astimezone(timezone.utc)


def business_date(at: datetime | None = None) -> date:
    """Which night this instant belongs to.

    At 1AM on Saturday this returns Friday, because that is the night the venue,
    its staff and its promotions are all still in.
    """
    local = (at.astimezone(LAGOS) if at else now_local())
    if local.hour < BUSINESS_DAY_START_HOUR:
        local -= timedelta(days=1)
    return local.date()


def business_weekday(at: datetime | None = None) -> str:
    """Lower-case day name for the current night, e.g. "friday"."""
    return business_date(at).strftime("%A").lower()


def in_window(now: time, start: time, end: time) -> bool:
    """Is `now` inside a window that may wrap past midnight?

    A naive `start <= now <= end` silently returns False for every window that
    crosses midnight — which is the normal shape for nightlife. A happy hour of
    22:00–02:00 would simply never fire, with nothing to indicate why.
    """
    if start == end:
        # A zero-width window is almost certainly a mistake; treat it as always
        # on rather than never, since a promo saved with identical times was
        # meant to run.
        return True
    if start < end:
        return start <= now <= end
    # Wraps midnight: inside means after the start, or before the end.
    return now >= start or now <= end


def window_crosses_midnight(start: time, end: time) -> bool:
    return start > end

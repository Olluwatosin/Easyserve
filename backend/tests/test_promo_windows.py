"""Promo time windows.

The bug this guards against was silent: a happy hour of 22:00-02:00 — the normal
shape for nightlife — never fired, and nothing indicated why. Prices were simply
never discounted. The two causes were a comparison that cannot express a window
crossing midnight, and evaluating it in UTC while the venue lives in WAT.
"""
from datetime import datetime, time, timedelta, timezone

import pytest

from app.models.menu_item import MenuItem
from app.models.promo import Promo
from app.services.promo_service import apply_promo
from app.utils.venue_time import (
    LAGOS,
    business_date,
    business_weekday,
    in_window,
    window_crosses_midnight,
)


# ── the window comparison itself ─────────────────────────────────────────────

@pytest.mark.parametrize("now,start,end,expected", [
    # ordinary daytime window
    ("19:00", "18:00", "20:00", True),
    ("17:59", "18:00", "20:00", False),
    ("20:01", "18:00", "20:00", False),
    ("18:00", "18:00", "20:00", True),   # inclusive at the edges
    ("20:00", "18:00", "20:00", True),
    # the one that never worked: crossing midnight
    ("23:30", "22:00", "02:00", True),
    ("01:30", "22:00", "02:00", True),   # after midnight, still the same night
    ("22:00", "22:00", "02:00", True),
    ("02:00", "22:00", "02:00", True),
    ("02:01", "22:00", "02:00", False),
    ("21:59", "22:00", "02:00", False),
    ("12:00", "22:00", "02:00", False),  # the middle of the following day
])
def test_windows_including_ones_that_cross_midnight(now, start, end, expected):
    t = lambda s: time(*map(int, s.split(":")))
    assert in_window(t(now), t(start), t(end)) is expected


def test_a_zero_width_window_runs_rather_than_never_running():
    """Identical times are almost certainly a mistake, and a promo somebody
    saved was meant to be on. Failing open is the kinder wrong answer."""
    assert in_window(time(20, 0), time(18, 0), time(18, 0)) is True


def test_crossing_midnight_is_detectable():
    assert window_crosses_midnight(time(22, 0), time(2, 0)) is True
    assert window_crosses_midnight(time(18, 0), time(20, 0)) is False


# ── which night are we in ────────────────────────────────────────────────────

def test_after_midnight_still_belongs_to_the_night_before():
    """1AM Saturday is Friday night, to the venue and to its promos."""
    sat_1am = datetime(2026, 9, 12, 1, 0, tzinfo=LAGOS)   # Saturday
    assert business_date(sat_1am).strftime("%A") == "Friday"
    assert business_weekday(sat_1am) == "friday"


def test_after_the_6am_rollover_it_is_a_new_day():
    sat_7am = datetime(2026, 9, 12, 7, 0, tzinfo=LAGOS)
    assert business_weekday(sat_7am) == "saturday"


def test_the_rollover_boundary_itself():
    assert business_weekday(datetime(2026, 9, 12, 5, 59, tzinfo=LAGOS)) == "friday"
    assert business_weekday(datetime(2026, 9, 12, 6, 0, tzinfo=LAGOS)) == "saturday"


def test_utc_and_local_disagree_about_the_day_at_night():
    """The reason UTC was the wrong clock: at 00:30 Lagos it is still the
    previous day in UTC, an hour behind the room the promo runs in."""
    lagos_0030 = datetime(2026, 9, 12, 0, 30, tzinfo=LAGOS)
    assert lagos_0030.astimezone(timezone.utc).day == 11
    assert lagos_0030.day == 12


# ── end to end through apply_promo ───────────────────────────────────────────

def _promo(start: str, end: str, pct: float = 20, days=None) -> Promo:
    t = lambda s: time(*map(int, s.split(":")))
    return Promo(
        id="p1", venue_id="v1", name="Happy Hour", discount_pct=pct,
        start_time=t(start), end_time=t(end),
        days_active=days or [], applies_to=[], is_active=True,
    )


def _item(price: float = 5000) -> MenuItem:
    return MenuItem(id="i1", venue_id="v1", category_id="c1", name="Mojito", price=price)


def test_an_always_on_promo_discounts():
    assert apply_promo(_item(5000), [_promo("00:00", "23:59")]) == 4000.0


def test_an_inactive_promo_is_ignored():
    p = _promo("00:00", "23:59")
    p.is_active = False
    assert apply_promo(_item(5000), [p]) == 5000.0


def test_the_largest_discount_wins():
    promos = [_promo("00:00", "23:59", 10), _promo("00:00", "23:59", 30), _promo("00:00", "23:59", 15)]
    assert apply_promo(_item(5000), promos) == 3500.0


def test_a_window_that_excludes_now_leaves_the_price_alone():
    """Built relative to the venue clock so it holds whenever the suite runs."""
    from app.utils.venue_time import now_local
    n = now_local()
    far = (n + timedelta(hours=3)).time()
    farther = (n + timedelta(hours=5)).time()
    if far < farther:  # avoid accidentally constructing a wrapping window
        assert apply_promo(_item(5000), [_promo(far.strftime("%H:%M"), farther.strftime("%H:%M"))]) == 5000.0


def test_a_nightlife_window_covering_now_discounts():
    """The regression: a window shaped like a real happy hour must fire."""
    from app.utils.venue_time import now_local
    n = now_local()
    start = (n - timedelta(hours=2)).time()
    end = (n + timedelta(hours=2)).time()
    assert apply_promo(_item(5000), [_promo(start.strftime("%H:%M"), end.strftime("%H:%M"))]) == 4000.0


def test_day_restrictions_are_matched_against_tonight():
    from app.utils.venue_time import now_local
    n = now_local()
    start = (n - timedelta(hours=2)).time()
    end = (n + timedelta(hours=2)).time()
    tonight = business_weekday(n)
    on = _promo(start.strftime("%H:%M"), end.strftime("%H:%M"), days=[tonight])
    off = _promo(start.strftime("%H:%M"), end.strftime("%H:%M"), days=["nonesuch"])
    assert apply_promo(_item(5000), [on]) == 4000.0
    assert apply_promo(_item(5000), [off]) == 5000.0

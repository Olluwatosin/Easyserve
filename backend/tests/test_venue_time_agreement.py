"""The two clocks must agree about what night it is.

`backend/app/utils/venue_time.py` decides which business day a payment belongs
to. `frontend/src/lib/venueTime.ts` decides whether to say "Good evening" and
whether tonight is still Friday. They are separate files in separate languages
holding the same two constants, which is exactly the shape of thing that drifts
silently: change the rollover on one side and the owner is greeted with Saturday
over Friday's takings, with nothing broken and nothing to review.

This is the same guard as test_realtime_events.py — the structural kind that
fails in CI with the disagreement named, rather than a note in a file hoping
someone reads it.
"""
import re
from pathlib import Path

import pytest

from app.utils import venue_time

TS = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend" / "src" / "lib" / "venueTime.ts"
)


def _ts_source() -> str:
    return TS.read_text()


def test_the_frontend_clock_is_where_we_think_it_is():
    """A moved or renamed file must fail loudly, not quietly pass this file."""
    assert TS.exists(), f"venueTime.ts not found at {TS}"
    assert "BUSINESS_DAY_START_HOUR" in _ts_source()


def test_the_day_rolls_at_the_same_hour_on_both_sides():
    """6AM on one side and midnight on the other would put a 2am round in a
    different night depending on which screen you asked."""
    m = re.search(r"BUSINESS_DAY_START_HOUR\s*=\s*(\d+)", _ts_source())
    assert m, "could not find BUSINESS_DAY_START_HOUR in venueTime.ts"
    assert int(m.group(1)) == venue_time.BUSINESS_DAY_START_HOUR


def test_both_sides_name_the_same_timezone():
    """The frontend formats in an IANA zone; the backend carries the same name
    for SQL that has to convert database-side. They must be one place."""
    m = re.search(r'VENUE_TZ\s*=\s*"([^"]+)"', _ts_source())
    assert m, "could not find VENUE_TZ in venueTime.ts"
    assert m.group(1) == venue_time.VENUE_TZ_NAME


def _run_ts(instants: list[str]) -> list[dict]:
    """Execute the real venueTime.ts under node and ask it about these moments.

    Asserting the bands by re-deriving them in Python here would only prove
    Python agrees with itself. The file has no imports and no types beyond
    annotations, so stripping the annotations and running it is enough to test
    the code the browser actually runs.
    """
    import json
    import shutil
    import subprocess
    import tempfile

    node = shutil.which("node")
    if not node:
        pytest.skip("node not available")

    src = _ts_source()
    src = src.replace("export ", "")
    src = re.sub(r"now:\s*Date\s*=\s*new Date\(\)", "now = new Date()", src)
    src = re.sub(r"\)\s*:\s*(number|string|boolean)\s*\{", ") {", src)

    harness = (
        src
        + "\nconst moments = "
        + json.dumps(instants)
        + ";\n"
        + "console.log(JSON.stringify(moments.map((iso) => {\n"
        + "  const d = new Date(iso);\n"
        + "  return { iso, hour: venueHour(d), greeting: greeting(d),\n"
        + "           weekday: businessWeekday(d), night: isNight(d) };\n"
        + "})));\n"
    )

    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as fh:
        fh.write(harness)
        path = fh.name

    out = subprocess.run([node, path], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, f"venueTime.ts failed under node:\n{out.stderr}"
    return json.loads(out.stdout)


def test_the_greeting_follows_venue_time_not_the_reader_s_clock():
    """Lagos is UTC+1, so these UTC instants are 1am, 8am, 2pm and 9pm there —
    whatever timezone the machine running this test is in."""
    rows = _run_ts([
        "2026-09-11T00:00:00Z",  # 01:00 Lagos
        "2026-09-11T07:00:00Z",  # 08:00
        "2026-09-11T13:00:00Z",  # 14:00
        "2026-09-11T20:00:00Z",  # 21:00
    ])
    assert [r["hour"] for r in rows] == [1, 8, 14, 21]
    assert [r["greeting"] for r in rows] == [
        "Good evening",   # 1am is still last night, not "Good morning"
        "Good morning",
        "Good afternoon",
        "Good evening",
    ]


def test_the_small_hours_still_belong_to_last_night():
    """The case this whole file exists for. At 2am on Saturday the venue is
    still in Friday night: its staff, its takings and its greeting.
    """
    rows = _run_ts([
        "2026-09-11T21:00:00Z",  # Fri 22:00 Lagos
        "2026-09-12T01:00:00Z",  # Sat 02:00 Lagos — still Friday night
        "2026-09-12T06:00:00Z",  # Sat 07:00 Lagos — Saturday has begun
    ])
    assert [r["weekday"] for r in rows] == ["Friday", "Friday", "Saturday"]
    assert [r["greeting"] for r in rows] == ["Good evening", "Good evening", "Good morning"]
    assert [r["night"] for r in rows] == [True, True, False]


def test_the_rollover_hour_is_the_boundary_on_both_sides():
    """One minute either side of the backend's own constant."""
    h = venue_time.BUSINESS_DAY_START_HOUR
    # Lagos is UTC+1, so a Lagos hour is one behind in UTC.
    before = f"2026-09-12T{h - 2:02d}:59:00Z"  # 05:59 Lagos
    after = f"2026-09-12T{h - 1:02d}:00:00Z"   # 06:00 Lagos
    rows = _run_ts([before, after])
    assert rows[0]["greeting"] == "Good evening"
    assert rows[1]["greeting"] == "Good morning"

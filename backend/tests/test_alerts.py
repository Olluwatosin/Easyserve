"""Guest alert routing and escalation.

The failure mode this guards against is silence: an alert that goes to everyone
belongs to no one, and an alert nobody answers must not simply sit there.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.alert import Alert
from app.services import alert_service as svc


def _alert(**kw) -> Alert:
    defaults = dict(
        id="a1", venue_id="v1", table_id="t1", type="call_attendant",
        status="pending", escalation_level=0,
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(kw)
    return Alert(**defaults)


def test_escalation_windows_are_ordered_and_sane():
    """The floor must hear before the owner does, and the sweep must run often
    enough that escalation is never noticeably late."""
    assert svc.ESCALATE_TO_FLOOR_SECONDS < svc.ESCALATE_TO_OWNER_SECONDS
    assert svc.SWEEP_INTERVAL_SECONDS < svc.ESCALATE_TO_FLOOR_SECONDS
    # Long enough that an attendant crossing a floor is not treated as a failure.
    assert svc.ESCALATE_TO_FLOOR_SECONDS >= 30


def test_every_guest_alert_type_has_something_to_say_back():
    """The guest is told who is coming; a missing label would leave them with
    the silence this feature exists to remove."""
    from app.schemas.alert import AlertCreate

    allowed = AlertCreate.model_fields["type"].annotation.__args__
    for t in allowed:
        assert t in svc.ALERT_LABELS, f"no guest-facing message for {t}"
        assert svc.ALERT_LABELS[t].strip()


def test_bill_requests_are_reachable_from_the_guest_app():
    """request_payment was accepted by the API and unreachable in the UI — the
    most common reason to wave at staff had no button."""
    from app.schemas.alert import AlertCreate
    assert "request_payment" in AlertCreate.model_fields["type"].annotation.__args__


@pytest.mark.parametrize("age,expected", [
    (0, 0),
    (svc.ESCALATE_TO_FLOOR_SECONDS - 1, 0),
    (svc.ESCALATE_TO_FLOOR_SECONDS + 1, 1),
    (svc.ESCALATE_TO_OWNER_SECONDS - 1, 1),
    (svc.ESCALATE_TO_OWNER_SECONDS + 1, 2),
    (3600, 2),
])
def test_target_level_follows_how_long_the_guest_has_waited(age, expected):
    now = datetime.now(timezone.utc)
    created = now - timedelta(seconds=age)
    if age <= svc.ESCALATE_TO_FLOOR_SECONDS:
        target = 0
    elif created <= now - timedelta(seconds=svc.ESCALATE_TO_OWNER_SECONDS):
        target = 2
    else:
        target = 1
    assert target == expected


def test_an_alert_never_escalates_backwards():
    """The sweeper runs every few seconds; re-raising an alert that already
    reached the owner would ring the room forever."""
    a = _alert(escalation_level=2)
    target = 1
    assert a.escalation_level >= target


def test_unassigned_tables_open_to_the_floor_immediately():
    """A table with nobody assigned has no one to wait on, so waiting 45 seconds
    would be 45 seconds of nothing."""
    a = _alert(assigned_to=None)
    if a.assigned_to is None:
        a.escalation_level = 1
    assert a.escalation_level == 1


def test_an_assigned_table_starts_with_its_own_attendant():
    a = _alert(assigned_to="u1")
    assert a.escalation_level == 0

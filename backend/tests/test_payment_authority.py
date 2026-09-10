"""Who may take money.

Widening this is the highest-consequence change in the product: every extra
person who can mark an order paid is another person who can pocket cash and
close the table. So the rules are pinned rather than left to a role list that
someone widens later without noticing what it costs.
"""
import pytest

from app.routers.payments import ATTENDANT_METHODS


def test_attendants_get_methods_that_leave_their_own_record():
    """Cash is counted at close and POS leaves a terminal receipt. A transfer
    has neither — nothing but the staff member's word says it arrived — so it
    stays with the cashier or goes through the gateway."""
    assert ATTENDANT_METHODS == {"cash", "pos"}
    assert "transfer" not in ATTENDANT_METHODS
    assert "mobile_wallet" not in ATTENDANT_METHODS


def test_the_setting_defaults_to_the_cashier():
    """A venue that employs a cashier centralised money handling deliberately.
    Turning that off must be the owner's explicit act, never a silent upgrade
    that arrives with a deploy."""
    from app.models.venue import Venue

    assert Venue.__table__.c.attendants_take_payment.default.arg is False
    assert Venue.__table__.c.attendants_take_payment.nullable is False


def test_the_migration_backfills_existing_venues_as_cashier_only():
    import pathlib

    src = pathlib.Path("alembic/versions/013_attendant_payments.py").read_text()
    assert "sa.false()" in src, "existing venues must not silently gain floor payments"


@pytest.mark.parametrize("role", ["bartender", "kitchen", "security"])
def test_roles_that_never_handle_money_are_not_in_the_endpoint_guard(role):
    """A bartender marking a table paid has no legitimate use, and would put a
    second person outside the till on every drink order."""
    import pathlib

    src = pathlib.Path("app/routers/payments.py").read_text()
    for line in src.splitlines():
        if "require_roles(" in line:
            assert role not in line, f"{role} must not be able to record payments"

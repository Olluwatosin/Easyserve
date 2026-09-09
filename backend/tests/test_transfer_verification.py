"""A cashier-entered transfer is the one payment nothing verifies.

The guest can show a doctored bank alert, or a staff member can send the guest
to their own account and pocket it — and the exit pass issues either way, so the
guest walks out and the venue is short. These tests pin the two defences: a
reference is mandatory, and such payments are labelled for the owner to review.
"""
import pytest
from pydantic import ValidationError

from app.models.payment import Payment
from app.schemas.payment import UNVERIFIABLE_METHODS, PaymentCreate


def _payment(**kw) -> Payment:
    defaults = dict(id="p1", order_id="o1", venue_id="v1", amount=1000.0, method="cash")
    defaults.update(kw)
    return Payment(**defaults)


@pytest.mark.parametrize("method", sorted(UNVERIFIABLE_METHODS))
def test_transfer_without_a_reference_is_refused(method):
    with pytest.raises(ValidationError, match="transfer reference"):
        PaymentCreate(order_id="o1", amount=5000, method=method)


@pytest.mark.parametrize("ref", ["", "   ", "ab", "abc", " a "])
def test_a_token_reference_does_not_count(ref):
    """Four characters is a low bar, but it stops an empty box being clicked past."""
    with pytest.raises(ValidationError):
        PaymentCreate(order_id="o1", amount=5000, method="transfer", transfer_reference=ref)


def test_a_real_reference_is_accepted_and_trimmed():
    req = PaymentCreate(
        order_id="o1", amount=5000, method="transfer",
        transfer_reference="  GTB/TRF/4471902  ",
    )
    assert req.transfer_reference == "GTB/TRF/4471902"


@pytest.mark.parametrize("method", ["cash", "card", "pos"])
def test_methods_with_their_own_paper_trail_need_no_reference(method):
    """Cash is counted by hand; card and POS leave a terminal receipt."""
    assert PaymentCreate(order_id="o1", amount=5000, method=method).transfer_reference is None


def test_gateway_and_cash_count_as_verified():
    assert _payment(verification="gateway").is_verified is True
    assert _payment(verification="cash").is_verified is True


def test_manual_transfer_is_not_verified():
    """The flag that puts a payment in the owner's review queue."""
    assert _payment(method="transfer", verification="manual").is_verified is False


def test_unverifiable_methods_are_the_ones_without_an_independent_record():
    """Guards the set from drifting: card/POS have terminal receipts, cash is
    physically counted, transfers and wallets have neither."""
    assert UNVERIFIABLE_METHODS == {"transfer", "mobile_wallet"}

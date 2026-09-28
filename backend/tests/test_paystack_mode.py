"""Whether real money is about to move, said on the screen.

A tester who cannot tell test mode from live mode makes one of two mistakes, and
both cost something. They put a real card into what they believed was a test. Or
they use Paystack's test card against a live account, watch it be declined, and
report a fault that is not one.

Neither is solved by a line in a briefing document, because the person holding
the phone at the time is not the person who read it. So the bill says which mode
it is in, and this is the function it asks.

The key itself never appears in the answer — only which of the two documented
prefixes it carries.
"""
import pytest


@pytest.fixture
def paystack(monkeypatch):
    from app.services import paystack_service
    return paystack_service


def _with_key(monkeypatch, paystack, key: str):
    monkeypatch.setattr(paystack.settings, "PAYSTACK_SECRET_KEY", key)


def test_a_test_key_reports_test(monkeypatch, paystack):
    _with_key(monkeypatch, paystack, "sk_test_" + "a" * 32)
    assert paystack.mode() == "test"


def test_a_live_key_reports_live(monkeypatch, paystack):
    _with_key(monkeypatch, paystack, "sk_live_" + "b" * 32)
    assert paystack.mode() == "live"


def test_no_key_is_not_reported_as_live(monkeypatch, paystack):
    """The dangerous default. An unset key answering "live" would put a warning
    on nothing, or worse, take one away."""
    _with_key(monkeypatch, paystack, "")
    assert paystack.mode() == "unknown"
    assert paystack.is_enabled() is False


def test_an_unrecognised_key_shape_is_not_guessed_at(monkeypatch, paystack):
    """A key that is set but in neither documented shape is its own answer.
    Guessing "test" would invite a real card; guessing "live" would hide a
    genuine misconfiguration."""
    _with_key(monkeypatch, paystack, "pk_something_else")
    assert paystack.mode() == "unknown"


@pytest.mark.parametrize("key", ["sk_test_abc123", "sk_live_abc123"])
def test_the_key_never_appears_in_the_answer(monkeypatch, paystack, key):
    _with_key(monkeypatch, paystack, key)
    answer = paystack.mode()
    assert key not in answer
    assert "abc123" not in answer
    assert answer in ("test", "live")

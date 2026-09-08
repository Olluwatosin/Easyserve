"""The demo reset endpoint wipes every venue, so its guards are load-bearing.

These tests assert it stays invisible unless BOTH conditions hold, which is what
stops a stray DEMO_RESET_TOKEN in a production env from destroying a real venue.
"""
import pytest

from app.config import settings
from app.routers import demo


@pytest.fixture
def restore_settings():
    original = (settings.ENVIRONMENT, settings.DEMO_RESET_TOKEN)
    yield
    settings.ENVIRONMENT, settings.DEMO_RESET_TOKEN = original


def test_disabled_in_production_even_with_a_token(restore_settings):
    settings.ENVIRONMENT = "production"
    settings.DEMO_RESET_TOKEN = "a-real-looking-token"
    assert demo._enabled() is False


def test_disabled_in_development_even_with_a_token(restore_settings):
    settings.ENVIRONMENT = "development"
    settings.DEMO_RESET_TOKEN = "a-real-looking-token"
    assert demo._enabled() is False


def test_disabled_in_demo_without_a_token(restore_settings):
    settings.ENVIRONMENT = "demo"
    settings.DEMO_RESET_TOKEN = ""
    assert demo._enabled() is False


def test_enabled_only_when_both_conditions_hold(restore_settings):
    settings.ENVIRONMENT = "demo"
    settings.DEMO_RESET_TOKEN = "a-real-looking-token"
    assert demo._enabled() is True


@pytest.mark.parametrize("bad_token", [None, "", "wrong", "a-real-looking-toke"])
async def test_wrong_token_404s(restore_settings, bad_token):
    from fastapi import HTTPException

    settings.ENVIRONMENT = "demo"
    settings.DEMO_RESET_TOKEN = "a-real-looking-token"

    with pytest.raises(HTTPException) as exc:
        await demo.reset_demo(x_demo_token=bad_token)
    assert exc.value.status_code == 404


async def test_disabled_endpoint_404s_before_reading_the_token(restore_settings):
    from fastapi import HTTPException

    settings.ENVIRONMENT = "production"
    settings.DEMO_RESET_TOKEN = "a-real-looking-token"

    with pytest.raises(HTTPException) as exc:
        await demo.reset_demo(x_demo_token="a-real-looking-token")
    assert exc.value.status_code == 404

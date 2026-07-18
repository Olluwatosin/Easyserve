import pytest

from app.services.routing_service import determine_route
from app.utils.helpers import slugify


def test_determine_route():
    assert determine_route("drink") == "bar"
    assert determine_route("food") == "kitchen"
    assert determine_route("other") == "none"


def test_slugify_basic():
    assert slugify("The Grand Noir") == "the-grand-noir"


def test_slugify_strips_symbols_and_edges():
    assert slugify("  Grand & Lounge!!  ") == "grand-lounge"


def test_secret_key_guard_rejects_placeholder_in_production():
    from app.config import Settings, _PLACEHOLDER_SECRET

    with pytest.raises(ValueError):
        Settings(
            DATABASE_URL="postgresql+asyncpg://x:x@localhost/x",
            SECRET_KEY=_PLACEHOLDER_SECRET,
            ENVIRONMENT="production",
        )


def test_secret_key_guard_allows_strong_key_in_production():
    from app.config import Settings

    s = Settings(
        DATABASE_URL="postgresql+asyncpg://x:x@localhost/x",
        SECRET_KEY="a" * 40,
        ENVIRONMENT="production",
    )
    assert s.ENVIRONMENT == "production"

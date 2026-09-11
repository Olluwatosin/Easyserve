"""The guard that keeps this suite off a real database.

A test run once pointed at the live demo database and left eleven test venues
in it. They were harmless there and cleaned up by hand — but `seed.py` deletes
every row in every table, and the same command one export earlier in the shell
would do that to a real venue's night, with a passing test suite as the only
sign anything had happened.

conftest refuses to start unless the database is plainly disposable. These tests
exist so that protection cannot be quietly weakened: each one names a URL that
must never be accepted.
"""
from conftest import _looks_disposable


def test_the_live_demo_database_is_refused():
    """The exact shape of the URL that caused this. Neon, pooled, remote."""
    ok, why = _looks_disposable(
        "postgresql+asyncpg://user:pw@ep-polished-sound-b2e6cujf-pooler"
        ".c-6.eu-central-1.aws.neon.tech/neondb"
    )
    assert not ok
    assert "not this machine" in why


def test_any_remote_host_is_refused_even_when_named_like_a_test_db():
    """A shared staging database is still someone else's data, and a name is
    not evidence that it is disposable."""
    ok, _ = _looks_disposable("postgresql+asyncpg://u:p@db.example.com:5432/easyserve_test")
    assert not ok


def test_a_local_database_not_named_like_a_test_one_is_refused():
    """Guards the case of a developer running a real copy of the app locally:
    localhost is not on its own a promise that the rows are throwaway."""
    ok, why = _looks_disposable("postgresql+asyncpg://postgres@127.0.0.1:5432/easyserve")
    assert not ok
    assert "named like a test database" in why


def test_the_throwaway_database_is_accepted():
    """What `make db` creates."""
    ok, _ = _looks_disposable("postgresql+asyncpg://postgres@127.0.0.1:55432/easyserve_test")
    assert ok


def test_the_ci_database_is_accepted():
    """CI must keep running. This is the URL in .github/workflows/ci-cd.yml —
    if that changes, this test should fail rather than CI mysteriously not
    running its integration suites."""
    ok, _ = _looks_disposable(
        "postgresql+asyncpg://easyserve:easyserve@localhost:5432/easyserve_test"
    )
    assert ok


def test_the_conftest_default_is_accepted():
    """The fallback conftest sets when DATABASE_URL is unset, so a plain
    `pytest` with no environment still runs the unit tests."""
    ok, _ = _looks_disposable("postgresql+asyncpg://test:test@localhost:5432/test")
    assert ok

"""The demo reset: what it must not destroy, and what it must not change.

Both halves live here because both drive `seed()`, and two test modules calling
it bind SQLAlchemy's async engine to two different event loops.

**What it must not destroy.**

`seed.py` deletes every row in every table and then recreates the venue. The
wipe used to commit on its own, so anything that failed afterwards left the
venue deleted and nothing in its place. That is not hypothetical: a migration
added a NOT NULL column the seed did not set, the hourly reset wiped the
database, the insert failed, and the public demo served an empty venue until
somebody looked.

Tests were green the whole time, because nothing ran the seed.

So the whole reset is one transaction, proved by breaking it deliberately and
checking the old data survived — and the script refuses to run anywhere that is
not a demo or a developer's machine, because "deletes every row in every table"
is a sentence that should need permission.

**What it must not change.** A table's QR token, which is printed and stuck to
furniture. See the second half of this file.
"""
import os
import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="module")

DB_URL = os.environ.get("DATABASE_URL", "")


async def _db_available() -> bool:
    if not DB_URL:
        return False
    try:
        from sqlalchemy import text
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest_asyncio.fixture(scope="module", loop_scope="module", autouse=True)
async def _schema():
    if not await _db_available():
        pytest.skip("no database available")
    from app.database import Base, engine
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


def test_it_refuses_to_run_in_production(monkeypatch):
    """The guard that stops this erasing a venue's night."""
    import seed

    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="Refusing to seed"):
        seed._refuse_in_production()


@pytest.mark.parametrize("env", ["development", "demo", "test"])
def test_it_runs_where_it_is_meant_to(env, monkeypatch):
    import seed

    monkeypatch.setenv("ENVIRONMENT", env)
    seed._refuse_in_production()  # must not raise


def test_the_wipe_is_not_committed_on_its_own():
    """Structural, and the one that would have caught the outage.

    A commit between the deletes and the inserts is the whole bug: it makes the
    destruction durable before the rebuild has been attempted.
    """
    from pathlib import Path

    src = Path(__file__).resolve().parent.parent / "seed.py"
    body = src.read_text()

    wipe = body.index("DELETE FROM")
    # Everything from the wipe to the end of the function must contain exactly
    # one commit: the final one.
    after_wipe = body[wipe:]
    assert after_wipe.count("await db.commit()") == 1, (
        "the deletes and the rebuild must share one transaction — a commit "
        "between them makes an empty database the failure mode"
    )


async def test_a_failure_part_way_through_leaves_the_old_data(monkeypatch):
    """The real proof. Seed, break it, seed again, and check the venue survived.

    This is the outage reproduced: without the fix the venue is gone and the
    rebuild never happened.
    """
    from sqlalchemy import select

    import seed as seed_module
    from app.database import AsyncSessionLocal
    from app.models.venue import Venue

    monkeypatch.setenv("ENVIRONMENT", "test")

    # A venue to destroy.
    await seed_module.seed()
    async with AsyncSessionLocal() as db:
        before = (
            await db.execute(select(Venue).where(Venue.slug == "the-grand-noir"))
        ).scalar_one_or_none()
        assert before is not None, "the seed did not produce a venue to begin with"
        original_id = before.id

    # Break the rebuild after the wipe, the way a NOT NULL column did.
    boom = RuntimeError("simulated schema break during rebuild")

    def explode(*_args, **_kwargs):
        raise boom

    monkeypatch.setattr(seed_module, "nid", explode)

    with pytest.raises(RuntimeError):
        await seed_module.seed()

    async with AsyncSessionLocal() as db:
        after = (
            await db.execute(select(Venue).where(Venue.slug == "the-grand-noir"))
        ).scalar_one_or_none()

    assert after is not None, (
        "the failed reset left no venue — the wipe outlived the rebuild, which "
        "is exactly the outage this exists to prevent"
    )
    assert after.id == original_id, "the surviving venue is not the original one"


# ── QR codes are printed and stuck to furniture ──────────────────────────────
#
# The seed minted a fresh token for every table on every run, and the demo
# reseeds hourly — so every code anybody had scanned, screenshotted or printed
# died within the hour. The symptom is the worst kind: a guest reads "could not
# load menu" while the API returns 200, CORS is correct, the page loads, and
# every health check says the system is fine.
#
# On the demo that is an annoyance. At a venue it is two hundred dead stickers
# at once, found by guests, on a night nobody can reprint anything.


async def _tokens_by_label() -> dict[str, str]:
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.table import Table

    async with AsyncSessionLocal() as db:
        rows = await db.execute(select(Table.label, Table.qr_token))
        return {label: token for label, token in rows.all()}


async def test_a_printed_qr_still_works_after_a_reset(monkeypatch):
    """The bug, reproduced. Reseed and every sticker must still point at its
    own table."""
    import seed as seed_module

    monkeypatch.setenv("ENVIRONMENT", "test")

    await seed_module.seed()
    before = await _tokens_by_label()
    assert before, "the seed produced no tables to check"

    await seed_module.seed()
    after = await _tokens_by_label()

    assert set(before) == set(after), "the reset changed which tables exist"
    for label, token in before.items():
        assert after[label] == token, (
            f"the QR code on {label} changed — every sticker for that table is "
            "now dead, and the only symptom a guest sees is 'could not load menu'"
        )


async def test_a_fresh_venue_still_gets_codes(monkeypatch):
    """Preserving must not mean failing to issue one in the first place."""
    import seed as seed_module

    monkeypatch.setenv("ENVIRONMENT", "test")
    await seed_module.seed()

    tokens = await _tokens_by_label()
    assert all(tokens.values()), "a table was seeded without a QR token"
    assert len(set(tokens.values())) == len(tokens), "two tables share one code"


async def test_the_api_never_rewrites_a_token():
    """The other way a sticker could die. Editing a table — renaming it,
    re-zoning it, changing its minimum spend — must leave the code alone."""
    from app.schemas.table import TableUpdate

    assert "qr_token" not in TableUpdate.model_fields, (
        "a table update can change the QR token, so renaming a table would "
        "silently kill its sticker"
    )

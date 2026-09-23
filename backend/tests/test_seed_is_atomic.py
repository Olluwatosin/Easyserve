"""The demo reset must not be able to destroy what it cannot rebuild.

`seed.py` deletes every row in every table and then recreates the venue. The
wipe used to commit on its own, so anything that failed afterwards left the
venue deleted and nothing in its place. That is not hypothetical: a migration
added a NOT NULL column the seed did not set, the hourly reset wiped the
database, the insert failed, and the public demo served an empty venue until
somebody looked.

Tests were green the whole time, because nothing ran the seed.

So two things are pinned here. The whole reset is one transaction, proved by
breaking it deliberately and checking the old data survived. And the script
refuses to run anywhere that is not a demo or a developer's machine, because
"deletes every row in every table" is a sentence that should need permission.
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

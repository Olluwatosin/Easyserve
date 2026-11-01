"""Where an uploaded menu photo goes, and what happens when it cannot get there.

Uploads were written to a directory inside the container. A container filesystem
does not survive a restart and `render.yaml` declares no disk, so every photo an
owner took disappeared on the next deploy — and because the database kept the
URL, the menu filled with broken images rather than going blank. That reads as
the product losing them rather than the host.

Local disk stays supported on purpose: a venue running from docker-compose on
its own VPS has a real volume, and development should not need cloud
credentials. What must not happen is a container host quietly using local disk
while everyone assumes otherwise, which is why /health reports the choice.
"""
import pytest


@pytest.fixture(scope="module", autouse=True)
def _release_the_engine():
    """Hand the database engine back when this module is done.

    These are synchronous tests driving the app through TestClient, and any
    request that touches the database binds the global engine's connection pool
    to TestClient's event loop. The async suites each get their own loop, so a
    module that runs afterwards finds a pool bound to a loop that has closed and
    reports "no database available" — eight tests in another file started
    skipping silently when this module was added, which is worse than failing.

    The async suites already dispose on teardown. This does the same from a
    sync fixture.
    """
    yield
    import asyncio

    from app.database import engine

    asyncio.run(engine.dispose())


@pytest.fixture
def store(monkeypatch):
    from app.services import image_store
    return image_store


def _configure(monkeypatch, store, url: str, key: str):
    monkeypatch.setattr(store.settings, "SUPABASE_URL", url)
    monkeypatch.setattr(store.settings, "SUPABASE_KEY", key)


def test_unconfigured_means_local_disk(monkeypatch, store):
    _configure(monkeypatch, store, "", "")
    assert store.is_remote() is False
    assert store.describe() == "local-disk"


def test_both_settings_are_required(monkeypatch, store):
    """A URL with no key is a half-finished configuration, and treating it as
    remote would fail every upload instead of falling back."""
    _configure(monkeypatch, store, "https://x.supabase.co", "")
    assert store.is_remote() is False
    _configure(monkeypatch, store, "", "some-key")
    assert store.is_remote() is False


def test_configured_means_remote(monkeypatch, store):
    _configure(monkeypatch, store, "https://x.supabase.co", "some-key")
    assert store.is_remote() is True
    assert store.describe() == "supabase"


@pytest.mark.asyncio
async def test_a_local_write_returns_a_servable_path(monkeypatch, store, tmp_path):
    from app.routers import menu

    _configure(monkeypatch, store, "", "")
    monkeypatch.setattr(menu, "UPLOAD_DIR", tmp_path / "uploads")

    url = await store.put_image(b"not-really-webp-but-bytes-are-bytes")
    assert url.startswith("/static/uploads/")
    assert url.endswith(".webp")
    written = (tmp_path / "uploads").iterdir()
    assert len(list(written)) == 1


@pytest.mark.asyncio
async def test_every_upload_gets_its_own_name(monkeypatch, store, tmp_path):
    """Names are UUIDs so a URL never points at different bytes — which is what
    makes an immutable cache header safe, and means one item's photo can never
    overwrite another's."""
    from app.routers import menu

    _configure(monkeypatch, store, "", "")
    monkeypatch.setattr(menu, "UPLOAD_DIR", tmp_path / "uploads")

    names = {await store.put_image(b"x") for _ in range(5)}
    assert len(names) == 5


@pytest.mark.asyncio
async def test_a_remote_failure_raises_rather_than_silently_going_local(
    monkeypatch, store
):
    """The important one. Falling back to local disk on a failed upload would be
    the worst outcome: it looks like it worked, and the file is gone again on the
    next deploy with nothing to explain why."""
    import httpx

    _configure(monkeypatch, store, "https://x.supabase.co", "some-key")

    class Failing:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def post(self, *_a, **_kw):
            return httpx.Response(500, text="bucket is on fire")

    monkeypatch.setattr(store.httpx, "AsyncClient", lambda **_kw: Failing())

    with pytest.raises(RuntimeError):
        await store.put_image(b"bytes")


@pytest.mark.asyncio
async def test_a_remote_success_returns_the_public_url(monkeypatch, store):
    import httpx

    _configure(monkeypatch, store, "https://x.supabase.co", "some-key")
    seen = {}

    class Working:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def post(self, url, **kw):
            seen["url"] = url
            seen["headers"] = kw.get("headers", {})
            return httpx.Response(200, text="{}")

    monkeypatch.setattr(store.httpx, "AsyncClient", lambda **_kw: Working())

    url = await store.put_image(b"bytes")
    assert url.startswith("https://x.supabase.co/storage/v1/object/public/menu-images/")
    # Never overwrite: a collision on a UUID means something is badly wrong, and
    # replacing another item's photo is not how to discover it.
    assert seen["headers"]["x-upsert"] == "false"
    assert "immutable" in seen["headers"]["Cache-Control"]


def test_the_key_never_appears_in_the_description(monkeypatch, store):
    """describe() is served on /health, which is public."""
    _configure(monkeypatch, store, "https://x.supabase.co", "super-secret-key")
    assert "secret" not in store.describe()
    assert store.describe() == "supabase"


def test_health_says_where_images_go():
    """So a container host quietly on local disk is visible from outside."""
    from fastapi.testclient import TestClient
    from app.main import app

    body = TestClient(app).get("/health").json()
    assert body["images"] in ("supabase", "local-disk")

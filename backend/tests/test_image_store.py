"""Where an uploaded menu photo goes, and what happens when it cannot get there.

Uploads were written to a directory inside the container. A container filesystem
does not survive a restart and the Render blueprint declares no disk, so every
photo an owner took disappeared on the next deploy — and because the database
kept the URL, the menu filled with broken images rather than going blank. That
reads as the product losing them rather than the host.

Cloudinary is the remote store: a CDN rather than a bucket, which matters when
the photos are fetched by guests on Nigerian mobile data. Local disk stays
supported for a VPS with a real volume and for development.

Two things here are worth more than the rest. The **signature** is checked
against Cloudinary's own documented vector, because a wrong one fails every
upload in production and passes every test that only mocks the HTTP call. And
the **request shape** is asserted field by field, because an extra or missing
form field invalidates the signature just as thoroughly as bad arithmetic.
"""
import hashlib

import pytest


@pytest.fixture(scope="module", autouse=True)
def _release_the_engine():
    """See test_security_headers — a sync TestClient request that touches the
    database binds the global engine to this loop, and a later async module then
    finds a pool bound to a loop that has closed."""
    yield
    import asyncio

    from app.database import engine

    asyncio.run(engine.dispose())


@pytest.fixture
def store():
    from app.services import image_store
    return image_store


def _configure(monkeypatch, store, url: str):
    monkeypatch.setattr(store.settings, "CLOUDINARY_URL", url)


GOOD_URL = "cloudinary://123456789:the-secret@demo-cloud"


# ── The signature, which is the part that silently breaks everything ─────────


def test_the_signature_matches_cloudinarys_documented_vector(store):
    """Their published example. If this drifts, every upload is rejected and no
    mocked test would notice."""
    expected = hashlib.sha1(
        b"public_id=sample_image&timestamp=1315060510abcd"
    ).hexdigest()
    got = store._signature(
        {"public_id": "sample_image", "timestamp": "1315060510"}, "abcd"
    )
    assert got == expected


def test_the_caller_does_not_have_to_sort_the_parameters(store):
    a = store._signature({"timestamp": "1", "public_id": "x"}, "s")
    b = store._signature({"public_id": "x", "timestamp": "1"}, "s")
    assert a == b


def test_the_secret_changes_the_signature(store):
    one = store._signature({"public_id": "x", "timestamp": "1"}, "secret-one")
    two = store._signature({"public_id": "x", "timestamp": "1"}, "secret-two")
    assert one != two


# ── Choosing a store ─────────────────────────────────────────────────────────


def test_unconfigured_means_local_disk(monkeypatch, store):
    _configure(monkeypatch, store, "")
    assert store.is_remote() is False
    assert store.describe() == "local-disk"


def test_configured_means_cloudinary(monkeypatch, store):
    _configure(monkeypatch, store, GOOD_URL)
    assert store.is_remote() is True
    assert store.describe() == "cloudinary"


@pytest.mark.parametrize(
    "bad",
    [
        "https://api.cloudinary.com/demo",          # wrong scheme entirely
        "cloudinary://no-secret@cloud",            # key but no secret
        "cloudinary://key:secret@",                # no cloud name
        "cloudinary://",                           # nothing at all
        "   ",                                     # whitespace from a dashboard
    ],
)
def test_a_malformed_url_degrades_instead_of_crashing(monkeypatch, store, bad):
    """A typo in a dashboard field should drop to local disk with /health saying
    so, not take the API down on boot."""
    _configure(monkeypatch, store, bad)
    assert store.is_remote() is False
    assert store.describe() == "local-disk"


def test_the_credential_never_appears_in_the_description(monkeypatch, store):
    """describe() is served on /health, which is public."""
    _configure(monkeypatch, store, GOOD_URL)
    assert store.describe() == "cloudinary"
    assert "the-secret" not in store.describe()
    assert "123456789" not in store.describe()


# ── Local disk ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_local_write_returns_a_servable_path(monkeypatch, store, tmp_path):
    from app.routers import menu

    _configure(monkeypatch, store, "")
    monkeypatch.setattr(menu, "UPLOAD_DIR", tmp_path / "uploads")

    url = await store.put_image(b"pretend-this-is-webp")
    assert url.startswith("/static/uploads/")
    assert url.endswith(".webp")
    assert len(list((tmp_path / "uploads").iterdir())) == 1


@pytest.mark.asyncio
async def test_every_upload_gets_its_own_name(monkeypatch, store, tmp_path):
    """Public ids are UUIDs, so a URL never points at different bytes — which is
    what makes an immutable cache header safe, and means one item's photo can
    never overwrite another's."""
    from app.routers import menu

    _configure(monkeypatch, store, "")
    monkeypatch.setattr(menu, "UPLOAD_DIR", tmp_path / "uploads")

    assert len({await store.put_image(b"x") for _ in range(5)}) == 5


# ── Cloudinary ───────────────────────────────────────────────────────────────


class _Recorder:
    """Stands in for httpx.AsyncClient and keeps what was sent."""

    def __init__(self, status: int = 200, body: dict | None = None):
        self.status = status
        self.body = body if body is not None else {"public_id": "easyserve/menu/abc"}
        self.url: str | None = None
        self.data: dict | None = None
        self.files: dict | None = None

    def __call__(self, **_kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False

    async def post(self, url, data=None, files=None, **_kw):
        import httpx
        import json

        self.url, self.data, self.files = url, data, files
        return httpx.Response(self.status, text=json.dumps(self.body))


@pytest.mark.asyncio
async def test_a_signed_upload_sends_exactly_the_right_fields(monkeypatch, store):
    """An added, missing or renamed form field invalidates the signature just as
    surely as bad arithmetic, and the failure looks identical."""
    rec = _Recorder()
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    await store.put_image(b"bytes")

    assert rec.url == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    assert set(rec.data) == {
        "folder", "public_id", "timestamp", "overwrite", "api_key", "signature",
    }
    assert rec.data["api_key"] == "123456789"
    assert rec.data["overwrite"] == "false"
    assert "file" in rec.files

    # The signature must cover the signable params and nothing else — api_key,
    # signature and the file are excluded by Cloudinary's rules.
    signable = {
        k: v for k, v in rec.data.items() if k not in ("api_key", "signature")
    }
    assert rec.data["signature"] == store._signature(signable, "the-secret")


@pytest.mark.asyncio
async def test_the_secret_is_never_sent_as_a_field(monkeypatch, store):
    rec = _Recorder()
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    await store.put_image(b"bytes")
    assert "the-secret" not in str(rec.data)


@pytest.mark.asyncio
async def test_the_returned_url_carries_the_cdn_transformations(monkeypatch, store):
    """f_auto and q_auto are the reason for choosing a CDN over a bucket: each
    phone gets AVIF or WebP at a sensible quality without us making variants."""
    rec = _Recorder()
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    url = await store.put_image(b"bytes")
    assert url == (
        "https://res.cloudinary.com/demo-cloud/image/upload/"
        "f_auto,q_auto/easyserve/menu/abc"
    )


@pytest.mark.asyncio
async def test_it_trusts_the_public_id_cloudinary_assigned(monkeypatch, store):
    """Rather than our own guess at the path, which is how a URL ends up
    pointing nowhere."""
    rec = _Recorder(body={"public_id": "somewhere/else/xyz"})
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    assert (await store.put_image(b"b")).endswith("/somewhere/else/xyz")


@pytest.mark.asyncio
async def test_a_remote_failure_raises_rather_than_silently_going_local(
    monkeypatch, store
):
    """The important one. Falling back to local disk on a failed upload would be
    the worst outcome: it looks like it worked, and the file is gone again on
    the next deploy with nothing to explain why."""
    rec = _Recorder(status=401, body={"error": {"message": "bad signature"}})
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    with pytest.raises(RuntimeError):
        await store.put_image(b"bytes")


@pytest.mark.asyncio
async def test_a_reply_that_is_not_json_still_yields_a_usable_url(
    monkeypatch, store
):
    """A proxy returning HTML on a 200 should not lose a photo that did upload."""
    import httpx

    class Html(_Recorder):
        async def post(self, url, data=None, files=None, **_kw):
            self.url, self.data, self.files = url, data, files
            return httpx.Response(200, text="<html>hello</html>")

    rec = Html()
    _configure(monkeypatch, store, GOOD_URL)
    monkeypatch.setattr(store.httpx, "AsyncClient", rec)

    url = await store.put_image(b"bytes")
    assert url.startswith("https://res.cloudinary.com/demo-cloud/")
    assert "easyserve/menu/" in url


def test_health_says_where_images_go():
    """So a container host quietly on local disk is visible from outside."""
    from fastapi.testclient import TestClient
    from app.main import app

    body = TestClient(app).get("/health").json()
    assert body["images"] in ("cloudinary", "local-disk")

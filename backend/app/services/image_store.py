"""Where an uploaded menu photo actually lives.

Uploads were written to a directory inside the container. A container filesystem
does not survive a restart, and the Render blueprint declares no disk — so every
photo an owner took disappeared on the next deploy, the next crash, or the next
time the instance was recycled. The database kept the URL, so the menu did not
go blank; it filled with broken images, which is worse because it reads as the
product losing them rather than the host.

An owner who photographs eighty items and loses the evening's work does not file
a bug. They stop using the product.

Two stores, chosen by configuration:

**Cloudinary**, when ``CLOUDINARY_URL`` is set. A CDN rather than a bucket,
which matters here: menu photos are fetched by guests on Nigerian mobile data,
and ``f_auto,q_auto`` in the delivery URL means each phone gets AVIF or WebP at
a sensible quality without us generating variants.

**Local disk** otherwise. Kept deliberately — a venue running this from
docker-compose on its own VPS has a real volume and needs no third party, and
development should not require an account anywhere.

No SDK. Cloudinary's upload API is a signed multipart POST, and httpx is already
a dependency; adding a client library to make one request would be weight for
nothing.
"""
import hashlib
import logging
import time
import uuid
from urllib.parse import urlparse

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

#: Long cache. Public IDs are fresh UUIDs, so a URL never points at different
#: bytes and can be cached as immutable.
_CACHE_CONTROL = "public, max-age=31536000, immutable"

#: Applied by the CDN at delivery, not at upload: `f_auto` picks the best format
#: the requesting browser accepts, `q_auto` the lowest quality indistinguishable
#: from the original. This is the whole reason for preferring a CDN over a
#: bucket for images a guest loads over 3G.
_DELIVERY = "f_auto,q_auto"


class _Cloudinary:
    """Credentials parsed out of the single ``cloudinary://`` URL."""

    __slots__ = ("key", "secret", "cloud")

    def __init__(self, key: str, secret: str, cloud: str) -> None:
        self.key = key
        self.secret = secret
        self.cloud = cloud


def _cloudinary() -> _Cloudinary | None:
    """Parse ``CLOUDINARY_URL``, or None when it is unset or malformed.

    Malformed counts as unset rather than raising: a typo in a dashboard field
    should degrade to local disk with /health saying so, not take the whole API
    down on boot.
    """
    raw = (settings.CLOUDINARY_URL or "").strip()
    if not raw.startswith("cloudinary://"):
        return None
    parsed = urlparse(raw)
    if not (parsed.username and parsed.password and parsed.hostname):
        logger.warning("CLOUDINARY_URL is set but not in cloudinary://key:secret@cloud form")
        return None
    return _Cloudinary(parsed.username, parsed.password, parsed.hostname)


def is_remote() -> bool:
    """Is durable, off-container storage configured?"""
    return _cloudinary() is not None


def describe() -> str:
    """For /health, so "where do menu photos go" is answerable from outside.

    Never includes any part of the credential.
    """
    return "cloudinary" if is_remote() else "local-disk"


def _signature(params: dict[str, str], secret: str) -> str:
    """Cloudinary's upload signature.

    Parameters sorted by name, joined ``k=v`` with ``&``, the API secret
    appended, SHA-1 of the result. ``file``, ``api_key`` and ``resource_type``
    are not part of it — including them is the usual reason a signed upload is
    rejected, so they never enter this dict.
    """
    canonical = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hashlib.sha1(f"{canonical}{secret}".encode()).hexdigest()


def delivery_url(cloud: str, public_id: str) -> str:
    """Where a stored image is served from, with the CDN transformations in it."""
    return f"https://res.cloudinary.com/{cloud}/image/upload/{_DELIVERY}/{public_id}"


async def put_image(data: bytes, *, content_type: str = "image/webp") -> str:
    """Store the bytes and return the URL to serve them from.

    Raises on a remote failure rather than quietly writing to local disk. A
    silent fallback is the worst of both: the upload looks like it worked, and
    the file is gone again on the next deploy with nothing to explain why.
    """
    name = uuid.uuid4().hex
    cfg = _cloudinary()

    if cfg is None:
        from app.routers.menu import UPLOAD_DIR  # local import avoids a cycle

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / f"{name}.webp").write_bytes(data)
        return f"/static/uploads/{name}.webp"

    folder = settings.CLOUDINARY_FOLDER.strip("/")
    signed = {
        "folder": folder,
        "public_id": name,
        "timestamp": str(int(time.time())),
        # Never replace: the public id is a fresh UUID, so a collision would
        # mean something is badly wrong, and overwriting another item's photo is
        # not how to discover it.
        "overwrite": "false",
    }
    form = {
        **signed,
        "api_key": cfg.key,
        "signature": _signature(signed, cfg.secret),
    }

    async with httpx.AsyncClient(timeout=30) as http:
        res = await http.post(
            f"https://api.cloudinary.com/v1_1/{cfg.cloud}/image/upload",
            data=form,
            files={"file": (f"{name}.webp", data, content_type)},
        )

    if res.status_code not in (200, 201):
        # Never the response body at error level — a rejected upload echoes the
        # parameters back, and the api_key is among them.
        logger.error("Cloudinary upload failed: HTTP %s", res.status_code)
        logger.debug("Cloudinary response: %s", res.text[:300])
        raise RuntimeError("Could not store the image")

    # Prefer the id Cloudinary actually assigned — it includes the folder, and
    # trusting our own guess at the path is how a URL ends up pointing nowhere.
    try:
        public_id = res.json().get("public_id") or f"{folder}/{name}"
    except ValueError:
        public_id = f"{folder}/{name}"

    return delivery_url(cfg.cloud, public_id)

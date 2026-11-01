"""Where an uploaded menu photo actually lives.

Uploads were written to a directory inside the container. A container filesystem
does not survive a restart, and `render.yaml` declares no disk — so every photo
an owner took disappeared on the next deploy, the next crash, or the next time
the instance was recycled. The database kept the URL, so the menu did not go
blank; it filled with broken images, which is worse because it looks like the
product lost them rather than the host.

An owner who photographs eighty items and loses the evening's work does not file
a bug. They stop using the product.

So: object storage when it is configured, local disk when it is not. Local disk
stays supported deliberately — a venue running this on their own VPS from
docker-compose has a real volume and needs no bucket — and development should
not require cloud credentials.

Supabase is the backend because three settings for it already existed, unused,
from a plan that was never finished. Its storage API is plain HTTP, so this
needs no new dependency.
"""
import logging
import uuid

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

#: Public read, long cache. The filename is a fresh UUID per upload, so a URL
#: never points at different bytes and can be cached indefinitely.
_CACHE_CONTROL = "public, max-age=31536000, immutable"


def is_remote() -> bool:
    """Is durable object storage configured?"""
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


def describe() -> str:
    """For the health check, so "where do images go" is answerable without
    reading the config."""
    return "supabase" if is_remote() else "local-disk"


async def put_image(data: bytes, *, content_type: str = "image/webp") -> str:
    """Store the bytes and return the URL to serve them from.

    Raises on failure rather than falling back to local disk. A silent fallback
    would be the worst of both: the upload appears to succeed, and the file is
    gone again on the next deploy with nothing to indicate why.
    """
    name = f"{uuid.uuid4()}.webp"

    if not is_remote():
        from app.routers.menu import UPLOAD_DIR  # local import avoids a cycle

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / name).write_bytes(data)
        return f"/static/uploads/{name}"

    base = settings.SUPABASE_URL.rstrip("/")
    bucket = settings.SUPABASE_BUCKET_MENU
    url = f"{base}/storage/v1/object/{bucket}/{name}"

    async with httpx.AsyncClient(timeout=30) as http:
        res = await http.post(
            url,
            content=data,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                "apikey": settings.SUPABASE_KEY,
                "Content-Type": content_type,
                "Cache-Control": _CACHE_CONTROL,
                # Never overwrite: the name is a fresh UUID, so a collision
                # would mean something is badly wrong and silently replacing
                # another item's photo is not the way to find out.
                "x-upsert": "false",
            },
        )

    if res.status_code not in (200, 201):
        logger.error(
            "Supabase upload failed: HTTP %s %s", res.status_code, res.text[:200]
        )
        raise RuntimeError("Could not store the image")

    return f"{base}/storage/v1/object/public/{bucket}/{name}"

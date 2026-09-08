"""Public demo support — reset the seeded venue on a schedule.

Deliberately double-guarded so this can never fire against a real venue:
  1. ENVIRONMENT must be exactly "demo" (production sets "production")
  2. DEMO_RESET_TOKEN must be set and match the caller's header

When either guard fails the route 404s, so the endpoint doesn't even announce
its existence outside the demo deployment.
"""
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["demo"])


def _enabled() -> bool:
    return settings.ENVIRONMENT == "demo" and bool(settings.DEMO_RESET_TOKEN)


@router.post("/reset")
async def reset_demo(x_demo_token: str | None = Header(default=None)):
    """Wipe and re-seed The Grand Noir so the next visitor gets a clean venue."""
    if not _enabled():
        raise HTTPException(status_code=404, detail="Not found")
    if not x_demo_token or not hmac.compare_digest(x_demo_token, settings.DEMO_RESET_TOKEN):
        raise HTTPException(status_code=404, detail="Not found")

    # Imported lazily: seed.py lives at the backend root, outside the app package,
    # and pulls in the whole model graph.
    from seed import seed

    logger.info("Demo reset requested — re-seeding The Grand Noir")
    await seed()
    return {"status": "reseeded", "venue": "The Grand Noir"}

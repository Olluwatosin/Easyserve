import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

# Optional error tracking — no-op unless SENTRY_DSN is configured
if settings.SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.1,
        )
        logging.getLogger(__name__).info("Sentry error tracking enabled")
    except ImportError:
        logging.getLogger(__name__).warning("SENTRY_DSN set but sentry-sdk not installed")
from app.utils.limiter import limiter
from app.routers import (
    auth,
    venues,
    tables,
    menu,
    customer,
    orders,
    payments,
    exit_pass,
    alerts,
    promos,
    analytics,
    staff,
    websocket,
    demo,
    stock,
)
from app.services.ws_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from app.services.alert_service import escalation_sweeper

    await manager.startup(settings.REDIS_URL)
    # Raises guest alerts nobody has answered. A sweep rather than a timer per
    # alert, so escalation survives a restart mid-service.
    sweeper = asyncio.create_task(escalation_sweeper())
    yield
    sweeper.cancel()
    try:
        await sweeper
    except asyncio.CancelledError:
        pass
    await manager.shutdown()


app = FastAPI(
    title="EasyServe API",
    version="5.0.0",
    description="Hospitality Operating System for African nightlife venues",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(venues.router, prefix="/api/v1")
app.include_router(tables.router, prefix="/api/v1")
app.include_router(menu.router, prefix="/api/v1")
app.include_router(customer.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(exit_pass.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(promos.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")
app.include_router(demo.router, prefix="/api/v1")
app.include_router(stock.router, prefix="/api/v1")
app.include_router(websocket.router)


_static_dir = Path(settings.STATIC_DIR)
_static_dir.mkdir(parents=True, exist_ok=True)
(_static_dir / "uploads").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


@app.get("/health")
async def health():
    """Deep health check: DB down → 503 (compose restarts us); Redis down is
    reported but non-fatal (WS falls back to single-instance mode)."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.database import AsyncSessionLocal
    from app.services.ws_manager import manager as ws_manager

    db_ok = True
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    body = {
        "status": "ok" if db_ok else "degraded",
        "version": "5.0.0",
        "db": "up" if db_ok else "down",
        "redis": "up" if ws_manager._redis is not None else "down",
    }
    return JSONResponse(status_code=200 if db_ok else 503, content=body)

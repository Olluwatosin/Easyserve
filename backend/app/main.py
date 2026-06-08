from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
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
)
from app.services.ws_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await manager.startup(settings.REDIS_URL)
    yield
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
app.include_router(websocket.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "5.0.0"}

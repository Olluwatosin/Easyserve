"""Crashes that happen on somebody else's phone.

Sentry was wired into the backend and the frontend had nothing, so a JavaScript
exception during an order was invisible: the guest saw a blank screen, closed the
tab, and nobody ever knew. For a product where every real defect so far was
found by somebody using it rather than by inspection, that was the largest
missing instrument in the whole system.

This takes reports from the browser and hands them to the logger — and to Sentry
when a DSN is configured, which is the one already set up for the backend. One
DSN instead of two, and no new frontend dependency.

Unauthenticated on purpose: guests crash too, and they have no account. That
makes it an open write endpoint, so everything below is about keeping it boring:
hard size caps, a tight rate limit, a fixed shape, no reflection of input, and
nothing stored in the database.
"""
import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

from app.utils.limiter import limiter

logger = logging.getLogger("easyserve.client")

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

#: Long enough for a real stack, short enough that nobody can post a novel.
_MAX_STACK = 4000
_MAX_FIELD = 500


class ClientError(BaseModel):
    message: str = Field(max_length=_MAX_FIELD)
    #: Where in the app it happened. The pathname only — never the query string,
    #: because a session token lives in the bill URL and this would copy it into
    #: the logs.
    path: str | None = Field(default=None, max_length=_MAX_FIELD)
    stack: str | None = Field(default=None, max_length=_MAX_STACK)
    #: "render" | "window" | "promise" — which hook caught it.
    kind: str | None = Field(default=None, max_length=40)
    user_agent: str | None = Field(default=None, max_length=_MAX_FIELD)
    #: Which build it came from, so a fixed error stops being chased.
    release: str | None = Field(default=None, max_length=80)

    @field_validator("path")
    @classmethod
    def _strip_query(cls, v: str | None) -> str | None:
        if not v:
            return None
        # Drop anything after ? or # — see the note on the field above.
        return v.split("?")[0].split("#")[0][:_MAX_FIELD]


@router.post("/client-error", status_code=202)
@limiter.limit("20/minute")
async def report_client_error(request: Request, req: ClientError):
    """Record a browser-side crash.

    Answers 202 whatever happens. A client that crashed once should not be made
    to handle an error from the endpoint it reports crashes to, and a failure
    here is never worth a second popup in front of a guest.
    """
    logger.error(
        "client error [%s] at %s: %s",
        req.kind or "unknown",
        req.path or "unknown",
        req.message,
        extra={
            "client_stack": req.stack,
            "client_ua": req.user_agent,
            "client_release": req.release,
        },
    )

    try:
        import sentry_sdk

        if sentry_sdk.Hub.current.client is not None:
            with sentry_sdk.push_scope() as scope:
                scope.set_tag("source", "browser")
                scope.set_tag("client_kind", req.kind or "unknown")
                scope.set_context(
                    "browser",
                    {
                        "path": req.path,
                        "user_agent": req.user_agent,
                        "release": req.release,
                    },
                )
                # Captured as a message with the stack attached rather than a
                # synthesised exception: a browser stack is not a Python
                # traceback, and pretending otherwise produces useless grouping.
                scope.set_extra("stack", req.stack)
                sentry_sdk.capture_message(
                    f"[browser] {req.message}", level="error"
                )
    except Exception:
        # Sentry absent or misconfigured. The log line above already landed.
        pass

    return {"received": True}

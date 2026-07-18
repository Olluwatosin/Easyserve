"""Append-only audit trail for sensitive actions.

Owners lose more revenue to quiet voids and price edits than to walkouts —
every money-touching mutation gets a row here. Callers own the commit so the
log lands in the same transaction as the change it describes.
"""
import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


def log_action(
    db: AsyncSession,
    venue_id: str,
    actor_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            id=str(uuid.uuid4()),
            venue_id=venue_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=json.dumps(details) if details is not None else None,
        )
    )

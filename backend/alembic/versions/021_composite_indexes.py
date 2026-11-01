"""Composite indexes for the pairs every screen filters on.

Twelve single-column indexes existed and no composite ones, but almost nothing
in this product queries one column at a time. Every owner screen, every report
and every export filters a venue *and* a date together, and Postgres can use
only one index per scan — so it took the venue index and then filtered the rest
of the venue's history in memory.

Invisible at demo volume. A venue doing three hundred orders a night passes a
hundred thousand rows inside a year, and the screen that slows first is the
owner's Tonight page: the one read most often, during service, on a phone.

Created CONCURRENTLY so this can be applied to a venue that is trading. That
requires running outside a transaction, hence the autocommit block — without it
Alembic wraps the migration and Postgres refuses the CONCURRENTLY.

Revision ID: 021
Revises: 020
"""
from typing import Sequence, Union

from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: (name, table, columns). Each pair is one the application actually filters on
#: together — not speculative coverage.
_INDEXES = [
    # Tonight, the dashboard, every order list and the orders export.
    ("ix_orders_venue_business_date", "orders", "venue_id, business_date"),
    # The floor screens: open orders for a venue, read on every refresh.
    ("ix_orders_venue_status", "orders", "venue_id, status"),
    # Takings, the shift report, the payments export.
    ("ix_payments_venue_business_date", "payments", "venue_id, business_date"),
    # Stock movement history and the variance report.
    ("ix_stock_movements_venue_created", "stock_movements", "venue_id, created_at"),
    # The activity page, which reads a venue's trail newest-first.
    ("ix_audit_logs_venue_created", "audit_logs", "venue_id, created_at"),
    # The timesheet: a venue's shifts over a range.
    ("ix_shifts_venue_started", "shifts", "venue_id, started_at"),
    # Resolving a guest's bill, and the session lookups behind it.
    ("ix_orders_session_venue", "orders", "session_token, venue_id"),
]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name, table, cols in _INDEXES:
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({cols})"
            )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name, _table, _cols in reversed(_INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")

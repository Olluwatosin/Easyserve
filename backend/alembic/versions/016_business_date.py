"""Record which night each order and payment belongs to, at the time it happens.

A nightlife day runs 6am to 6am, so a round poured at 1am on Saturday belongs to
Friday night. Until now that was worked out *at query time* from a constant, and
no row remembered anything.

That is fine only while the constant never moves. It is about to: a venue will
be able to set its own rollover once it learns its real closing hour, and a new
lounge cannot possibly know that before it opens. The moment that setting
changes under query-time arithmetic, **every past report silently changes** —
last month's Saturday total is a different number than when it was read, paid
staff against, or settled with a supplier.

Stamping the night when the row is written makes history immutable. The setting
then governs only what happens after it, which is the only thing a setting
should ever govern.

The backfill applies the rule as it stands today, which is correct precisely
because it has not moved yet — this is the last moment that backfill is exact
rather than a guess.

Revision ID: 016
Revises: 015
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Local wall-clock, shifted back past the rollover, is the night it belongs to:
# 05:00 becomes 23:00 the previous day; 06:00 stays put.
_RULE = "((created_at AT TIME ZONE 'Africa/Lagos') - INTERVAL '6 hours')::date"


def upgrade() -> None:
    for table in ("orders", "payments"):
        op.add_column(table, sa.Column("business_date", sa.Date(), nullable=True))
        op.execute(f"UPDATE {table} SET business_date = {_RULE}")
        # Every existing row now has one, and the application sets it on insert,
        # so the column can be trusted rather than defended against everywhere
        # it is read.
        op.alter_column(table, "business_date", nullable=False)
        # Every "tonight" and "this week" query filters on this.
        op.create_index(
            f"ix_{table}_venue_business_date",
            table,
            ["venue_id", "business_date"],
        )


def downgrade() -> None:
    for table in ("orders", "payments"):
        op.drop_index(f"ix_{table}_venue_business_date", table_name=table)
        op.drop_column(table, "business_date")

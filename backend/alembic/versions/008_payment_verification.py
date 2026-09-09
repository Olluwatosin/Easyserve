"""payment verification + transfer reference

Revision ID: 008
Revises: 007
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("verification", sa.String(20), nullable=False, server_default="manual"),
    )
    op.add_column("payments", sa.Column("transfer_reference", sa.String(120), nullable=True))

    # Backfill existing rows honestly rather than flattering them:
    #   provider-backed rows really were webhook-confirmed,
    #   cash really was confirmed by hand,
    #   everything else was asserted by a cashier with nothing checking it.
    op.execute("UPDATE payments SET verification = 'gateway' WHERE provider IS NOT NULL")
    op.execute("UPDATE payments SET verification = 'cash' WHERE method = 'cash' AND provider IS NULL")

    op.create_index("ix_payments_verification", "payments", ["venue_id", "verification"])


def downgrade() -> None:
    op.drop_index("ix_payments_verification", table_name="payments")
    op.drop_column("payments", "transfer_reference")
    op.drop_column("payments", "verification")

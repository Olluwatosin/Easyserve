"""client_request_id for offline order replay

Revision ID: 010
Revises: 009
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("client_request_id", sa.String(64), nullable=True))
    # Unique so a duplicate replay is refused by the database even if two
    # requests race past the application-level check.
    op.create_index(
        "ix_orders_client_request_id", "orders", ["client_request_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_orders_client_request_id", table_name="orders")
    op.drop_column("orders", "client_request_id")

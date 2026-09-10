"""guest-facing prep times and item timing

Revision ID: 014
Revises: 013
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("venues", sa.Column("drink_prep_minutes", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("venues", sa.Column("food_prep_minutes", sa.Integer(), nullable=False, server_default="15"))
    op.add_column("order_items", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "ready_at")
    op.drop_column("order_items", "accepted_at")
    op.drop_column("venues", "food_prep_minutes")
    op.drop_column("venues", "drink_prep_minutes")

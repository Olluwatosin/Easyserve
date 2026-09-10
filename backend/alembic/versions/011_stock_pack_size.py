"""pack size for items counted by the case

Revision ID: 011
Revises: 010
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Default 1 keeps every existing item counted individually, which is what
    # spirits want; only case goods need changing.
    op.add_column(
        "menu_items",
        sa.Column("stock_pack_size", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("menu_items", "stock_pack_size")

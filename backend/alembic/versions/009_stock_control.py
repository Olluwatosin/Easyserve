"""stock quantity + movement ledger

Revision ID: 009
Revises: 008
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL on purpose: existing items are untracked until an owner counts them.
    # Defaulting to 0 would make every bottle look sold out on day one.
    op.add_column("menu_items", sa.Column("stock_quantity", sa.Integer(), nullable=True))

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("venue_id", sa.String(36), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("menu_item_id", sa.String(36), sa.ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stock_movements_venue_id", "stock_movements", ["venue_id"])
    op.create_index("ix_stock_movements_menu_item_id", "stock_movements", ["menu_item_id"])
    op.create_index("ix_stock_movements_created_at", "stock_movements", ["created_at"])
    # The variance query filters by venue + reason + time on every load.
    op.create_index(
        "ix_stock_movements_variance", "stock_movements", ["venue_id", "reason", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_stock_movements_variance", table_name="stock_movements")
    op.drop_index("ix_stock_movements_created_at", table_name="stock_movements")
    op.drop_index("ix_stock_movements_menu_item_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_venue_id", table_name="stock_movements")
    op.drop_table("stock_movements")
    op.drop_column("menu_items", "stock_quantity")

"""What each item costs the venue, not just what it sells for.

Until now a menu item carried a selling price and nothing else, which has three
consequences that all look like separate problems and are one:

  * Stock on hand was valued at *selling* price, overstating what is actually
    sitting on the shelf by the whole margin.
  * A variance could only ever say "you are six bottles short", never
    "you are ₦84,000 short" — and the naira figure is the one that gets
    somebody's attention.
  * Nothing in the product could say which items actually make money, only
    which ones sell.

Nullable on purpose: plenty of lines have no meaningful unit cost — a cocktail
mixed to order, a cover charge — and guessing one would quietly corrupt every
margin figure that followed. Null means "not known", and the reports say so
rather than treating it as zero.

Revision ID: 015
Revises: 014
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "menu_items",
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("menu_items", "unit_cost")

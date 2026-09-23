"""How much of a thing the venue wants on the shelf.

There was one number, `stock_threshold`, doing the job of two. It answered "warn
me" and was silently expected to also answer "how many should I buy" — which it
cannot, because a reorder point and a target level are different facts. A bar
might reorder Hennessy at 4 bottles and want 12 on the shelf; knowing only the 4
tells you to act and not what to do.

With both, the order list is arithmetic a person can check: you want 12, you
have 3, buy 9.

Nullable, because a target is a judgement the venue has to make per line and
most will not have made it on day one. Null means "no target set", and the
reorder list says so instead of inventing a quantity — an invented order
quantity is money spent on a guess the system made.

Revision ID: 017
Revises: 016
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("menu_items", sa.Column("stock_par", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("menu_items", "stock_par")

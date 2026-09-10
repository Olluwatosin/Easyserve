"""venue setting: may attendants take payment

Revision ID: 013
Revises: 012
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # False keeps every existing venue exactly as it behaves today. Widening who
    # can handle money must be an explicit choice, never a silent upgrade.
    op.add_column(
        "venues",
        sa.Column(
            "attendants_take_payment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("venues", "attendants_take_payment")

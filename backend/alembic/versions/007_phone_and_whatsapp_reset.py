"""user phone + whatsapp reset channel

Revision ID: 007
Revises: 006
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(20), nullable=True))
    op.create_index("ix_users_phone", "users", ["phone"])

    op.add_column(
        "password_reset_tokens",
        sa.Column("channel", sa.String(20), nullable=False, server_default="email"),
    )
    op.add_column(
        "password_reset_tokens",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("password_reset_tokens", "attempts")
    op.drop_column("password_reset_tokens", "channel")
    op.drop_index("ix_users_phone", table_name="users")
    op.drop_column("users", "phone")

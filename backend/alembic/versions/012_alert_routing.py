"""alert assignment + escalation

Revision ID: 012
Revises: 011
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "alerts",
        sa.Column("assigned_to", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "alerts",
        sa.Column("escalation_level", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("alerts", sa.Column("session_token", sa.String(255), nullable=True))
    op.create_index("ix_alerts_session_token", "alerts", ["session_token"])
    # The sweeper reads pending alerts by age on a short interval.
    op.create_index("ix_alerts_pending", "alerts", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_alerts_pending", table_name="alerts")
    op.drop_index("ix_alerts_session_token", table_name="alerts")
    op.drop_column("alerts", "session_token")
    op.drop_column("alerts", "escalation_level")
    op.drop_column("alerts", "assigned_to")

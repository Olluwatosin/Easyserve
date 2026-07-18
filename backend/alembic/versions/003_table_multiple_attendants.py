"""table multiple attendants

Revision ID: 003
Revises: 002
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Store extra attendant IDs as a comma-separated text field.
    # assigned_attendant_id (the primary) stays for FK/relationship use.
    op.add_column(
        "tables",
        sa.Column(
            "extra_attendant_ids",
            sa.Text,
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("tables", "extra_attendant_ids")

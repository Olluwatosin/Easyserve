"""Shifts, and the code that proves somebody was at the venue to start one.

Attendance here feeds payroll, and that changes the requirements. A PIN sign-in
is not evidence of presence — staff can sign in from home — so starting a shift
also needs the venue's clock-in code, which is displayed behind the bar and on
the printed shift sheet. Not unspoofable; a photograph of the sheet defeats it.
But it moves clocking in from trivial to deliberate, which is the realistic bar
for a lounge, and it is honest about being that rather than pretending to be
biometrics.

Revision ID: 018
Revises: 017
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "venues",
        sa.Column("clock_in_code", sa.String(12), nullable=True),
    )

    op.create_table(
        "shifts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "venue_id",
            sa.String(36),
            sa.ForeignKey("venues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_by_reason", sa.String(20), nullable=True),
        sa.Column(
            "flagged_unclosed", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column(
            "corrected_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("corrected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_times", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_shifts_venue_id", "shifts", ["venue_id"])
    op.create_index("ix_shifts_user_id", "shifts", ["user_id"])
    # "Who is on right now" and "this person's open shift" are the two hot reads.
    op.create_index(
        "ix_shifts_open", "shifts", ["venue_id", "user_id", "ended_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_shifts_open", table_name="shifts")
    op.drop_index("ix_shifts_user_id", table_name="shifts")
    op.drop_index("ix_shifts_venue_id", table_name="shifts")
    op.drop_table("shifts")
    op.drop_column("venues", "clock_in_code")

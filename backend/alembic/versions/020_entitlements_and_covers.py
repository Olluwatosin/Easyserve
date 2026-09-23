"""Per-venue feature overrides, covers, and what made a night unusual.

Three small columns that exist for one reason each.

`venues.extra_features` lets a venue hold a capability its plan does not
include. The first venues are pilots running free and need the premium modules
without inventing a fake tier that has to be un-invented at the first invoice.
It is also how a module ships dark: merged and deployed, switched on for one
venue at a time.

`orders.covers` is how many people were actually at the table. Table capacity is
the furniture, not the party. Without covers there is no spend-per-head — the
number every operator in hospitality actually runs on — and no forecast worth
the name.

`venue_nights` records what made a night unusual: a live act, a public holiday,
rain, NEPA off until ten. Without it a model sees a huge Friday and a dead
Tuesday as noise and learns the wrong lesson from both.

The last two matter now rather than later because neither can be backfilled. A
night that goes unrecorded is gone.

Revision ID: 020
Revises: 019
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "venues",
        sa.Column("extra_features", sa.JSON(), nullable=True),
    )
    # Nullable on purpose: unknown is not zero. A round keyed in by an attendant
    # who never asked how many were sitting down must not report as a table of
    # none, which would drag every spend-per-head figure with it.
    op.add_column("orders", sa.Column("covers", sa.Integer(), nullable=True))

    op.create_table(
        "venue_nights",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "venue_id",
            sa.String(36),
            sa.ForeignKey("venues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        # A short tag the reports can group on — "live_music", "holiday",
        # "power_cut" — where free text cannot be counted.
        sa.Column("tag", sa.String(40), nullable=True),
        sa.Column(
            "recorded_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # One note per venue per night: a second is an edit, not another record.
    op.create_unique_constraint(
        "uq_venue_nights_venue_date", "venue_nights", ["venue_id", "business_date"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_venue_nights_venue_date", "venue_nights", type_="unique")
    op.drop_table("venue_nights")
    op.drop_column("orders", "covers")
    op.drop_column("venues", "extra_features")

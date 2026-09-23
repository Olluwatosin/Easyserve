"""A short code on the exit pass, for when the camera will not cooperate.

The pass already had a manual-entry box on the door screen and a token 150
characters long, which meant the fallback existed and could not be used. Nobody
types that at a door at 2am, so in practice the camera was the only route — and
the camera fails often: a cracked screen, a dead battery, glare off the door
light, a guest who cannot hold the phone still.

Six characters from an alphabet with no I, O, 0 or 1, because this is read off
one phone in the dark and typed into another.

Short codes are guessable in a way a 150-character token is not, and that is
acceptable here for reasons that are structural rather than hopeful: a pass is
single-use, dies within minutes of being issued, is scoped to one venue, and the
door screen limits attempts. A code worth guessing would have to be guessed
inside its own expiry window, and spending it opens a door somebody could have
walked through by paying.

Revision ID: 019
Revises: 018
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exit_passes", sa.Column("short_code", sa.String(12), nullable=True))
    # Looked up on every manual entry, and scoped by venue so two venues can
    # hold the same code at the same time without colliding.
    op.create_index(
        "ix_exit_passes_venue_short_code",
        "exit_passes",
        ["venue_id", "short_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_exit_passes_venue_short_code", table_name="exit_passes")
    op.drop_column("exit_passes", "short_code")

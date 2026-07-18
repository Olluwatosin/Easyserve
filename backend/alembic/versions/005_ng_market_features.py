"""Nigerian market features: charges, audit log, paystack, min spend, guest phone

Revision ID: 005
Revises: 004
Create Date: 2026-07-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Venue-level bill charges (percentages, e.g. 10.00 = 10%)
    op.add_column("venues", sa.Column("service_charge_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("venues", sa.Column("vat_pct", sa.Numeric(5, 2), nullable=False, server_default="0"))

    # VIP / bottle-service minimum spend per table
    op.add_column("tables", sa.Column("min_spend", sa.Numeric(12, 2), nullable=False, server_default="0"))

    # Guest phone (loyalty / repeat-guest recognition) + charge snapshots per order
    op.add_column("orders", sa.Column("customer_phone", sa.String(20), nullable=True))
    op.add_column("orders", sa.Column("service_charge", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("vat_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.create_index("ix_orders_customer_phone", "orders", ["customer_phone"])

    # Gateway payments: pending until webhook confirms
    op.add_column("payments", sa.Column("status", sa.String(20), nullable=False, server_default="confirmed"))
    op.add_column("payments", sa.Column("provider", sa.String(20), nullable=True))
    op.add_column("payments", sa.Column("provider_ref", sa.String(100), nullable=True))
    op.create_index("ix_payments_provider_ref", "payments", ["provider_ref"], unique=True)

    # Immutable audit trail (voids, price edits, payments, staff changes)
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("venue_id", sa.String(36), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_venue_created", "audit_logs", ["venue_id", "created_at"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_index("ix_payments_provider_ref", table_name="payments")
    op.drop_column("payments", "provider_ref")
    op.drop_column("payments", "provider")
    op.drop_column("payments", "status")
    op.drop_index("ix_orders_customer_phone", table_name="orders")
    op.drop_column("orders", "vat_amount")
    op.drop_column("orders", "service_charge")
    op.drop_column("orders", "customer_phone")
    op.drop_column("tables", "min_spend")
    op.drop_column("venues", "vat_pct")
    op.drop_column("venues", "service_charge_pct")

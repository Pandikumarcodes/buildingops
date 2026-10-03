"""Create telemetry-driven alerts.

Revision ID: 0003_alerts
Revises: 0002_telemetry_storage
Create Date: 2026-09-30
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_alerts"
down_revision = "0002_telemetry_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=False),
        sa.Column("alert_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=300), nullable=False),
        sa.Column("trigger_value", sa.Float(), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["zone_id"], ["zones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_alerts_active_zone_type",
        "alerts",
        ["zone_id", "alert_type"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )
    op.create_index("ix_alerts_status_triggered_at", "alerts", ["status", "triggered_at"])


def downgrade() -> None:
    op.drop_index("ix_alerts_status_triggered_at", table_name="alerts")
    op.drop_index("uq_alerts_active_zone_type", table_name="alerts")
    op.drop_table("alerts")

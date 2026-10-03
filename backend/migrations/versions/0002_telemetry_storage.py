"""Create telemetry storage.

Revision ID: 0002_telemetry_storage
Revises: 0001_building_hierarchy
Create Date: 2026-09-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_telemetry_storage"
down_revision = "0001_building_hierarchy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False),
        sa.Column("humidity", sa.Float(), nullable=False),
        sa.Column("co2_ppm", sa.Integer(), nullable=False),
        sa.Column("occupancy", sa.Integer(), nullable=False),
        sa.Column("hvac_status", sa.String(length=3), nullable=False),
        sa.Column("hvac_setpoint", sa.Float(), nullable=False),
        sa.Column("hvac_power_kw", sa.Float(), nullable=False),
        sa.Column("zone_power_kw", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["zone_id"], ["zones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_telemetry_zone_id_recorded_at", "telemetry", ["zone_id", "recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_telemetry_zone_id_recorded_at", table_name="telemetry")
    op.drop_table("telemetry")

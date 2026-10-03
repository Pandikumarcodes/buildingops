"""Create building hierarchy tables.

Revision ID: 0001_building_hierarchy
Revises:
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_building_hierarchy"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "buildings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_buildings_code"),
    )
    op.create_table(
        "floors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("building_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("floor_number", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("building_id", "floor_number", name="uq_floors_building_number"),
    )
    op.create_index("ix_floors_building_id", "floors", ["building_id"])
    op.create_table(
        "zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("floor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("floor_id", "code", name="uq_zones_floor_code"),
    )
    op.create_index("ix_zones_floor_id", "zones", ["floor_id"])
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("device_id", sa.String(length=100), nullable=False),
        sa.Column(
            "device_type",
            sa.Enum(
                "ENVIRONMENT_SENSOR",
                "OCCUPANCY_SENSOR",
                "ENERGY_METER",
                "HVAC_UNIT",
                name="device_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["zone_id"], ["zones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", name="uq_devices_device_id"),
    )
    op.create_index("ix_devices_zone_id", "devices", ["zone_id"])


def downgrade() -> None:
    op.drop_index("ix_devices_zone_id", table_name="devices")
    op.drop_table("devices")
    op.drop_index("ix_zones_floor_id", table_name="zones")
    op.drop_table("zones")
    op.drop_index("ix_floors_building_id", table_name="floors")
    op.drop_table("floors")
    op.drop_table("buildings")

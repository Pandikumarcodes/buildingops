"""Constrain persisted alert enum values.

Revision ID: 0004_alert_enum_constraints
Revises: 0003_alerts
Create Date: 2026-09-30
"""

from alembic import op

revision = "0004_alert_enum_constraints"
down_revision = "0003_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "alert_type",
        "alerts",
        "alert_type IN ('HIGH_CO2', 'HIGH_TEMPERATURE', 'HIGH_ZONE_POWER')",
    )
    op.create_check_constraint(
        "alert_severity",
        "alerts",
        "severity IN ('WARNING')",
    )
    op.create_check_constraint(
        "alert_status",
        "alerts",
        "status IN ('ACTIVE', 'RESOLVED')",
    )


def downgrade() -> None:
    op.drop_constraint("alert_status", "alerts", type_="check")
    op.drop_constraint("alert_severity", "alerts", type_="check")
    op.drop_constraint("alert_type", "alerts", type_="check")

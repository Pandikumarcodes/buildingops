"""Deterministic telemetry alert evaluation for the three M10 rules."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Alert, AlertSeverity, AlertStatus, AlertType, Zone
from app.telemetry import ZoneTelemetry


@dataclass(frozen=True, slots=True)
class AlertRule:
    alert_type: AlertType
    field: str
    trigger_at: float
    resolve_below: float
    message_template: str


ALERT_RULES: tuple[AlertRule, ...] = (
    AlertRule(AlertType.HIGH_CO2, "co2_ppm", 1200, 1000, "High CO₂ detected in {zone_name}."),
    AlertRule(
        AlertType.HIGH_TEMPERATURE,
        "temperature",
        28.0,
        27.0,
        "High temperature detected in {zone_name}.",
    ),
    AlertRule(
        AlertType.HIGH_ZONE_POWER,
        "zone_power_kw",
        10.0,
        9.0,
        "High power demand detected in {zone_name}.",
    ),
)


def evaluate_alerts(session: Session, zone: Zone, telemetry: ZoneTelemetry) -> None:
    """Create, retain, or resolve one alert occurrence for each fixed rule."""
    for rule in ALERT_RULES:
        value = float(getattr(telemetry, rule.field))
        active = session.scalar(
            select(Alert).where(
                Alert.zone_id == zone.id,
                Alert.alert_type == rule.alert_type,
                Alert.status == AlertStatus.ACTIVE,
            )
        )
        if active is None and value >= rule.trigger_at:
            session.add(
                Alert(
                    zone_id=zone.id,
                    alert_type=rule.alert_type,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.ACTIVE,
                    message=rule.message_template.format(zone_name=zone.name),
                    trigger_value=value,
                    triggered_at=telemetry.timestamp,
                )
            )
        elif active is not None and value < rule.resolve_below:
            active.status = AlertStatus.RESOLVED
            active.resolved_at = telemetry.timestamp

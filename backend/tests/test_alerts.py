from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.alert_service import evaluate_alerts
from app.models import Alert, AlertSeverity, AlertStatus, AlertType, Building, Floor, Zone
from app.telemetry import ZoneTelemetry


def create_zone(session: Session, code: str = "OPEN-OFFICE") -> Zone:
    zone = Zone(
        floor=Floor(
            building=Building(name=f"{code} Building", code=f"{code}-B"),
            name="Floor 1",
            floor_number=1,
        ),
        name=code.replace("-", " ").title(),
        code=code,
    )
    session.add(zone)
    session.commit()
    return zone


def sample(**values: float | int) -> ZoneTelemetry:
    defaults: dict[str, object] = {
        "zone_id": "OPEN-OFFICE",
        "temperature": 24.0,
        "humidity": 50.0,
        "co2_ppm": 700,
        "occupancy": 5,
        "hvac_status": "ON",
        "hvac_setpoint": 23.0,
        "hvac_power_kw": 2.0,
        "zone_power_kw": 4.0,
        "timestamp": datetime(2026, 9, 30, tzinfo=UTC),
    }
    defaults.update(values)
    return ZoneTelemetry.model_validate(defaults)


def evaluate(session: Session, zone: Zone, **values: float | int) -> list[Alert]:
    evaluate_alerts(session, zone, sample(**values))
    session.commit()
    return list(session.scalars(select(Alert).order_by(Alert.triggered_at)))


def test_alert_thresholds_hysteresis_and_recurrence(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        assert evaluate(session, zone, co2_ppm=1200)[0].alert_type == AlertType.HIGH_CO2
        active = evaluate(session, zone, co2_ppm=1100)
        assert len(active) == 1 and active[0].status == AlertStatus.ACTIVE
        resolved = evaluate(session, zone, co2_ppm=999)
        assert resolved[0].status == AlertStatus.RESOLVED
        recurring = evaluate(session, zone, co2_ppm=1250)
        assert len(recurring) == 2 and recurring[-1].status == AlertStatus.ACTIVE


@pytest.mark.parametrize(
    ("values", "alert_type", "resolve_values"),
    [
        ({"temperature": 28.0}, AlertType.HIGH_TEMPERATURE, {"temperature": 26.9}),
        ({"zone_power_kw": 10.0}, AlertType.HIGH_ZONE_POWER, {"zone_power_kw": 8.9}),
    ],
)
def test_temperature_and_power_thresholds(
    db_session_factory: sessionmaker[Session],
    values: dict[str, float],
    alert_type: AlertType,
    resolve_values: dict[str, float],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        alerts = evaluate(session, zone, **values)
        assert alerts[0].alert_type == alert_type
        assert evaluate(session, zone, **resolve_values)[0].status == AlertStatus.RESOLVED


def test_repeated_readings_do_not_duplicate_and_types_and_zones_can_coexist(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        first = create_zone(session, "OPEN-OFFICE")
        second = create_zone(session, "SERVER-ROOM")
        evaluate(session, first, co2_ppm=1300, temperature=29.0)
        evaluate(session, first, co2_ppm=1400, temperature=29.0)
        evaluate(session, second, co2_ppm=1300)
        active = list(session.scalars(select(Alert).where(Alert.status == AlertStatus.ACTIVE)))
        assert len(active) == 3
        assert {alert.alert_type for alert in active if alert.zone_id == first.id} == {
            AlertType.HIGH_CO2,
            AlertType.HIGH_TEMPERATURE,
        }


def test_active_alert_database_uniqueness(db_session_factory: sessionmaker[Session]) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        for _ in range(2):
            session.add(
                Alert(
                    zone_id=zone.id,
                    alert_type=AlertType.HIGH_CO2,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.ACTIVE,
                    message="test",
                    trigger_value=1200,
                    triggered_at=datetime(2026, 9, 30, tzinfo=UTC),
                )
            )
        with pytest.raises(IntegrityError):
            session.commit()


def test_alerts_api_filters_orders_and_includes_zone_context(
    client: TestClient, db_session_factory: sessionmaker[Session]
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        earlier = datetime(2026, 9, 30, tzinfo=UTC)
        session.add_all(
            [
                Alert(
                    zone_id=zone.id,
                    alert_type=AlertType.HIGH_CO2,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.RESOLVED,
                    message="resolved",
                    trigger_value=1200,
                    triggered_at=earlier,
                    resolved_at=earlier + timedelta(minutes=1),
                ),
                Alert(
                    zone_id=zone.id,
                    alert_type=AlertType.HIGH_TEMPERATURE,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.ACTIVE,
                    message="active",
                    trigger_value=28,
                    triggered_at=earlier + timedelta(minutes=2),
                ),
            ]
        )
        session.commit()
    response = client.get("/alerts?status=ACTIVE")
    assert response.status_code == 200
    assert response.json()[0]["message"] == "active"
    assert response.json()[0]["zone_name"] == "Open Office"
    assert client.get("/alerts?status=RESOLVED").json()[0]["message"] == "resolved"
    assert client.get("/alerts?status=ACTIVE").json()[0]["severity"] == "WARNING"
    assert len(client.get("/alerts?limit=1").json()) == 1


def test_alerts_api_returns_empty_list(client: TestClient) -> None:
    assert client.get("/alerts").json() == []

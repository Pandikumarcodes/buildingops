from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.models import Building, Floor, Telemetry, Zone
from app.telemetry import ZoneTelemetry
from app.telemetry_persistence import TelemetryPersistenceWorker


def telemetry_for(code: str, recorded_at: datetime) -> ZoneTelemetry:
    return ZoneTelemetry(
        zone_id=code,
        temperature=24.5,
        humidity=50.0,
        co2_ppm=700,
        occupancy=4,
        hvac_status="ON",
        hvac_setpoint=23.0,
        hvac_power_kw=1.2,
        zone_power_kw=2.0,
        timestamp=recorded_at,
    )


def create_zone(session: Session, code: str) -> Zone:
    building = Building(name=f"{code} Building", code=f"{code}-BUILDING")
    floor = Floor(building=building, name="Ground", floor_number=1)
    zone = Zone(floor=floor, name=code.title(), code=code)
    session.add(zone)
    session.commit()
    return zone


def test_worker_persists_readings_with_zone_uuid_and_source_timestamp(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session, "RECEPTION")
        zone_id = zone.id
    recorded_at = datetime(2026, 9, 29, 10, 0, tzinfo=UTC)
    worker = TelemetryPersistenceWorker(db_session_factory, maxsize=2)
    worker.start()
    assert worker.submit(telemetry_for("RECEPTION", recorded_at))
    assert worker.submit(telemetry_for("RECEPTION", recorded_at + timedelta(minutes=1)))
    worker.stop()

    with db_session_factory() as session:
        readings = session.scalars(select(Telemetry).order_by(Telemetry.recorded_at)).all()
    assert len(readings) == 2
    assert {reading.zone_id for reading in readings} == {zone_id}
    assert readings[0].recorded_at.replace(tzinfo=UTC) == recorded_at


def test_unknown_zone_is_not_persisted(db_session_factory: sessionmaker[Session]) -> None:
    worker = TelemetryPersistenceWorker(db_session_factory)
    worker.start()
    assert worker.submit(telemetry_for("UNKNOWN", datetime(2026, 9, 29, tzinfo=UTC)))
    worker.stop()

    with db_session_factory() as session:
        assert session.scalars(select(Telemetry)).all() == []


def test_database_failure_does_not_stop_later_persistence(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        create_zone(session, "RECEPTION")
    failed = False

    def fail_first_commit(_session: Session) -> None:
        nonlocal failed
        if not failed:
            failed = True
            raise SQLAlchemyError("simulated database failure")

    event.listen(db_session_factory.class_, "before_commit", fail_first_commit)
    worker = TelemetryPersistenceWorker(db_session_factory)
    worker.start()
    worker.submit(telemetry_for("RECEPTION", datetime(2026, 9, 29, tzinfo=UTC)))
    worker.submit(telemetry_for("RECEPTION", datetime(2026, 9, 29, 1, tzinfo=UTC)))
    worker.stop()
    event.remove(db_session_factory.class_, "before_commit", fail_first_commit)

    with db_session_factory() as session:
        readings = session.scalars(select(Telemetry)).all()
    assert len(readings) == 1


def test_queue_full_drops_without_blocking(db_session_factory: sessionmaker[Session]) -> None:
    worker = TelemetryPersistenceWorker(db_session_factory, maxsize=1)
    assert worker.submit(telemetry_for("RECEPTION", datetime(2026, 9, 29, tzinfo=UTC)))
    assert not worker.submit(telemetry_for("RECEPTION", datetime(2026, 9, 29, 1, tzinfo=UTC)))


def test_historical_telemetry_api_filters_orders_and_limits(
    client: TestClient, db_session_factory: sessionmaker[Session]
) -> None:
    with db_session_factory() as session:
        reception = create_zone(session, "RECEPTION")
        other = create_zone(session, "SERVER-ROOM")
        older = datetime(2026, 9, 29, 10, tzinfo=UTC)
        session.add_all(
            [
                Telemetry(
                    zone_id=reception.id,
                    temperature=22,
                    humidity=45,
                    co2_ppm=500,
                    occupancy=1,
                    hvac_status="ON",
                    hvac_setpoint=23,
                    hvac_power_kw=1,
                    zone_power_kw=2,
                    recorded_at=older,
                ),
                Telemetry(
                    zone_id=reception.id,
                    temperature=24,
                    humidity=50,
                    co2_ppm=700,
                    occupancy=2,
                    hvac_status="ON",
                    hvac_setpoint=23,
                    hvac_power_kw=1,
                    zone_power_kw=2,
                    recorded_at=older + timedelta(minutes=1),
                ),
                Telemetry(
                    zone_id=other.id,
                    temperature=25,
                    humidity=50,
                    co2_ppm=750,
                    occupancy=3,
                    hvac_status="ON",
                    hvac_setpoint=23,
                    hvac_power_kw=1,
                    zone_power_kw=2,
                    recorded_at=older + timedelta(minutes=2),
                ),
            ]
        )
        session.commit()

    response = client.get(f"/zones/{reception.id}/telemetry?limit=1")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["temperature"] == 24
    assert response.json()[0]["zone_id"] == str(reception.id)
    assert client.get(f"/zones/{reception.id}/telemetry?limit=0").status_code == 422
    assert client.get("/zones/00000000-0000-0000-0000-000000000000/telemetry").status_code == 404


def test_historical_telemetry_empty_zone_returns_empty_list(
    client: TestClient, db_session_factory: sessionmaker[Session]
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session, "CONFERENCE-ROOM")
    response = client.get(f"/zones/{zone.id}/telemetry")
    assert response.status_code == 200
    assert response.json() == []

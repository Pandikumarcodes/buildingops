"""Verify real Gemini function calling with bounded synthetic BuildingOps data."""

from datetime import UTC, datetime, timedelta
from sys import exit

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.ai.gemini import answer_with_gemini
from app.core.config import get_settings
from app.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    AlertType,
    Base,
    Building,
    Floor,
    Telemetry,
    Zone,
)


def reading(zone: Zone, co2_ppm: int, recorded_at: datetime) -> Telemetry:
    return Telemetry(
        zone_id=zone.id,
        temperature=24.5,
        humidity=50.0,
        co2_ppm=co2_ppm,
        occupancy=4,
        hvac_status="ON",
        hvac_setpoint=23.0,
        hvac_power_kw=1.2,
        zone_power_kw=2.0,
        recorded_at=recorded_at,
    )


def main() -> None:
    settings = get_settings()
    if settings.gemini_api_key is None or not settings.gemini_api_key.get_secret_value().strip():
        print("Gemini verification skipped: GEMINI_API_KEY is empty in the root .env.")
        exit(1)

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as session:
        floor = Floor(
            building=Building(name="Synthetic Verification Building", code="VERIFY"),
            name="Ground Floor",
            floor_number=1,
        )
        open_office = Zone(floor=floor, name="Open Office", code="OPEN-OFFICE")
        server_room = Zone(floor=floor, name="Server Room", code="SERVER-ROOM")
        session.add_all([open_office, server_room])
        session.flush()
        session.add_all(
            [
                reading(open_office, 700, now),
                reading(server_room, 950, now),
                reading(server_room, 900, now - timedelta(minutes=15)),
                Alert(
                    zone_id=open_office.id,
                    alert_type=AlertType.HIGH_CO2,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.ACTIVE,
                    message="Synthetic verification alert",
                    trigger_value=1300,
                    triggered_at=now,
                ),
            ]
        )
        session.commit()

    checks = [
        (
            "Which zone has the highest CO2? Include the value, unit, timestamp, and say the "
            "telemetry is simulated.",
            "get_current_building_state",
            ("server room", "950"),
        ),
        ("Which zones have active alerts?", "get_active_alerts", ("open office",)),
        (
            "Summarize recent conditions in Server Room.",
            "get_zone_history",
            ("server room",),
        ),
    ]

    try:
        for question, expected_tool, expected_text in checks:
            result = answer_with_gemini(question, settings, factory)
            answer = result.answer.lower()
            if not result.grounded or expected_tool not in result.sources:
                raise RuntimeError(f"response did not use {expected_tool}")
            if any(value not in answer for value in expected_text):
                raise RuntimeError(f"response from {expected_tool} did not match fixture data")
            print(f"Gemini verification passed with {result.model} and {expected_tool}.")
    except Exception as exc:
        status_code = getattr(exc, "code", None)
        print(f"Gemini verification failed ({type(exc).__name__}, status={status_code}).")
        exit(1)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()

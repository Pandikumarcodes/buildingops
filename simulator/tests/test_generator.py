"""Focused checks for the deterministic, local telemetry simulator."""

from dataclasses import replace
from datetime import UTC, datetime

from src.config import ZONE_CONFIGS
from src.generator import TelemetryGenerator

FIXED_TIME = datetime(2026, 9, 28, 12, 30, tzinfo=UTC)
EXPECTED_ZONE_IDS = {
    "RECEPTION",
    "OPEN-OFFICE",
    "CONFERENCE-ROOM",
    "ENGINEERING-OFFICE",
    "SERVER-ROOM",
}


def test_cycle_generates_events_for_exactly_the_five_seeded_zones() -> None:
    events = TelemetryGenerator(seed=1).next_cycle(FIXED_TIME)
    assert {event.zone_id for event in events} == EXPECTED_ZONE_IDS
    assert len(events) == 5


def test_measurements_stay_within_simulator_guardrails() -> None:
    generator = TelemetryGenerator(seed=22)
    events = [event for _ in range(300) for event in generator.next_cycle(FIXED_TIME)]
    for event in events:
        assert 20.0 <= event.temperature <= 30.0
        assert 35.0 <= event.humidity <= 70.0
        assert 400 <= event.co2_ppm <= 1600
        assert event.occupancy >= 0
        assert event.hvac_setpoint in (22.0, 23.0)
        assert event.hvac_power_kw >= 0
        assert event.zone_power_kw >= 0
        if event.hvac_status == "ON":
            assert event.hvac_power_kw > 0
        else:
            assert event.hvac_power_kw == 0


def test_server_room_remains_empty_and_hvac_stays_on() -> None:
    generator = TelemetryGenerator(seed=5)
    for _ in range(100):
        server_room = next(
            event for event in generator.next_cycle(FIXED_TIME) if event.zone_id == "SERVER-ROOM"
        )
        assert server_room.occupancy == 0
        assert server_room.hvac_status == "ON"
        assert server_room.hvac_power_kw > 0


def test_same_seed_and_clock_produce_reproducible_cycles() -> None:
    first = TelemetryGenerator(seed=91)
    second = TelemetryGenerator(seed=91)
    for _ in range(10):
        assert first.next_cycle(FIXED_TIME) == second.next_cycle(FIXED_TIME)


def test_successive_values_change_gradually() -> None:
    generator = TelemetryGenerator(seed=3)
    previous = {event.zone_id: event for event in generator.next_cycle(FIXED_TIME)}
    for _ in range(50):
        current = {event.zone_id: event for event in generator.next_cycle(FIXED_TIME)}
        for zone_id, event in current.items():
            prior = previous[zone_id]
            assert abs(event.temperature - prior.temperature) <= 0.4
            assert abs(event.humidity - prior.humidity) <= 2.0
            assert abs(event.co2_ppm - prior.co2_ppm) <= 75
            hvac_power_change = abs(event.hvac_power_kw - prior.hvac_power_kw)
            assert hvac_power_change <= 0.2 or event.hvac_status != prior.hvac_status
            occupancy_change = abs(event.occupancy - prior.occupancy)
            comparable_operating_state = (
                event.hvac_status == prior.hvac_status and occupancy_change <= 2
            )
            if comparable_operating_state:
                equipment_power_change_limit = 0.15
                occupancy_power_change_limit = occupancy_change * 0.06
                rounding_allowance = 0.01
                assert abs(event.zone_power_kw - prior.zone_power_kw) <= (
                    hvac_power_change
                    + equipment_power_change_limit
                    + occupancy_power_change_limit
                    + rounding_allowance
                )
        previous = current


def test_timestamp_is_utc_iso_8601() -> None:
    event = TelemetryGenerator(seed=1).next_cycle(FIXED_TIME)[0]
    assert event.timestamp.tzinfo is UTC
    assert event.to_dict()["timestamp"] == "2026-09-28T12:30:00Z"


def test_device_mapping_matches_m2_seed_short_codes() -> None:
    mapping = {zone.zone_id: zone.devices for zone in ZONE_CONFIGS}
    assert mapping["RECEPTION"]["environment"] == "ENV-REC-01"
    assert mapping["OPEN-OFFICE"]["occupancy"] == "OCC-OPEN-01"
    assert mapping["CONFERENCE-ROOM"]["energy"] == "ENERGY-CONF-01"
    assert mapping["ENGINEERING-OFFICE"]["hvac"] == "HVAC-ENG-01"
    assert mapping["SERVER-ROOM"]["environment"] == "ENV-SERVER-01"


def test_hvac_off_has_zero_hvac_power() -> None:
    reception = replace(ZONE_CONFIGS[0], hvac_change_probability=1.0)
    generator = TelemetryGenerator(seed=9, zones=(reception,))
    event = generator.next_cycle(FIXED_TIME)[0]
    assert event.hvac_status == "OFF"
    assert event.hvac_power_kw == 0

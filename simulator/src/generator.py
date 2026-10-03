"""Small stateful random-walk generator for the five seeded demo zones."""

import random
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from src.config import ZONE_CONFIGS, ZoneConfig
from src.models import HvacStatus, ZoneTelemetry


@dataclass(slots=True)
class _ZoneState:
    temperature: float
    humidity: float
    co2_ppm: int
    occupancy: int
    hvac_status: HvacStatus
    hvac_power_kw: float
    equipment_power_kw: float


class TelemetryGenerator:
    """Generate gradual telemetry changes; inject a seed and clock for tests."""

    def __init__(
        self,
        seed: int | None = None,
        *,
        zones: tuple[ZoneConfig, ...] = ZONE_CONFIGS,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._random = random.Random(seed)
        self._zones = zones
        self._clock = clock or (lambda: datetime.now(UTC))
        self._states = {
            zone.zone_id: _ZoneState(
                temperature=zone.initial_temperature,
                humidity=zone.initial_humidity,
                co2_ppm=zone.initial_co2_ppm,
                occupancy=zone.initial_occupancy,
                hvac_status="ON",
                hvac_power_kw=zone.hvac_power_kw,
                equipment_power_kw=zone.base_equipment_power_kw,
            )
            for zone in zones
        }

    def next_cycle(self, timestamp: datetime | None = None) -> tuple[ZoneTelemetry, ...]:
        """Advance every zone once and return one timestamped event per zone."""
        now = timestamp or self._clock()
        if now.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        now = now.astimezone(UTC)
        return tuple(self._advance(zone, now) for zone in self._zones)

    def _advance(self, zone: ZoneConfig, timestamp: datetime) -> ZoneTelemetry:
        state = self._states[zone.zone_id]
        randomizer = self._random

        if zone.server_room:
            state.occupancy = 0
        elif randomizer.random() < zone.occupancy_change_probability:
            state.occupancy = self._next_occupancy(zone, state.occupancy)

        if not zone.server_room and randomizer.random() < zone.hvac_change_probability:
            state.hvac_status = "OFF" if state.hvac_status == "ON" else "ON"

        state.temperature = self._bounded_walk(state.temperature, zone.temperature_step, 20.0, 30.0)
        state.humidity = self._bounded_walk(state.humidity, zone.humidity_step, 35.0, 70.0)
        state.co2_ppm = self._next_co2(zone, state)
        state.equipment_power_kw = self._bounded_walk(
            state.equipment_power_kw,
            0.15 if not zone.server_room else 0.05,
            max(0.1, zone.base_equipment_power_kw * 0.75),
            zone.base_equipment_power_kw * 1.25,
        )

        hvac_power = 0.0
        if state.hvac_status == "ON":
            state.hvac_power_kw = self._bounded_walk(
                state.hvac_power_kw,
                zone.hvac_power_kw * 0.03,
                zone.hvac_power_kw * 0.8,
                zone.hvac_power_kw * 1.2,
            )
            hvac_power = state.hvac_power_kw
        else:
            state.hvac_power_kw = 0.0

        occupancy_power = state.occupancy * (0.035 if zone.server_room else 0.06)
        zone_power = round(state.equipment_power_kw + hvac_power + occupancy_power, 2)
        return ZoneTelemetry(
            zone_id=zone.zone_id,
            temperature=round(state.temperature, 1),
            humidity=round(state.humidity, 1),
            co2_ppm=state.co2_ppm,
            occupancy=state.occupancy,
            hvac_status=state.hvac_status,
            hvac_setpoint=22.0 if zone.server_room else 23.0,
            hvac_power_kw=round(hvac_power, 2),
            zone_power_kw=zone_power,
            timestamp=timestamp,
        )

    def _next_occupancy(self, zone: ZoneConfig, current: int) -> int:
        if zone.zone_id == "CONFERENCE-ROOM":
            if current == 0:
                if self._random.random() < 0.55:
                    return self._random.randint(4, zone.max_occupancy)
                return 0
            if self._random.random() < 0.45:
                return 0
            return max(0, current + self._random.randint(-2, 2))

        low = 0 if not zone.normally_occupied else max(0, zone.max_occupancy // 4)
        high = max(low, zone.max_occupancy)
        return min(high, max(low, current + self._random.choice((-2, -1, 1, 2))))

    def _next_co2(self, zone: ZoneConfig, state: _ZoneState) -> int:
        if state.occupancy:
            occupancy_drift = min(18, state.occupancy // 3)
            delta = max(-5, self._random.randint(-5, zone.co2_step)) + occupancy_drift
        else:
            baseline = zone.initial_co2_ppm
            delta = -min(state.co2_ppm - baseline, self._random.randint(5, zone.co2_step))
        return min(1600, max(400, state.co2_ppm + delta))

    def _bounded_walk(self, value: float, step: float, lower: float, upper: float) -> float:
        return min(upper, max(lower, value + self._random.uniform(-step, step)))

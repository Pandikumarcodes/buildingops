"""Typed telemetry values emitted by the local simulator."""

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Literal

HvacStatus = Literal["ON", "OFF"]


@dataclass(frozen=True, slots=True)
class ZoneTelemetry:
    zone_id: str
    temperature: float
    humidity: float
    co2_ppm: int
    occupancy: int
    hvac_status: HvacStatus
    hvac_setpoint: float
    hvac_power_kw: float
    zone_power_kw: float
    timestamp: datetime

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-friendly mapping with a UTC ISO-8601 timestamp."""
        payload = asdict(self)
        timestamp = self.timestamp.astimezone(UTC).isoformat()
        payload["timestamp"] = timestamp.replace("+00:00", "Z")
        return payload

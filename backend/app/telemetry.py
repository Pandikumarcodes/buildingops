"""Validated, in-memory telemetry for the MQTT transport milestone."""

from datetime import datetime
from threading import Lock
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ZoneTelemetry(BaseModel):
    """The version-one telemetry payload emitted by the simulator."""

    model_config = ConfigDict(allow_inf_nan=False)

    zone_id: str = Field(min_length=1)
    temperature: float = Field(ge=20.0, le=30.0)
    humidity: float = Field(ge=35.0, le=70.0)
    co2_ppm: int = Field(ge=400, le=1600)
    occupancy: int = Field(ge=0)
    hvac_status: Literal["ON", "OFF"]
    hvac_setpoint: float = Field(ge=21.0, le=25.0)
    hvac_power_kw: float = Field(ge=0.0)
    zone_power_kw: float = Field(ge=0.0)
    timestamp: datetime

    @model_validator(mode="after")
    def validate_hvac_power_and_timestamp(self) -> "ZoneTelemetry":
        if self.timestamp.tzinfo is None or self.timestamp.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        if self.hvac_status == "OFF" and self.hvac_power_kw != 0:
            raise ValueError("hvac_power_kw must be zero when hvac_status is OFF")
        return self


class LatestTelemetryStore:
    """A deliberately small, process-local store populated by MQTT callbacks."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._readings: dict[str, ZoneTelemetry] = {}

    def put(self, telemetry: ZoneTelemetry) -> None:
        with self._lock:
            self._readings[telemetry.zone_id] = telemetry

    def all(self) -> dict[str, ZoneTelemetry]:
        with self._lock:
            return self._readings.copy()

    def clear(self) -> None:
        with self._lock:
            self._readings.clear()

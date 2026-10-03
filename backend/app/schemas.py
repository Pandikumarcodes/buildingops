"""Pydantic response schemas for hierarchy reads."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import AlertSeverity, AlertStatus, AlertType, DeviceType


class BuildingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    code: str
    created_at: datetime


class FloorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    building_id: uuid.UUID
    name: str
    floor_number: int
    created_at: datetime


class ZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    floor_id: uuid.UUID
    name: str
    code: str
    created_at: datetime


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    zone_id: uuid.UUID
    name: str
    device_id: str
    device_type: DeviceType
    created_at: datetime


class TelemetryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    zone_id: uuid.UUID
    temperature: float
    humidity: float
    co2_ppm: int
    occupancy: int
    hvac_status: str
    hvac_setpoint: float
    hvac_power_kw: float
    zone_power_kw: float
    recorded_at: datetime


class AlertResponse(BaseModel):
    id: uuid.UUID
    zone_id: uuid.UUID
    zone_name: str
    floor_name: str
    alert_type: AlertType
    severity: AlertSeverity
    status: AlertStatus
    message: str
    trigger_value: float
    triggered_at: datetime
    resolved_at: datetime | None

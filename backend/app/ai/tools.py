"""Allowlisted operational queries exposed to Gemini as read-only tools."""

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.models import Alert, AlertStatus, Floor, Telemetry, Zone

MAX_ZONES = 20
MAX_ALERTS = 50
MAX_HISTORY_ROWS = 30


class EmptyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ZoneHistoryArgs(BaseModel):
    zone: str = Field(min_length=1, max_length=100)
    hours: int = Field(default=24, ge=1, le=168)


TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "get_current_building_state",
        "description": "Get the latest persisted simulated telemetry for each building zone.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "get_active_alerts",
        "description": "Get up to 50 currently active backend alerts, newest first.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "get_zone_history",
        "description": "Get at most 30 recent readings for a named zone.",
        "parameters": {
            "type": "object",
            "properties": {
                "zone": {"type": "string", "description": "Zone name or code"},
                "hours": {
                    "type": "integer",
                    "description": "Lookback window, 1 to 168; defaults to 24",
                },
            },
            "required": ["zone"],
        },
    },
]


def _iso(value: datetime) -> str:
    return value.isoformat()


def get_current_building_state(factory: sessionmaker[Session]) -> dict[str, Any]:
    """Return bounded latest persisted observations; missing zones remain explicit."""
    with factory() as session:
        zones = session.execute(
            select(Zone, Floor.name)
            .join(Floor, Zone.floor_id == Floor.id)
            .order_by(Floor.floor_number, Zone.name)
            .limit(MAX_ZONES)
        ).all()
        state: list[dict[str, Any]] = []
        for zone, floor_name in zones:
            row = session.scalar(
                select(Telemetry)
                .where(Telemetry.zone_id == zone.id)
                .order_by(Telemetry.recorded_at.desc(), Telemetry.id.desc())
                .limit(1)
            )
            if row is None:
                state.append(
                    {
                        "zone": zone.name,
                        "zone_code": zone.code,
                        "floor": floor_name,
                        "data": "no persisted readings",
                    }
                )
                continue
            state.append(
                {
                    "zone": zone.name,
                    "zone_code": zone.code,
                    "floor": floor_name,
                    "recorded_at": _iso(row.recorded_at),
                    "temperature_c": row.temperature,
                    "humidity_percent": row.humidity,
                    "co2_ppm": row.co2_ppm,
                    "occupancy": row.occupancy,
                    "hvac_status": row.hvac_status,
                    "hvac_setpoint_c": row.hvac_setpoint,
                    "hvac_power_kw": row.hvac_power_kw,
                    "zone_power_kw": row.zone_power_kw,
                }
            )
        return {
            "data_kind": "simulated telemetry",
            "generated_at": datetime.now(UTC).isoformat(),
            "zones": state,
        }


def get_active_alerts(factory: sessionmaker[Session]) -> dict[str, Any]:
    """Return a fixed maximum of active alerts and their backend-defined context."""
    with factory() as session:
        rows = session.execute(
            select(Alert, Zone.name, Zone.code, Floor.name)
            .join(Zone, Alert.zone_id == Zone.id)
            .join(Floor, Zone.floor_id == Floor.id)
            .where(Alert.status == AlertStatus.ACTIVE)
            .order_by(Alert.triggered_at.desc(), Alert.id.desc())
            .limit(MAX_ALERTS)
        ).all()
        return {
            "alerts": [
                {
                    "zone": zone_name,
                    "zone_code": zone_code,
                    "floor": floor_name,
                    "type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "message": alert.message,
                    "observed_value": alert.trigger_value,
                    "triggered_at": _iso(alert.triggered_at),
                }
                for alert, zone_name, zone_code, floor_name in rows
            ],
            "data_kind": "active alerts from simulated telemetry",
        }


def get_zone_history(factory: sessionmaker[Session], arguments: dict[str, Any]) -> dict[str, Any]:
    """Validate a zone/window and return newest first, with a strict row cap."""
    try:
        request = ZoneHistoryArgs.model_validate(arguments)
    except ValidationError as exc:
        return {"error": "invalid arguments", "details": exc.errors(include_input=False)}
    with factory() as session:
        zones = list(
            session.scalars(
                select(Zone)
                .where(
                    (func.lower(Zone.name) == request.zone.lower())
                    | (func.lower(Zone.code) == request.zone.lower())
                )
                .order_by(Zone.name)
                .limit(2)
            )
        )
        if not zones:
            return {"error": "zone not found", "requested_zone": request.zone}
        if len(zones) > 1:
            return {"error": "zone is ambiguous", "requested_zone": request.zone}
        zone = zones[0]
        cutoff = datetime.now(UTC) - timedelta(hours=request.hours)
        readings = list(
            session.scalars(
                select(Telemetry)
                .where(Telemetry.zone_id == zone.id, Telemetry.recorded_at >= cutoff)
                .order_by(Telemetry.recorded_at.desc(), Telemetry.id.desc())
                .limit(MAX_HISTORY_ROWS)
            )
        )
        return {
            "data_kind": "simulated telemetry history",
            "zone": zone.name,
            "zone_code": zone.code,
            "floor": zone.floor.name,
            "window_hours": request.hours,
            "max_records": MAX_HISTORY_ROWS,
            "readings": [
                {
                    "recorded_at": _iso(row.recorded_at),
                    "temperature_c": row.temperature,
                    "humidity_percent": row.humidity,
                    "co2_ppm": row.co2_ppm,
                    "occupancy": row.occupancy,
                    "hvac_status": row.hvac_status,
                    "hvac_setpoint_c": row.hvac_setpoint,
                    "hvac_power_kw": row.hvac_power_kw,
                    "zone_power_kw": row.zone_power_kw,
                }
                for row in readings
            ],
        }


def execute_tool(
    name: str, arguments: dict[str, Any], factory: sessionmaker[Session]
) -> dict[str, Any]:
    """Dispatch only the three declared, read-only tools."""
    try:
        if name == "get_current_building_state":
            try:
                EmptyArgs.model_validate(arguments)
            except ValidationError:
                return {"error": "this tool accepts no arguments"}
            return get_current_building_state(factory)
        if name == "get_active_alerts":
            try:
                EmptyArgs.model_validate(arguments)
            except ValidationError:
                return {"error": "this tool accepts no arguments"}
            return get_active_alerts(factory)
        if name == "get_zone_history":
            return get_zone_history(factory, arguments)
        return {"error": "tool is not available"}
    except SQLAlchemyError:
        # This response is deliberately safe to return to Gemini as tool data.
        return {"error": "operational data unavailable"}
    except Exception:
        return {"error": "tool execution failed"}

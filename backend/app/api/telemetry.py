"""Read-only MQTT transport verification endpoint."""

from typing import cast

from fastapi import APIRouter, Request

from app.telemetry import LatestTelemetryStore, ZoneTelemetry

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


def _latest_store(request: Request) -> LatestTelemetryStore:
    return cast(LatestTelemetryStore, request.app.state.latest_telemetry_store)


@router.get("/latest", response_model=dict[str, ZoneTelemetry])
def latest_telemetry(request: Request) -> dict[str, ZoneTelemetry]:
    """Return the process-local latest valid reading for each zone."""
    return _latest_store(request).all()

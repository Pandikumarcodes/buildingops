"""Read APIs for zones and their devices."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models import Device, Telemetry, Zone
from app.schemas import DeviceResponse, TelemetryResponse, ZoneResponse

router = APIRouter(tags=["zones"])
SessionDep = Annotated[Session, Depends(get_db_session)]


@router.get("/zones/{zone_id}", response_model=ZoneResponse)
def get_zone(zone_id: uuid.UUID, session: SessionDep) -> Zone:
    zone = session.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return zone


@router.get("/zones/{zone_id}/devices", response_model=list[DeviceResponse])
def list_zone_devices(zone_id: uuid.UUID, session: SessionDep) -> list[Device]:
    if session.get(Zone, zone_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return list(
        session.scalars(select(Device).where(Device.zone_id == zone_id).order_by(Device.name))
    )


@router.get("/zones/{zone_id}/telemetry", response_model=list[TelemetryResponse])
def list_zone_telemetry(
    zone_id: uuid.UUID,
    session: SessionDep,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[Telemetry]:
    if session.get(Zone, zone_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return list(
        session.scalars(
            select(Telemetry)
            .where(Telemetry.zone_id == zone_id)
            .order_by(Telemetry.recorded_at.desc())
            .limit(limit)
        )
    )

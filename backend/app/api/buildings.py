"""Read APIs for buildings and their floors."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models import Building, Floor, Zone
from app.schemas import BuildingResponse, FloorResponse, ZoneResponse

router = APIRouter(tags=["buildings"])
SessionDep = Annotated[Session, Depends(get_db_session)]


@router.get("/buildings", response_model=list[BuildingResponse])
def list_buildings(session: SessionDep) -> list[Building]:
    return list(session.scalars(select(Building).order_by(Building.name, Building.id)))


@router.get("/buildings/{building_id}", response_model=BuildingResponse)
def get_building(building_id: uuid.UUID, session: SessionDep) -> Building:
    building = session.get(Building, building_id)
    if building is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")
    return building


@router.get("/buildings/{building_id}/floors", response_model=list[FloorResponse])
def list_building_floors(building_id: uuid.UUID, session: SessionDep) -> list[Floor]:
    if session.get(Building, building_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")
    return list(
        session.scalars(
            select(Floor).where(Floor.building_id == building_id).order_by(Floor.floor_number)
        )
    )


@router.get("/buildings/{building_id}/zones", response_model=list[ZoneResponse])
def list_building_zones(building_id: uuid.UUID, session: SessionDep) -> list[Zone]:
    """List zones for a building so clients can discover the hierarchy."""
    if session.get(Building, building_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")
    return list(
        session.scalars(
            select(Zone)
            .join(Floor)
            .where(Floor.building_id == building_id)
            .order_by(Floor.floor_number, Zone.name)
        )
    )

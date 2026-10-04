"""Read-only device identity by canonical database UUID."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models import Device
from app.schemas import DeviceResponse

router = APIRouter(tags=["devices"])
SessionDep = Annotated[Session, Depends(get_db_session)]


@router.get("/devices/{device_id}", response_model=DeviceResponse)
def get_device(device_id: uuid.UUID, session: SessionDep) -> Device:
    device = session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device

"""Read-only API for generated operational alerts."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models import Alert, AlertStatus, Floor, Zone
from app.schemas import AlertResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])
SessionDep = Annotated[Session, Depends(get_db_session)]


@router.get("", response_model=list[AlertResponse])
def list_alerts(
    session: SessionDep,
    status: Annotated[AlertStatus | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AlertResponse]:
    statement = (
        select(Alert, Zone.name, Floor.name).select_from(Alert).join(Alert.zone).join(Zone.floor)
    )
    if status is not None:
        statement = statement.where(Alert.status == status)
    rows = session.execute(
        statement.order_by(Alert.triggered_at.desc(), Alert.id.desc()).limit(limit)
    ).all()
    return [
        AlertResponse(
            id=alert.id,
            zone_id=alert.zone_id,
            zone_name=zone_name,
            floor_name=floor_name,
            alert_type=alert.alert_type,
            severity=alert.severity,
            status=alert.status,
            message=alert.message,
            trigger_value=alert.trigger_value,
            triggered_at=alert.triggered_at,
            resolved_at=alert.resolved_at,
        )
        for alert, zone_name, floor_name in rows
    ]

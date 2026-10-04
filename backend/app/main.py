import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.ai.api import router as ai_router
from app.api.alerts import router as alerts_router
from app.api.buildings import router as buildings_router
from app.api.devices import router as devices_router
from app.api.health import router as health_router
from app.api.telemetry import router as telemetry_router
from app.api.websocket import router as websocket_router
from app.api.zones import router as zones_router
from app.core.config import get_settings
from app.db import get_session_factory
from app.mqtt import MqttTelemetrySubscriber
from app.realtime import ConnectionManager, TelemetryBroadcaster
from app.telemetry import LatestTelemetryStore
from app.telemetry_persistence import TelemetryPersistenceWorker


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run the MQTT subscriber for the lifetime of this FastAPI process."""
    store = LatestTelemetryStore()
    manager = ConnectionManager()
    broadcaster = TelemetryBroadcaster(asyncio.get_running_loop(), manager)
    persistence_worker = TelemetryPersistenceWorker(get_session_factory())
    subscriber = MqttTelemetrySubscriber(
        get_settings(), store, persistence_worker, broadcaster.publish
    )
    app.state.latest_telemetry_store = store
    app.state.websocket_manager = manager
    app.state.telemetry_persistence_worker = persistence_worker
    persistence_worker.start()
    subscriber.start()
    try:
        yield
    finally:
        subscriber.stop()
        persistence_worker.stop()


app = FastAPI(title="BuildingOps API", version="0.1.0", lifespan=lifespan)
app.include_router(health_router)
app.include_router(ai_router)
app.include_router(alerts_router)
app.include_router(buildings_router)
app.include_router(zones_router)
app.include_router(devices_router)
app.include_router(telemetry_router)
app.include_router(websocket_router)

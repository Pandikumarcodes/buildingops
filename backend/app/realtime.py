"""Event-loop-owned WebSocket fan-out and the MQTT thread bridge."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from app.telemetry import LatestTelemetryStore, ZoneTelemetry

LOGGER = logging.getLogger(__name__)


class ConnectionManager:
    """Track WebSockets and send snapshots/events from the FastAPI event loop."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._broadcast_lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, store: LatestTelemetryStore) -> None:
        await websocket.accept()
        # Serialize initial snapshot with broadcasts so a live event cannot
        # overtake the snapshot for a newly connected client.
        async with self._broadcast_lock:
            self._connections.add(websocket)
            snapshot = {
                zone_code: telemetry.model_dump(mode="json")
                for zone_code, telemetry in store.all().items()
            }
            try:
                await websocket.send_json({"type": "snapshot", "data": snapshot})
            except Exception as error:
                self.disconnect(websocket)
                LOGGER.debug("Removed WebSocket client after snapshot send failure: %s", error)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, event: dict[str, Any]) -> None:
        """Send to all clients; remove failing sockets without stopping fan-out."""
        async with self._broadcast_lock:
            if not self._connections:
                return
            connections = tuple(self._connections)
            results = await asyncio.gather(
                *(websocket.send_json(event) for websocket in connections), return_exceptions=True
            )
            for websocket, result in zip(connections, results, strict=True):
                if isinstance(result, BaseException):
                    self.disconnect(websocket)
                    LOGGER.debug("Removed WebSocket client after send failure: %s", result)


class TelemetryBroadcaster:
    """Schedule MQTT-thread telemetry events onto the FastAPI asyncio loop."""

    def __init__(self, loop: asyncio.AbstractEventLoop, manager: ConnectionManager) -> None:
        self._loop = loop
        self._manager = manager

    def publish(self, telemetry: ZoneTelemetry) -> None:
        event = {"type": "telemetry", "data": telemetry.model_dump(mode="json")}
        # paho invokes this on its network thread; all WebSocket state stays on
        # the application loop. Do not wait for the scheduled coroutine here.
        try:
            future = asyncio.run_coroutine_threadsafe(self._manager.broadcast(event), self._loop)
        except RuntimeError:
            LOGGER.warning("Could not schedule telemetry broadcast: event loop is unavailable")
            return
        future.add_done_callback(self._log_broadcast_failure)

    @staticmethod
    def _log_broadcast_failure(future: Any) -> None:
        try:
            future.result()
        except Exception:
            LOGGER.exception("Unable to broadcast telemetry to WebSocket clients")

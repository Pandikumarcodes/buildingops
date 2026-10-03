"""Realtime telemetry WebSocket endpoint."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket) -> None:
    manager = websocket.app.state.websocket_manager
    store = websocket.app.state.latest_telemetry_store
    await manager.connect(websocket, store)
    try:
        # Receive only to detect a client disconnect; M6 defines no commands.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)

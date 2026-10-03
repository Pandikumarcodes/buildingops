import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from app.realtime import ConnectionManager, TelemetryBroadcaster
from app.telemetry import LatestTelemetryStore, ZoneTelemetry


class FakeWebSocket:
    def __init__(self, *, fail_send: bool = False) -> None:
        self.accepted = False
        self.messages: list[dict[str, Any]] = []
        self.fail_send = fail_send

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, data: dict[str, Any]) -> None:
        if self.fail_send:
            raise RuntimeError("socket closed")
        self.messages.append(data)


def sample() -> ZoneTelemetry:
    return ZoneTelemetry(
        zone_id="CONFERENCE-ROOM",
        temperature=24.8,
        humidity=58.0,
        co2_ppm=720,
        occupancy=12,
        hvac_status="ON",
        hvac_setpoint=23.0,
        hvac_power_kw=2.24,
        zone_power_kw=3.72,
        timestamp=datetime(2026, 9, 29, 12, 30, tzinfo=UTC),
    )


def test_connect_sends_an_empty_snapshot() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()

    asyncio.run(manager.connect(websocket, LatestTelemetryStore()))

    assert websocket.accepted
    assert websocket.messages == [{"type": "snapshot", "data": {}}]


def test_connect_snapshot_uses_zone_codes_and_current_readings() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()
    store = LatestTelemetryStore()
    store.put(sample())

    asyncio.run(manager.connect(websocket, store))

    assert websocket.messages[0]["type"] == "snapshot"
    assert list(websocket.messages[0]["data"]) == ["CONFERENCE-ROOM"]
    assert websocket.messages[0]["data"]["CONFERENCE-ROOM"]["timestamp"].endswith("Z")


def test_broadcast_reaches_multiple_clients_and_removes_broken_client() -> None:
    manager = ConnectionManager()
    healthy_one = FakeWebSocket()
    broken = FakeWebSocket()
    healthy_two = FakeWebSocket()

    async def run() -> None:
        store = LatestTelemetryStore()
        await manager.connect(healthy_one, store)
        await manager.connect(broken, store)
        broken.fail_send = True
        await manager.connect(healthy_two, store)
        event = {"type": "telemetry", "data": sample().model_dump(mode="json")}
        await manager.broadcast(event)

    asyncio.run(run())

    assert healthy_one.messages[-1]["type"] == "telemetry"
    assert healthy_two.messages[-1] == healthy_one.messages[-1]
    assert broken not in manager._connections


def test_disconnected_socket_is_removed() -> None:
    manager = ConnectionManager()
    websocket = FakeWebSocket()

    async def run() -> None:
        await manager.connect(websocket, LatestTelemetryStore())
        manager.disconnect(websocket)

    asyncio.run(run())

    assert websocket not in manager._connections


def test_mqtt_thread_bridge_schedules_broadcast_on_event_loop() -> None:
    async def run() -> None:
        manager = ConnectionManager()
        websocket = FakeWebSocket()
        await manager.connect(websocket, LatestTelemetryStore())
        event_received = asyncio.Event()
        original_send_json = websocket.send_json

        async def send_json(data: dict[str, Any]) -> None:
            await original_send_json(data)
            if data.get("type") == "telemetry":
                event_received.set()

        websocket.send_json = send_json  # type: ignore[method-assign]
        broadcaster = TelemetryBroadcaster(asyncio.get_running_loop(), manager)
        await asyncio.to_thread(broadcaster.publish, sample())
        await asyncio.wait_for(event_received.wait(), timeout=1)
        assert websocket.messages[-1] == {
            "type": "telemetry",
            "data": sample().model_dump(mode="json"),
        }

    asyncio.run(run())


def test_websocket_endpoint_sends_snapshot_and_cleans_up(client: TestClient) -> None:
    store = client.app.state.latest_telemetry_store
    store.clear()
    store.put(sample())

    with client.websocket_connect("/ws/telemetry") as websocket:
        snapshot = websocket.receive_json()
        assert snapshot["type"] == "snapshot"
        assert snapshot["data"]["CONFERENCE-ROOM"]["zone_id"] == "CONFERENCE-ROOM"

    assert len(client.app.state.websocket_manager._connections) == 0


def test_telemetry_payload_contract_keeps_zone_code() -> None:
    data = json.loads(sample().model_dump_json())
    assert data["zone_id"] == "CONFERENCE-ROOM"

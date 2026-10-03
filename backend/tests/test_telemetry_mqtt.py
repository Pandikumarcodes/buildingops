import json
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.mqtt import TELEMETRY_TOPIC_FILTER, MqttTelemetrySubscriber
from app.telemetry import LatestTelemetryStore, ZoneTelemetry


class RecordingPersistenceWorker:
    def __init__(self) -> None:
        self.submitted: list[ZoneTelemetry] = []

    def submit(self, telemetry: ZoneTelemetry) -> bool:
        self.submitted.append(telemetry)
        return True


class RecordingBroadcaster:
    def __init__(self) -> None:
        self.published: list[ZoneTelemetry] = []

    def __call__(self, telemetry: ZoneTelemetry) -> None:
        self.published.append(telemetry)


def valid_payload() -> dict[str, object]:
    return {
        "zone_id": "CONFERENCE-ROOM",
        "temperature": 24.8,
        "humidity": 58.0,
        "co2_ppm": 720,
        "occupancy": 12,
        "hvac_status": "ON",
        "hvac_setpoint": 23.0,
        "hvac_power_kw": 2.24,
        "zone_power_kw": 3.72,
        "timestamp": datetime(2026, 9, 28, 12, 30, tzinfo=UTC).isoformat(),
    }


@dataclass
class FakeMessage:
    topic: str
    payload: bytes


class FakeMQTTClient:
    def __init__(self) -> None:
        self.on_connect = None
        self.on_disconnect = None
        self.on_message = None
        self.subscriptions: list[tuple[str, int]] = []
        self.unsubscribed: list[str] = []
        self.loop_started = False
        self.disconnected = False

    def connect(self, host: str, port: int, keepalive: int) -> int:
        return 0

    def disconnect(self) -> int:
        self.disconnected = True
        return 0

    def loop_start(self) -> None:
        self.loop_started = True

    def loop_stop(self) -> None:
        self.loop_started = False

    def subscribe(self, topic: str, qos: int) -> tuple[int, int]:
        self.subscriptions.append((topic, qos))
        return (0, 1)

    def unsubscribe(self, topic: str) -> tuple[int, int]:
        self.unsubscribed.append(topic)
        return (0, 1)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("temperature", 31.0),
        ("humidity", 71.0),
        ("occupancy", -1),
        ("hvac_power_kw", -0.1),
    ],
)
def test_invalid_telemetry_values_are_rejected(field: str, value: object) -> None:
    payload = valid_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        ZoneTelemetry.model_validate(payload)


def test_hvac_off_with_nonzero_power_is_rejected() -> None:
    payload = valid_payload() | {"hvac_status": "OFF", "hvac_power_kw": 0.1}

    with pytest.raises(ValidationError):
        ZoneTelemetry.model_validate(payload)


def test_valid_telemetry_passes_validation() -> None:
    assert ZoneTelemetry.model_validate(valid_payload()).zone_id == "CONFERENCE-ROOM"


def test_mqtt_callback_updates_store_only_for_valid_matching_messages() -> None:
    client = FakeMQTTClient()
    store = LatestTelemetryStore()
    worker = RecordingPersistenceWorker()
    broadcaster = RecordingBroadcaster()
    subscriber = MqttTelemetrySubscriber(Settings(), store, worker, broadcaster, client=client)
    valid_message = FakeMessage(
        "buildingops/v1/telemetry/CONFERENCE-ROOM",
        json.dumps(valid_payload()).encode(),
    )

    subscriber._on_message(client, None, valid_message)
    assert set(store.all()) == {"CONFERENCE-ROOM"}
    assert [telemetry.zone_id for telemetry in worker.submitted] == ["CONFERENCE-ROOM"]
    assert [telemetry.zone_id for telemetry in broadcaster.published] == ["CONFERENCE-ROOM"]

    invalid_json = FakeMessage("buildingops/v1/telemetry/CONFERENCE-ROOM", b"{")
    subscriber._on_message(client, None, invalid_json)
    invalid_utf8 = FakeMessage("buildingops/v1/telemetry/CONFERENCE-ROOM", b"\xff")
    subscriber._on_message(client, None, invalid_utf8)
    mismatch = FakeMessage(
        "buildingops/v1/telemetry/RECEPTION",
        json.dumps(valid_payload()).encode(),
    )
    subscriber._on_message(client, None, mismatch)
    assert set(store.all()) == {"CONFERENCE-ROOM"}
    assert len(broadcaster.published) == 1


def test_subscriber_subscribes_at_qos_one_and_shuts_down_cleanly() -> None:
    client = FakeMQTTClient()
    subscriber = MqttTelemetrySubscriber(
        Settings(),
        LatestTelemetryStore(),
        RecordingPersistenceWorker(),
        RecordingBroadcaster(),
        client=client,
    )

    subscriber.start()
    assert client.on_connect is not None
    client.on_connect(client, None, None, 0, None)
    subscriber.stop()

    assert client.subscriptions == [(TELEMETRY_TOPIC_FILTER, 1)]
    assert client.unsubscribed == [TELEMETRY_TOPIC_FILTER]
    assert client.disconnected is True
    assert client.loop_started is False


def test_latest_endpoint_returns_in_memory_readings(client: TestClient) -> None:
    store = client.app.state.latest_telemetry_store
    store.clear()
    telemetry = ZoneTelemetry.model_validate(valid_payload())
    store.put(telemetry)

    response = client.get("/telemetry/latest")

    assert response.status_code == 200
    assert response.json()["CONFERENCE-ROOM"]["co2_ppm"] == 720

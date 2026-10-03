import json
from dataclasses import dataclass
from datetime import UTC, datetime

from src.generator import TelemetryGenerator
from src.mqtt import MqttPublisher, MQTTSettings, topic_for_zone


@dataclass
class FakePublishResult:
    rc: int = 0


class FakeMQTTClient:
    def __init__(self) -> None:
        self.connected_to: tuple[str, int, int] | None = None
        self.published: list[tuple[str, str, int, bool]] = []
        self.loop_started = False
        self.disconnected = False

    def connect(self, host: str, port: int, keepalive: int) -> int:
        self.connected_to = (host, port, keepalive)
        return 0

    def disconnect(self) -> int:
        self.disconnected = True
        return 0

    def loop_start(self) -> None:
        self.loop_started = True

    def loop_stop(self) -> None:
        self.loop_started = False

    def publish(self, topic: str, payload: str, qos: int, retain: bool) -> FakePublishResult:
        self.published.append((topic, payload, qos, retain))
        return FakePublishResult()


def test_topic_is_derived_from_zone_id() -> None:
    assert topic_for_zone("CONFERENCE-ROOM") == "buildingops/v1/telemetry/CONFERENCE-ROOM"


def test_publisher_uses_existing_payload_qos_one_and_no_retained_messages() -> None:
    client = FakeMQTTClient()
    publisher = MqttPublisher(MQTTSettings(), client_factory=lambda: client)
    telemetry = TelemetryGenerator(seed=1).next_cycle(datetime(2026, 9, 28, tzinfo=UTC))[0]

    publisher.connect()
    publisher.publish(telemetry)

    assert client.connected_to == ("localhost", 1883, 60)
    assert client.loop_started is True
    topic, payload, qos, retain = client.published[0]
    assert topic == topic_for_zone(telemetry.zone_id)
    assert json.loads(payload) == telemetry.to_dict()
    assert qos == 1
    assert retain is False


def test_publisher_publishes_every_zone_and_disconnects_cleanly() -> None:
    client = FakeMQTTClient()
    publisher = MqttPublisher(MQTTSettings(), client_factory=lambda: client)
    events = TelemetryGenerator(seed=3).next_cycle(datetime(2026, 9, 28, tzinfo=UTC))

    publisher.connect()
    for event in events:
        publisher.publish(event)
    publisher.disconnect()

    assert {topic for topic, _, _, _ in client.published} == {
        topic_for_zone(event.zone_id) for event in events
    }
    assert len(client.published) == 5
    assert client.disconnected is True
    assert client.loop_started is False

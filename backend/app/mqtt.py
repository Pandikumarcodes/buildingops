"""MQTT subscription and safe telemetry handling for the FastAPI process."""

import json
import logging
from collections.abc import Callable

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion
from pydantic import ValidationError

from app.core.config import Settings
from app.telemetry import LatestTelemetryStore, ZoneTelemetry
from app.telemetry_persistence import TelemetryPersistenceWorker

LOGGER = logging.getLogger(__name__)
TELEMETRY_TOPIC_PREFIX = "buildingops/v1/telemetry"
TELEMETRY_TOPIC_FILTER = f"{TELEMETRY_TOPIC_PREFIX}/+"


def zone_id_from_topic(topic: str) -> str | None:
    """Return the final zone segment only for a valid telemetry topic."""
    prefix = f"{TELEMETRY_TOPIC_PREFIX}/"
    if not topic.startswith(prefix):
        return None
    zone_id = topic.removeprefix(prefix)
    if not zone_id or "/" in zone_id:
        return None
    return zone_id


class MqttTelemetrySubscriber:
    """Keep MQTT callback work bounded to decoding, validation, and memory update."""

    def __init__(
        self,
        settings: Settings,
        store: LatestTelemetryStore,
        persistence_worker: TelemetryPersistenceWorker,
        broadcaster: Callable[[ZoneTelemetry], None],
        client: mqtt.Client | None = None,
    ) -> None:
        self._settings = settings
        self._store = store
        self._persistence_worker = persistence_worker
        self._broadcaster = broadcaster
        self._client = client or mqtt.Client(callback_api_version=CallbackAPIVersion.VERSION2)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._started = False

    def start(self) -> None:
        """Start the network loop, logging startup failure without aborting FastAPI."""
        try:
            self._client.connect(
                self._settings.mqtt_host,
                self._settings.mqtt_port,
                self._settings.mqtt_keepalive_seconds,
            )
        except OSError as error:
            LOGGER.error("Unable to connect to MQTT broker: %s", error)
            return
        self._client.loop_start()
        self._started = True
        LOGGER.info(
            "MQTT subscriber connecting to %s:%s",
            self._settings.mqtt_host,
            self._settings.mqtt_port,
        )

    def stop(self) -> None:
        """Unsubscribe and stop the MQTT network loop after a successful start."""
        if not self._started:
            return
        self._client.unsubscribe(TELEMETRY_TOPIC_FILTER)
        self._client.disconnect()
        self._client.loop_stop()
        self._started = False
        LOGGER.info("MQTT subscriber disconnected")

    def _on_connect(
        self,
        client: mqtt.Client,
        _userdata: object,
        _connect_flags: object,
        _reason_code: object,
        _properties: object,
    ) -> None:
        result, _message_id = client.subscribe(TELEMETRY_TOPIC_FILTER, qos=self._settings.mqtt_qos)
        if result == mqtt.MQTT_ERR_SUCCESS:
            LOGGER.info("MQTT subscribed to %s", TELEMETRY_TOPIC_FILTER)
        else:
            LOGGER.error(
                "MQTT subscription to %s failed with result %s", TELEMETRY_TOPIC_FILTER, result
            )

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: object,
        _disconnect_flags: object,
        _reason_code: object,
        _properties: object,
    ) -> None:
        LOGGER.info("MQTT subscriber disconnected")

    def _on_message(
        self, _client: mqtt.Client, _userdata: object, message: mqtt.MQTTMessage
    ) -> None:
        """Reject bad MQTT input without allowing a callback exception to escape."""
        topic_zone_id = zone_id_from_topic(message.topic)
        if topic_zone_id is None:
            LOGGER.warning("Rejected telemetry with unexpected topic %r", message.topic)
            return
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            telemetry = ZoneTelemetry.model_validate(payload)
        except UnicodeDecodeError:
            LOGGER.warning("Rejected telemetry for %s: payload is not UTF-8", topic_zone_id)
            return
        except json.JSONDecodeError:
            LOGGER.warning("Rejected telemetry for %s: payload is not valid JSON", topic_zone_id)
            return
        except ValidationError as error:
            LOGGER.warning("Rejected telemetry for %s: %s", topic_zone_id, error)
            return

        if telemetry.zone_id != topic_zone_id:
            LOGGER.warning(
                "Rejected telemetry: topic zone %s does not match payload zone %s",
                topic_zone_id,
                telemetry.zone_id,
            )
            return
        self._store.put(telemetry)
        self._persistence_worker.submit(telemetry)
        self._broadcaster(telemetry)
        LOGGER.info("Validated telemetry for zone %s", telemetry.zone_id)

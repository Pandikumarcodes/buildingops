"""Small MQTT publisher for synthetic BuildingOps telemetry."""

import json
import logging
import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import paho.mqtt.client as mqtt

from src.config import (
    MQTT_HOST,
    MQTT_HOST_ENV,
    MQTT_KEEPALIVE_SECONDS,
    MQTT_KEEPALIVE_SECONDS_ENV,
    MQTT_PORT,
    MQTT_PORT_ENV,
    MQTT_QOS,
    MQTT_QOS_ENV,
)
from src.models import ZoneTelemetry

LOGGER = logging.getLogger(__name__)
TELEMETRY_TOPIC_PREFIX = "buildingops/v1/telemetry"


class PublishResult(Protocol):
    @property
    def rc(self) -> object: ...


class MQTTClient(Protocol):
    def connect(self, host: str, port: int, keepalive: int) -> int: ...

    def disconnect(self) -> object: ...

    def loop_start(self) -> object: ...

    def loop_stop(self) -> object: ...

    def publish(self, topic: str, payload: str, qos: int, retain: bool) -> PublishResult: ...


def _create_mqtt_client() -> MQTTClient:
    return mqtt.Client()


@dataclass(frozen=True, slots=True)
class MQTTSettings:
    host: str = MQTT_HOST
    port: int = MQTT_PORT
    keepalive_seconds: int = MQTT_KEEPALIVE_SECONDS
    qos: int = MQTT_QOS


def topic_for_zone(zone_id: str) -> str:
    """Return the one telemetry topic for a zone."""
    return f"{TELEMETRY_TOPIC_PREFIX}/{zone_id}"


def get_mqtt_settings() -> MQTTSettings:
    """Load minimal MQTT settings for local simulator use."""
    return MQTTSettings(
        host=os.getenv(MQTT_HOST_ENV, MQTT_HOST),
        port=_positive_int(MQTT_PORT_ENV, MQTT_PORT),
        keepalive_seconds=_positive_int(MQTT_KEEPALIVE_SECONDS_ENV, MQTT_KEEPALIVE_SECONDS),
        qos=_qos(),
    )


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be a positive integer") from error
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _qos() -> int:
    raw_value = os.getenv(MQTT_QOS_ENV)
    if raw_value is None:
        return MQTT_QOS
    try:
        qos = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{MQTT_QOS_ENV} must be {MQTT_QOS} for telemetry") from error
    if qos != MQTT_QOS:
        raise ValueError(f"{MQTT_QOS_ENV} must be {MQTT_QOS} for telemetry")
    return qos


class MqttPublisher:
    """Publish existing simulator telemetry with QoS 1 and no retained messages."""

    def __init__(
        self,
        settings: MQTTSettings,
        client_factory: Callable[[], MQTTClient] = _create_mqtt_client,
    ) -> None:
        self._settings = settings
        self._client = client_factory()
        self._started = False

    def connect(self) -> None:
        """Connect and start paho's network loop."""
        self._client.connect(
            self._settings.host,
            self._settings.port,
            self._settings.keepalive_seconds,
        )
        self._client.loop_start()
        self._started = True
        LOGGER.info("MQTT publisher connected to %s:%s", self._settings.host, self._settings.port)

    def publish(self, telemetry: ZoneTelemetry) -> None:
        """Publish one existing telemetry event on its zone topic."""
        result = self._client.publish(
            topic_for_zone(telemetry.zone_id),
            json.dumps(telemetry.to_dict(), separators=(",", ":")),
            qos=self._settings.qos,
            retain=False,
        )
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            LOGGER.error(
                "MQTT publish failed for zone %s with result %s", telemetry.zone_id, result.rc
            )
            return
        LOGGER.info("Published synthetic telemetry for zone %s", telemetry.zone_id)

    def disconnect(self) -> None:
        """Stop the network loop and disconnect when startup succeeded."""
        if not self._started:
            return
        self._client.disconnect()
        self._client.loop_stop()
        self._started = False
        LOGGER.info("MQTT publisher disconnected")

"""Run the MQTT-connected BuildingOps telemetry simulator."""

import logging
import math
import os
import time

from src.config import SIMULATOR_INTERVAL_ENV, SIMULATOR_INTERVAL_SECONDS
from src.generator import TelemetryGenerator
from src.mqtt import MqttPublisher, get_mqtt_settings


def get_interval_seconds() -> float:
    """Read a positive simulation cadence, defaulting to five seconds."""
    raw_interval = os.getenv(SIMULATOR_INTERVAL_ENV)
    if raw_interval is None:
        return SIMULATOR_INTERVAL_SECONDS
    try:
        interval = float(raw_interval)
    except ValueError as error:
        raise ValueError(f"{SIMULATOR_INTERVAL_ENV} must be a positive number") from error
    if not math.isfinite(interval) or interval <= 0:
        raise ValueError(f"{SIMULATOR_INTERVAL_ENV} must be a positive number")
    return interval


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    interval = get_interval_seconds()
    generator = TelemetryGenerator()
    publisher = MqttPublisher(get_mqtt_settings())
    try:
        publisher.connect()
    except OSError as error:
        logging.getLogger(__name__).error("Unable to connect to MQTT broker: %s", error)
        raise SystemExit(1) from None

    logging.getLogger(__name__).info("Simulator started. Telemetry is synthetic.")
    try:
        while True:
            for event in generator.next_cycle():
                publisher.publish(event)
            time.sleep(interval)
    except KeyboardInterrupt:
        logging.getLogger(__name__).info("Simulator stopped.")
    finally:
        publisher.disconnect()


if __name__ == "__main__":
    main()

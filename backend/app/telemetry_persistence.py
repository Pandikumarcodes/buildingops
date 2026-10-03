"""Bounded, thread-backed persistence for validated MQTT telemetry."""

from __future__ import annotations

import logging
from queue import Full, Queue
from threading import Event, Thread

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.alert_service import evaluate_alerts
from app.models import Telemetry, Zone
from app.telemetry import ZoneTelemetry

LOGGER = logging.getLogger(__name__)
QUEUE_MAXSIZE = 1000
_STOP = object()


class TelemetryPersistenceWorker:
    """Move database work off the paho-mqtt network thread.

    The queue is intentionally in-memory and bounded for this local portfolio
    application. A full queue drops the new historical reading after logging it.
    """

    def __init__(
        self, session_factory: sessionmaker[Session], maxsize: int = QUEUE_MAXSIZE
    ) -> None:
        self._session_factory = session_factory
        self._queue: Queue[ZoneTelemetry | object] = Queue(maxsize=maxsize)
        self._stopped = Event()
        self._thread: Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = Thread(target=self._run, name="telemetry-persistence", daemon=True)
        self._thread.start()

    def submit(self, telemetry: ZoneTelemetry) -> bool:
        """Queue telemetry without blocking the MQTT callback."""
        if self._stopped.is_set():
            LOGGER.warning(
                "Dropped telemetry for %s because persistence is stopping", telemetry.zone_id
            )
            return False
        try:
            self._queue.put_nowait(telemetry)
        except Full:
            LOGGER.warning(
                "Dropped telemetry for %s because the persistence queue is full (maxsize=%s)",
                telemetry.zone_id,
                self._queue.maxsize,
            )
            return False
        return True

    def stop(self) -> None:
        """Drain accepted work, then stop the single persistence thread."""
        if self._thread is None:
            return
        self._stopped.set()
        self._queue.put(_STOP)
        self._thread.join(timeout=10)
        if self._thread.is_alive():
            LOGGER.error("Telemetry persistence worker did not stop within 10 seconds")
        self._thread = None

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                if item is _STOP:
                    return
                assert isinstance(item, ZoneTelemetry)
                self._persist(item)
            finally:
                self._queue.task_done()

    def _persist(self, telemetry: ZoneTelemetry) -> None:
        """Persist one reading using a worker-owned session and transaction."""
        try:
            with self._session_factory() as session:
                try:
                    zone = session.scalar(select(Zone).where(Zone.code == telemetry.zone_id))
                    if zone is None:
                        LOGGER.warning(
                            "Dropped telemetry for unknown zone code %s", telemetry.zone_id
                        )
                        return
                    session.add(
                        Telemetry(
                            zone_id=zone.id,
                            temperature=telemetry.temperature,
                            humidity=telemetry.humidity,
                            co2_ppm=telemetry.co2_ppm,
                            occupancy=telemetry.occupancy,
                            hvac_status=telemetry.hvac_status,
                            hvac_setpoint=telemetry.hvac_setpoint,
                            hvac_power_kw=telemetry.hvac_power_kw,
                            zone_power_kw=telemetry.zone_power_kw,
                            recorded_at=telemetry.timestamp,
                        )
                    )
                    evaluate_alerts(session, zone, telemetry)
                    session.commit()
                except SQLAlchemyError:
                    session.rollback()
                    LOGGER.exception("Unable to persist telemetry for zone %s", telemetry.zone_id)
        except SQLAlchemyError:
            LOGGER.exception("Unable to open a database session for telemetry persistence")

"""SQLAlchemy models for the building hierarchy."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base metadata for application models."""


class DeviceType(StrEnum):
    ENVIRONMENT_SENSOR = "ENVIRONMENT_SENSOR"
    OCCUPANCY_SENSOR = "OCCUPANCY_SENSOR"
    ENERGY_METER = "ENERGY_METER"
    HVAC_UNIT = "HVAC_UNIT"


class AlertType(StrEnum):
    HIGH_CO2 = "HIGH_CO2"
    HIGH_TEMPERATURE = "HIGH_TEMPERATURE"
    HIGH_ZONE_POWER = "HIGH_ZONE_POWER"


class AlertSeverity(StrEnum):
    WARNING = "WARNING"


class AlertStatus(StrEnum):
    ACTIVE = "ACTIVE"
    RESOLVED = "RESOLVED"


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    __table_args__ = (UniqueConstraint("code", name="uq_buildings_code"),)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    floors: Mapped[list[Floor]] = relationship(
        back_populates="building", cascade="all, delete-orphan"
    )


class Floor(Base):
    __tablename__ = "floors"
    __table_args__ = (
        UniqueConstraint("building_id", "floor_number", name="uq_floors_building_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("buildings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    floor_number: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    building: Mapped[Building] = relationship(back_populates="floors")
    zones: Mapped[list[Zone]] = relationship(back_populates="floor", cascade="all, delete-orphan")


class Zone(Base):
    __tablename__ = "zones"
    __table_args__ = (UniqueConstraint("floor_id", "code", name="uq_zones_floor_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    floor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    floor: Mapped[Floor] = relationship(back_populates="zones")
    devices: Mapped[list[Device]] = relationship(
        back_populates="zone", cascade="all, delete-orphan"
    )
    telemetry: Mapped[list[Telemetry]] = relationship(
        back_populates="zone", cascade="all, delete-orphan"
    )
    alerts: Mapped[list[Alert]] = relationship(back_populates="zone", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    device_id: Mapped[str] = mapped_column(String(100), nullable=False)
    __table_args__ = (UniqueConstraint("device_id", name="uq_devices_device_id"),)
    device_type: Mapped[DeviceType] = mapped_column(
        Enum(
            DeviceType,
            name="device_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    zone: Mapped[Zone] = relationship(back_populates="devices")


class Telemetry(Base):
    """A validated simulator reading persisted for historical queries."""

    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_zone_id_recorded_at", "zone_id", "recorded_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False
    )
    temperature: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
    co2_ppm: Mapped[int] = mapped_column(Integer, nullable=False)
    occupancy: Mapped[int] = mapped_column(Integer, nullable=False)
    hvac_status: Mapped[str] = mapped_column(String(3), nullable=False)
    hvac_setpoint: Mapped[float] = mapped_column(Float, nullable=False)
    hvac_power_kw: Mapped[float] = mapped_column(Float, nullable=False)
    zone_power_kw: Mapped[float] = mapped_column(Float, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    zone: Mapped[Zone] = relationship(back_populates="telemetry")


class Alert(Base):
    """A telemetry-driven alert occurrence for one zone and rule."""

    __tablename__ = "alerts"
    __table_args__ = (
        Index(
            "uq_alerts_active_zone_type",
            "zone_id",
            "alert_type",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
            sqlite_where=text("status = 'ACTIVE'"),
        ),
        Index("ix_alerts_status_triggered_at", "status", "triggered_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False
    )
    alert_type: Mapped[AlertType] = mapped_column(
        Enum(
            AlertType,
            name="alert_type",
            native_enum=False,
            create_constraint=True,
            length=50,
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(
            AlertStatus,
            name="alert_status",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(String(300), nullable=False)
    trigger_value: Mapped[float] = mapped_column(Float, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    zone: Mapped[Zone] = relationship(back_populates="alerts")

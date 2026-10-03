"""Seed the database with the stable BuildingOps demo hierarchy."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Building, Device, DeviceType, Floor, Zone

DEMO_BUILDING_NAME = "Demo Commercial Building"
DEMO_BUILDING_CODE = "DEMO-BLDG-01"

ZONE_SEED_DATA = (
    ("Ground Floor", 0, "Reception", "RECEPTION", "REC"),
    ("Ground Floor", 0, "Open Office", "OPEN-OFFICE", "OPEN"),
    ("Ground Floor", 0, "Conference Room", "CONFERENCE-ROOM", "CONF"),
    ("First Floor", 1, "Engineering Office", "ENGINEERING-OFFICE", "ENG"),
    ("First Floor", 1, "Server Room", "SERVER-ROOM", "SERVER"),
)

DEVICE_SEED_DATA = (
    (DeviceType.ENVIRONMENT_SENSOR, "ENV", "Environmental Sensor"),
    (DeviceType.OCCUPANCY_SENSOR, "OCC", "Occupancy Sensor"),
    (DeviceType.ENERGY_METER, "ENERGY", "Energy Meter"),
    (DeviceType.HVAC_UNIT, "HVAC", "HVAC Unit"),
)


def seed_demo_data(session: Session) -> None:
    """Insert or reconcile the demo hierarchy using its natural identifiers."""
    building = session.scalar(select(Building).where(Building.code == DEMO_BUILDING_CODE))
    if building is None:
        building = Building(name=DEMO_BUILDING_NAME, code=DEMO_BUILDING_CODE)
        session.add(building)
    else:
        building.name = DEMO_BUILDING_NAME
    session.flush()

    floors: dict[int, Floor] = {}
    for name, floor_number in (("Ground Floor", 0), ("First Floor", 1)):
        floor = session.scalar(
            select(Floor).where(
                Floor.building_id == building.id,
                Floor.floor_number == floor_number,
            )
        )
        if floor is None:
            floor = Floor(building_id=building.id, name=name, floor_number=floor_number)
            session.add(floor)
        else:
            floor.name = name
        floors[floor_number] = floor
    session.flush()

    for _floor_name, floor_number, zone_name, zone_code, short_code in ZONE_SEED_DATA:
        floor = floors[floor_number]
        zone = session.scalar(select(Zone).where(Zone.floor_id == floor.id, Zone.code == zone_code))
        if zone is None:
            zone = Zone(floor_id=floor.id, name=zone_name, code=zone_code)
            session.add(zone)
        else:
            zone.name = zone_name
        session.flush()

        for device_type, id_prefix, device_name in DEVICE_SEED_DATA:
            stable_device_id = f"{id_prefix}-{short_code}-01"
            device = session.scalar(select(Device).where(Device.device_id == stable_device_id))
            if device is None:
                device = Device(
                    zone_id=zone.id,
                    name=f"{zone_name} {device_name}",
                    device_id=stable_device_id,
                    device_type=device_type,
                )
                session.add(device)
            else:
                device.zone_id = zone.id
                device.name = f"{zone_name} {device_name}"
                device.device_type = device_type


def main() -> None:
    with get_session_factory()() as session, session.begin():
        seed_demo_data(session)

    print("BuildingOps demo data seeded successfully.")
    print("\nBuilding:\n1\n\nFloors:\n2\n\nZones:\n5\n\nDevices:\n20")


if __name__ == "__main__":
    main()

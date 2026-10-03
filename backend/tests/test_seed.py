from collections import Counter

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models import Building, Device, DeviceType, Floor, Zone
from app.seed import DEMO_BUILDING_CODE, seed_demo_data


def _seed(db_session_factory: sessionmaker[Session]) -> None:
    with db_session_factory() as session, session.begin():
        seed_demo_data(session)


def test_seed_creates_expected_hierarchy(db_session_factory: sessionmaker[Session]) -> None:
    _seed(db_session_factory)

    with db_session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Building)) == 1
        assert session.scalar(select(func.count()).select_from(Floor)) == 2
        assert session.scalar(select(func.count()).select_from(Zone)) == 5
        assert session.scalar(select(func.count()).select_from(Device)) == 20


def test_seed_is_idempotent(db_session_factory: sessionmaker[Session]) -> None:
    _seed(db_session_factory)
    _seed(db_session_factory)

    with db_session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Building)) == 1
        assert session.scalar(select(func.count()).select_from(Floor)) == 2
        assert session.scalar(select(func.count()).select_from(Zone)) == 5
        assert session.scalar(select(func.count()).select_from(Device)) == 20


def test_seed_preserves_unrelated_building_data(db_session_factory: sessionmaker[Session]) -> None:
    with db_session_factory() as session, session.begin():
        other_building = Building(name="Other Building", code="OTHER-BLDG")
        other_floor = Floor(name="Other Floor", floor_number=0, building=other_building)
        other_zone = Zone(name="Other Zone", code="OTHER-ZONE", floor=other_floor)
        other_device = Device(
            name="Other Device",
            device_id="OTHER-DEVICE-01",
            device_type=DeviceType.HVAC_UNIT,
            zone=other_zone,
        )
        session.add(other_building)
        session.flush()
        other_device_id = other_device.device_id

    _seed(db_session_factory)

    with db_session_factory() as session:
        assert session.scalar(select(Building).where(Building.code == "OTHER-BLDG")) is not None
        assert session.scalar(select(Device).where(Device.device_id == other_device_id)) is not None


def test_every_zone_has_one_of_each_supported_device_type(
    db_session_factory: sessionmaker[Session],
) -> None:
    _seed(db_session_factory)

    with db_session_factory() as session:
        zones = session.scalars(select(Zone).order_by(Zone.code)).all()
        expected = Counter({device_type: 1 for device_type in DeviceType})
        for zone in zones:
            assert Counter(device.device_type for device in zone.devices) == expected


def test_seed_device_ids_are_unique_and_follow_convention(
    db_session_factory: sessionmaker[Session],
) -> None:
    _seed(db_session_factory)

    with db_session_factory() as session:
        devices = session.scalars(select(Device)).all()
        device_ids = [device.device_id for device in devices]
        assert len(device_ids) == len(set(device_ids)) == 20
        assert set(device_ids) == {
            f"{prefix}-{zone}-01"
            for zone in ("REC", "OPEN", "CONF", "ENG", "SERVER")
            for prefix in ("ENV", "OCC", "ENERGY", "HVAC")
        }


def test_seed_relationships_and_existing_read_apis(
    db_session_factory: sessionmaker[Session], client: TestClient
) -> None:
    _seed(db_session_factory)

    with db_session_factory() as session:
        building = session.scalar(select(Building).where(Building.code == DEMO_BUILDING_CODE))
        assert building is not None
        assert {floor.name: floor.floor_number for floor in building.floors} == {
            "Ground Floor": 0,
            "First Floor": 1,
        }
        zones = {zone.code: zone for floor in building.floors for zone in floor.zones}
        assert set(zones) == {
            "RECEPTION",
            "OPEN-OFFICE",
            "CONFERENCE-ROOM",
            "ENGINEERING-OFFICE",
            "SERVER-ROOM",
        }
        zone_id = zones["CONFERENCE-ROOM"].id
        building_id = building.id
        ground_floor_id = next(floor.id for floor in building.floors if floor.floor_number == 0)

    assert client.get("/buildings").json()[0]["code"] == DEMO_BUILDING_CODE
    assert client.get(f"/buildings/{building_id}").json()["name"] == "Demo Commercial Building"
    floor_response = client.get(f"/buildings/{building_id}/floors")
    assert floor_response.status_code == 200
    floors = floor_response.json()
    assert len(floors) == 2
    assert str(ground_floor_id) in {floor["id"] for floor in floors}
    assert client.get(f"/zones/{zone_id}").json()["code"] == "CONFERENCE-ROOM"
    device_response = client.get(f"/zones/{zone_id}/devices")
    assert device_response.status_code == 200
    assert len(device_response.json()) == 4

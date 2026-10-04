import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.models import Building, Device, DeviceType, Floor, Zone


@pytest.fixture
def hierarchy(db_session_factory: sessionmaker[Session]) -> dict[str, uuid.UUID]:
    building = Building(name="Test Building", code="TEST")
    floor = Floor(name="Ground Floor", floor_number=0, building=building)
    zone = Zone(name="Lobby", code="LOBBY", floor=floor)
    device = Device(
        name="Lobby Sensor",
        device_id="test-lobby-sensor",
        device_type=DeviceType.ENVIRONMENT_SENSOR,
        zone=zone,
    )
    with db_session_factory() as session:
        session.add(building)
        session.commit()
        ids = {
            "building": building.id,
            "floor": floor.id,
            "zone": zone.id,
            "device": device.id,
        }
    return ids


def test_hierarchy_relationships_persist(
    db_session_factory: sessionmaker[Session], hierarchy: dict[str, uuid.UUID]
) -> None:
    with db_session_factory() as session:
        building = session.get(Building, hierarchy["building"])
        assert building is not None
        assert building.floors[0].floor_number == 0
        assert building.floors[0].zones[0].name == "Lobby"
        assert building.floors[0].zones[0].devices[0].device_type is DeviceType.ENVIRONMENT_SENSOR


def test_list_buildings(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get("/buildings")

    assert response.status_code == 200
    assert [building["id"] for building in response.json()] == [str(hierarchy["building"])]


def test_get_building(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/buildings/{hierarchy['building']}")

    assert response.status_code == 200
    assert response.json()["code"] == "TEST"


def test_list_building_floors(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/buildings/{hierarchy['building']}/floors")

    assert response.status_code == 200
    assert response.json()[0]["floor_number"] == 0
    assert response.json()[0]["building_id"] == str(hierarchy["building"])


def test_list_building_zones(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/buildings/{hierarchy['building']}/zones")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(hierarchy["zone"])


def test_get_zone(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/zones/{hierarchy['zone']}")

    assert response.status_code == 200
    assert response.json()["code"] == "LOBBY"


def test_list_zone_devices(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/zones/{hierarchy['zone']}/devices")

    assert response.status_code == 200
    assert response.json()[0]["device_id"] == "test-lobby-sensor"
    assert response.json()[0]["device_type"] == "ENVIRONMENT_SENSOR"


def test_get_device_by_uuid(client: TestClient, hierarchy: dict[str, uuid.UUID]) -> None:
    response = client.get(f"/devices/{hierarchy['device']}")
    assert response.status_code == 200
    result = response.json()
    assert result["id"] == str(hierarchy["device"])
    assert result["zone_id"] == str(hierarchy["zone"])
    assert result["device_id"] == "test-lobby-sensor"
    assert result["device_type"] == "ENVIRONMENT_SENSOR"
    assert set(result) == {"id", "zone_id", "name", "device_id", "device_type", "created_at"}


def test_unknown_device_returns_404(client: TestClient) -> None:
    response = client.get(f"/devices/{uuid.UUID(int=999)}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Device not found"}


@pytest.mark.parametrize("identifier", ["bad-uuid", "test-lobby-sensor"])
def test_device_route_requires_uuid(client: TestClient, identifier: str) -> None:
    assert client.get(f"/devices/{identifier}").status_code == 422


@pytest.mark.parametrize(
    ("path", "resource_id"),
    [
        ("/buildings/{}", "building"),
        ("/buildings/{}/floors", "building"),
        ("/zones/{}", "zone"),
        ("/zones/{}/devices", "zone"),
    ],
)
def test_missing_resources_return_404(client: TestClient, path: str, resource_id: str) -> None:
    response = client.get(path.format(uuid.uuid4()))

    assert response.status_code == 404
    assert response.json()["detail"] in {"Building not found", "Zone not found"}


def test_building_list_is_empty_without_data(client: TestClient) -> None:
    assert client.get("/buildings").json() == []


def test_device_type_accepts_exact_supported_values() -> None:
    assert {member.value for member in DeviceType} == {
        "ENVIRONMENT_SENSOR",
        "OCCUPANCY_SENSOR",
        "ENERGY_METER",
        "HVAC_UNIT",
    }
    with pytest.raises(ValueError):
        DeviceType("OTHER")

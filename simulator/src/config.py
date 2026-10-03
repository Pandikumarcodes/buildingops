"""Static demo zones and their seeded device identities."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ZoneConfig:
    zone_id: str
    name: str
    devices: dict[str, str]
    initial_temperature: float
    initial_humidity: float
    initial_co2_ppm: int
    initial_occupancy: int
    max_occupancy: int
    base_equipment_power_kw: float
    hvac_power_kw: float
    temperature_step: float = 0.2
    humidity_step: float = 1.0
    co2_step: int = 35
    occupancy_change_probability: float = 0.2
    hvac_change_probability: float = 0.01
    normally_occupied: bool = True
    server_room: bool = False


ZONE_CONFIGS: tuple[ZoneConfig, ...] = (
    ZoneConfig(
        zone_id="RECEPTION",
        name="Reception",
        devices={
            "environment": "ENV-REC-01",
            "occupancy": "OCC-REC-01",
            "energy": "ENERGY-REC-01",
            "hvac": "HVAC-REC-01",
        },
        initial_temperature=23.8,
        initial_humidity=51.0,
        initial_co2_ppm=520,
        initial_occupancy=3,
        max_occupancy=15,
        base_equipment_power_kw=1.1,
        hvac_power_kw=1.8,
        temperature_step=0.3,
        humidity_step=1.5,
        co2_step=45,
        occupancy_change_probability=0.3,
    ),
    ZoneConfig(
        zone_id="OPEN-OFFICE",
        name="Open Office",
        devices={
            "environment": "ENV-OPEN-01",
            "occupancy": "OCC-OPEN-01",
            "energy": "ENERGY-OPEN-01",
            "hvac": "HVAC-OPEN-01",
        },
        initial_temperature=23.5,
        initial_humidity=48.0,
        initial_co2_ppm=560,
        initial_occupancy=18,
        max_occupancy=40,
        base_equipment_power_kw=5.0,
        hvac_power_kw=4.0,
        co2_step=40,
        occupancy_change_probability=0.28,
    ),
    ZoneConfig(
        zone_id="CONFERENCE-ROOM",
        name="Conference Room",
        devices={
            "environment": "ENV-CONF-01",
            "occupancy": "OCC-CONF-01",
            "energy": "ENERGY-CONF-01",
            "hvac": "HVAC-CONF-01",
        },
        initial_temperature=23.2,
        initial_humidity=50.0,
        initial_co2_ppm=500,
        initial_occupancy=0,
        max_occupancy=16,
        base_equipment_power_kw=0.7,
        hvac_power_kw=2.2,
        co2_step=55,
        occupancy_change_probability=0.35,
        normally_occupied=False,
    ),
    ZoneConfig(
        zone_id="ENGINEERING-OFFICE",
        name="Engineering Office",
        devices={
            "environment": "ENV-ENG-01",
            "occupancy": "OCC-ENG-01",
            "energy": "ENERGY-ENG-01",
            "hvac": "HVAC-ENG-01",
        },
        initial_temperature=23.7,
        initial_humidity=49.0,
        initial_co2_ppm=540,
        initial_occupancy=8,
        max_occupancy=18,
        base_equipment_power_kw=2.4,
        hvac_power_kw=2.5,
        co2_step=35,
        occupancy_change_probability=0.22,
    ),
    ZoneConfig(
        zone_id="SERVER-ROOM",
        name="Server Room",
        devices={
            "environment": "ENV-SERVER-01",
            "occupancy": "OCC-SERVER-01",
            "energy": "ENERGY-SERVER-01",
            "hvac": "HVAC-SERVER-01",
        },
        initial_temperature=21.5,
        initial_humidity=45.0,
        initial_co2_ppm=430,
        initial_occupancy=0,
        max_occupancy=2,
        base_equipment_power_kw=6.0,
        hvac_power_kw=3.2,
        temperature_step=0.08,
        humidity_step=0.5,
        co2_step=8,
        occupancy_change_probability=0.02,
        hvac_change_probability=0.0,
        normally_occupied=False,
        server_room=True,
    ),
)

SIMULATOR_INTERVAL_SECONDS = 5.0
SIMULATOR_INTERVAL_ENV = "SIMULATOR_INTERVAL_SECONDS"
MQTT_HOST_ENV = "MQTT_HOST"
MQTT_PORT_ENV = "MQTT_PORT"
MQTT_KEEPALIVE_SECONDS_ENV = "MQTT_KEEPALIVE_SECONDS"
MQTT_QOS_ENV = "MQTT_QOS"
MQTT_HOST = "localhost"
MQTT_PORT = 1883
MQTT_KEEPALIVE_SECONDS = 60
MQTT_QOS = 1

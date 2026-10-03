# BuildingOps Simulator

The local simulator produces synthetic, stateful telemetry for the five zones in the seeded demo building and publishes one event per zone on each cycle to local Mosquitto. It does not connect to PostgreSQL.

## Setup and run

From this directory, install the locked Python 3.11 environment and start the simulator:

```powershell
uv sync --locked --extra dev --python 3.11
uv run python -m src.main
```

The default interval is five seconds. It publishes with MQTT QoS 1 and `retain=false` to `buildingops/v1/telemetry/{zone_id}`. Set `SIMULATOR_INTERVAL_SECONDS` to a positive number to change it, for example:

```powershell
$env:SIMULATOR_INTERVAL_SECONDS = "2"
uv run python -m src.main
```

Press `Ctrl+C` for a clean shutdown. All readings are simulated portfolio demo data, not live building measurements.

Set `MQTT_HOST`, `MQTT_PORT`, `MQTT_KEEPALIVE_SECONDS`, or `MQTT_QOS` for local broker configuration. Defaults are `localhost`, `1883`, `60`, and `1`.

## Checks

```powershell
uv run ruff check src tests
uv run ruff format --check src tests
uv run mypy src
uv run pytest
```

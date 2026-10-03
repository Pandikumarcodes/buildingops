# BuildingOps — Product Requirements

## Product summary

BuildingOps is a portfolio-grade Smart Building IoT & AI Operations Platform. It gives a building/facility engineer a clear view of conditions, HVAC operation, energy use, abnormal conditions, and historical telemetry in one web application. An IoT simulator supplies realistic, explicitly simulated readings over MQTT. An AI Building Assistant investigates the same persisted application data through a small set of controlled tools.

## Problem and target user

Commercial buildings produce data from environmental and occupancy sensors, HVAC equipment, and energy meters. A building engineer needs to understand current conditions, notice operational issues, inspect what happened over time, and investigate questions without manually stitching together disconnected readings. The primary user is a Building / Facility Engineer. The MVP is a single demo building and does not require authentication or complex role management.

## Product goals

1. Show current conditions across the demo building’s floors, zones, and devices.
2. Communicate simulated telemetry through MQTT and display updates with low perceived delay.
3. Make HVAC state and energy consumption understandable at building and zone level.
4. Detect and explain the three agreed initial alert conditions.
5. Support useful historical inspection over a bounded time window.
6. Let an engineer ask operational questions answered from actual persisted system data via controlled tools.
7. Be straightforward to run and demonstrate locally as an interview-ready MVP.

## Non-goals

No billing, subscriptions, complex authentication/RBAC, Kubernetes, microservices, Kafka, Redis unless a later measured need exists, mobile application, maintenance ERP, hardware firmware, BACnet/Modbus integration, predictive maintenance, machine learning models, RAG, or unrelated dashboards/CRUD screens. The simulator is not a substitute for certified equipment integration or safety systems.

## Demo building and hierarchy

One building: **Demo Commercial Building**.

- Ground Floor: Reception, Open Office, Conference Room
- First Floor: Engineering Office, Server Room

The conceptual hierarchy is Building → Floor → Zone → Device. Devices belong to a zone and emit telemetry. MVP device records identify simulated sensor/equipment sources; the UI should prioritize zone operations over device administration.

## Functional requirements

### Building and device model

- Represent buildings, floors, zones, and devices with stable IDs, names, and parent relationships.
- Seed the demo building hierarchy reproducibly.
- Associate telemetry with its source device and zone; reject unknown or invalid references with observable errors.
- Avoid general-purpose CRUD UI in the MVP; the seeded demo model is sufficient.

### Telemetry and simulator

Each zone sample can include temperature, humidity, CO2, occupancy, HVAC status, HVAC setpoint, HVAC power in kW, zone power in kW, and a timestamp. The simulator is a Python process that produces a stateful normal-operation random walk for all five zones. Broker settings and publishing cadence are environment-configurable, and logs identify the readings as simulated. Values and units must be documented, deterministic enough for automated tests, and plausible for a commercial building.

MQTT messages are validated at the backend boundary. A malformed sample must not crash the consumer or be silently treated as valid data. Persisted timestamps use UTC; client display may localize them.

### Live monitoring

- Building Overview summarizes current status across the five zones and highlights active alerts.
- Live Zone Monitor shows latest environmental, occupancy, HVAC and power values, sample freshness, and scenario-safe empty/loading/error states.
- Values must indicate units and stale/missing telemetry rather than implying that no recent reading means normal conditions.
- New readings appear through backend WebSocket events without the frontend subscribing directly to MQTT.

### HVAC monitoring

- Show per-zone HVAC status, setpoint, measured temperature, HVAC power, and freshness.
- Allow comparison across the five demo zones and help identify HVAC running while a zone is empty.
- Do not imply control capability: the MVP is monitor-only.

### Energy analytics

- Show zone power and HVAC power as distinct measures with clear kW units and timestamps.
- Provide historical series and comparisons over selectable bounded windows appropriate to demo data.
- Aggregate consistently from stored samples; show missing-data caveats and avoid treating instantaneous kW as energy (kWh).

### Alerts and incidents

Only these initial rule types are in scope:

1. `HIGH_CO2`
2. `HIGH_TEMPERATURE`
3. `HIGH_ZONE_POWER`

Each alert includes type, severity, zone, observed value/context, threshold or rule explanation, first/last observed times, and active/resolved state. Detection and clearing behavior must be deterministic and documented. Thresholds, comparison windows, and clear/hysteresis behavior are architecture decisions to settle before implementing M10; they must not be hidden in UI code. Duplicate telemetry must not create duplicate active incidents. This is operational assistance, not a life-safety alarm system.

### Historical analytics

- Query telemetry by zone and bounded time range, with a practical sample limit and stable ordering.
- Support charts for the telemetry relevant to live monitoring, HVAC, energy, and investigating alerts.
- Handle empty periods, sparse samples, and unavailable ranges explicitly.

### AI Building Assistant

The assistant answers building operations questions using controlled backend application tools only. Initial candidate tools are `get_zone_telemetry`, `get_hvac_status`, `get_energy_usage`, `get_active_alerts`, `get_zone_occupancy`, and `compare_zone_energy`. The assistant must:

- Use tools to retrieve current or historical facts; distinguish tool results from inference and say when data is absent/stale.
- Never have unrestricted database access, model-generated SQL, arbitrary shell/code execution, or credentials for direct persistence access.
- Validate tool arguments, restrict zone/time ranges and result size, and return only the minimum needed fields.
- Provide a useful explanation tied to retrieved readings and alert/rule context; do not invent unobserved causes or claim to control equipment.
- Handle provider timeout, tool errors, and missing data clearly. The app remains useful when the AI provider is unavailable.

Provider, model, and whether chat history persists are open choices. No RAG or model training is planned.

## Main screens

1. Building Overview
2. Live Zone Monitor
3. HVAC Monitoring
4. Energy Analytics
5. Alerts & Incidents
6. AI Building Assistant

Navigation should make the six operational views discoverable without adding separate administration screens.

## Quality requirements

- Strict TypeScript; typed API and WebSocket contracts.
- Python type hints and Pydantic request/message validation.
- PostgreSQL schema managed with Alembic migrations.
- Environment-based configuration and no hardcoded secrets.
- Modular FastAPI application; frontend/backend separation.
- Meaningful validation and failure handling, including broker disconnects, stale data, persistence errors, WebSocket disconnects, and AI provider failures.
- Focused tests for important business logic and integration contracts.
- Local deployment achievable with Docker Compose; no orchestration platform requirement.
- Demo behavior is reproducible, and synthetic data is clearly labeled.

## MVP success criteria

- A reviewer can start the local stack, seed/run the simulator, and see all five zones.
- As simulated readings cross a documented threshold, current conditions and the corresponding alert lifecycle remain understandable.
- Telemetry is persisted and can be inspected historically after a page refresh or backend restart.
- Live updates reach the browser through the FastAPI WebSocket path.
- HVAC and energy views clearly distinguish HVAC kW, zone kW, and derived energy if implemented.
- The assistant can answer a bounded operational question using application tools and identifies missing/stale facts without unrestricted database access.
- Key business logic and integration boundaries have automated tests and the README provides a short demo script.

# BuildingOps — Final Architecture

## System boundary

BuildingOps is a local-first modular monolith with three separately runnable applications:

- a Python simulator that publishes synthetic telemetry;
- a FastAPI backend that owns validation, persistence, alert evaluation, realtime delivery, and AI orchestration;
- a React dashboard that uses only backend HTTP and WebSocket contracts.

PostgreSQL and Eclipse Mosquitto are the only Docker Compose services. Authentication, equipment control, production broker security, and distributed deployment are intentionally outside the MVP.

```text
Python Simulator
       │
       │ MQTT: buildingops/v1/telemetry/{zone_code}
       ▼
Eclipse Mosquitto
       │
       ▼
FastAPI MQTT subscriber
       ├── validate Pydantic payload and topic identity
       ├── update process-local latest state
       ├── queue PostgreSQL persistence
       │       └── evaluate/persist alert transitions
       └── publish process-local WebSocket events
                       │
                       ▼
                 React dashboard

React ── HTTP ──> FastAPI ── SQLAlchemy ──> PostgreSQL
React ── POST /ai/chat ──> FastAPI ──> Gemini
                                      └── read-only tools ──> PostgreSQL
```

## Telemetry ingestion

The simulator publishes one JSON reading per zone with MQTT QoS 1 and `retain=false`. Each payload contains:

- zone code;
- temperature in °C;
- relative humidity percentage;
- CO₂ in ppm;
- occupancy count;
- HVAC `ON`/`OFF` state and setpoint;
- HVAC and total zone power in kW;
- timezone-aware timestamp.

The backend subscribes to `buildingops/v1/telemetry/+`. It validates JSON shape, numeric bounds, timezone presence, topic/payload zone agreement, and the invariant that an `OFF` HVAC unit has zero HVAC power. Rejected messages are logged with bounded context and do not terminate the subscriber.

The accepted reading first updates a locked in-memory latest-state map. A bounded queue (1,000 entries) hands it to one persistence worker, and the MQTT thread schedules a WebSocket broadcast on FastAPI's event loop. The queue keeps the network callback non-blocking, but it is not durable; overflow is logged and a production design would use durable buffering.

MQTT QoS 1 may redeliver. The implemented payload has no durable event ID, so metric-identical readings are not deduplicated. This is an explicit MVP limitation.

## Persistence and data model

SQLAlchemy models and three linear Alembic revisions define:

1. `0001_building_hierarchy` — buildings, floors, zones, devices;
2. `0002_telemetry_storage` — typed telemetry columns and zone/time index;
3. `0003_alerts` — alert lifecycle and active-alert uniqueness index;
4. `0004_alert_enum_constraints` — database checks for alert type, severity, and status.

The seed is idempotent and creates one building, two floors, five zones, and four simulated devices per zone. Telemetry uses UTC-aware timestamps. `GET /zones/{zone_id}/telemetry` is newest-first and bounded to 100 rows; frontend chart utilities reverse data for chronological display.

## Realtime delivery

`WS /ws/telemetry` is a backend-owned, process-local fan-out channel. On connect, the client receives:

```text
{ "type": "snapshot", "data": { zone-code: reading, ... } }
```

Accepted MQTT messages then produce:

```text
{ "type": "telemetry", "data": reading }
```

The React provider reconnects with bounded delay and refetches HTTP state. WebSocket delivery is intentionally ephemeral; PostgreSQL-backed HTTP reads remain authoritative after disconnects or missed events.

## Alert evaluation

Alert evaluation runs in the same database transaction as telemetry persistence. The final implementation contains three fixed warning rules:

| Type | Trigger | Clear hysteresis |
|---|---:|---:|
| `HIGH_CO2` | CO₂ ≥ 1200 ppm | CO₂ < 1000 ppm |
| `HIGH_TEMPERATURE` | temperature ≥ 28°C | temperature < 27°C |
| `HIGH_ZONE_POWER` | zone power ≥ 10 kW | zone power < 9 kW |

Repeated qualifying samples leave the existing incident active. Crossing the clear boundary resolves it, and a later trigger creates a new occurrence. A PostgreSQL partial unique index permits at most one `ACTIVE` row for each zone/type pair. Alerts are read-only in the UI; acknowledgement is out of scope.

## HTTP application contracts

The implemented routes are unversioned local-MVP paths:

- `GET /health`
- hierarchy reads under `/buildings` and `/zones`
- `GET /telemetry/latest`
- `GET /zones/{zone_id}/telemetry?limit=...`
- `GET /alerts?status=...&limit=...`
- `POST /ai/chat`
- `WS /ws/telemetry`

Vite proxies `/buildings`, `/zones`, `/telemetry`, `/alerts`, `/ai`, and WebSocket-enabled `/ws`. This keeps browser development same-origin and prevents the browser from talking to infrastructure directly.

## Frontend state and analytics

TanStack Query owns hierarchy, current telemetry recovery, alert polling, and historical reads. A single React context owns the WebSocket connection and merges snapshot/telemetry events into the latest reading map. Presentation components derive:

- building occupancy and power totals;
- HVAC running count, temperature differences, and HVAC power;
- current zone power and HVAC share;
- ten-second aligned recent building power;
- selected-zone historical summaries and charts.

Instantaneous power is always labelled kW. The application does not claim that it measures energy in kWh. Empty history produces an explicit empty state rather than a fabricated zero series.

Routes are lazy-loaded behind one shared loading state. This keeps the shell small and isolates the chart-heavy Energy page from initial routes.

## AI assistant

Gemini is configured only in the backend through `GEMINI_API_KEY` and `GEMINI_MODEL`. Requests are stateless and the visible conversation exists only in frontend memory.

The model can request exactly three functions:

1. `get_current_building_state` — latest persisted reading for each zone;
2. `get_active_alerts` — at most 50 newest active alerts;
3. `get_zone_history` — at most 30 readings for a named zone over 1–168 hours.

Pydantic validates arguments and forbids extras. Tool handlers use fixed SQLAlchemy queries; no SQL, database connection, credential, code-execution, or equipment-control capability is exposed. SDK automatic function execution is disabled, tool names are allowlisted again at execution, and orchestration is capped at three rounds and four calls per round.

Operational answers must use tool results. A response is `grounded=true` only after an allowed tool is used. Provider exceptions are logged by exception type only and return a concise ungrounded fallback with no SDK details, prompt, or secret.

## Security posture

- Root `.env` and `.env.*` are ignored except safe example templates.
- Gemini credentials are never loaded by frontend code or assigned to `VITE_*` variables.
- Database and MQTT credentials remain backend/infrastructure configuration.
- Logs avoid secrets, full AI prompts, and full telemetry payloads.
- Input validation and bounded reads reduce accidental resource abuse.
- Mosquitto anonymous access and lack of application authentication are documented local-demo limitations.

## Selected tradeoffs

| Decision | Reason | MVP consequence |
|---|---|---|
| Modular monolith | Clear boundaries without distributed operational overhead | One backend process owns ingest, APIs, realtime, and AI |
| MQTT ingest | Natural decoupling for synthetic device publishers | Broker availability affects new telemetry, not stored reads |
| WebSocket UI updates | Low-latency browser delivery | Clients must recover through HTTP after missed events |
| PostgreSQL history | Constraints, indexes, migrations, relational context | Requires local infrastructure |
| Alert hysteresis | Avoids flapping near thresholds | Rules remain deliberately fixed and simple |
| TanStack Query | Consistent server-state lifecycle | WebSocket state remains a separate focused context |
| Gemini function calling | Structured grounding over operational data | Provider availability is optional; no RAG or memory |
| Read-only tools | Prevents autonomous control and mutation | Assistant investigates but cannot remediate |

## Scaling discussion, not implemented scope

Beyond one demo building, the natural evolution would add tenant-aware authentication/authorization, TLS and broker credentials, durable message identity/buffering, telemetry retention and partitioning, distributed WebSocket fan-out, and separately scalable ingest workers. Those are interview design directions only; the repository does not claim to implement them.

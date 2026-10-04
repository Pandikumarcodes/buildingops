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

The approved V2 decisions below supersede the single-building assumption only for planned V2 work; the V1 runtime and contracts above remain unchanged.

Beyond one demo building, the natural evolution would add tenant-aware authentication/authorization, TLS and broker credentials, durable message identity/buffering, telemetry retention and partitioning, distributed WebSocket fan-out, and separately scalable ingest workers. Those are interview design directions only; the repository does not claim to implement them.

# BuildingOps V2 — pre-M14 decisions

## Canonical resource and transport identity

Database primary keys and REST resource identifiers remain UUIDs, e.g. `/buildings/{building_uuid}` and `/zones/{zone_uuid}/devices`. Human-readable identity remains `building.code`, `floor.floor_number` (no floor code currently exists), `zone.code`, and `device.device_id`; these are domain identifiers, not primary keys. Building codes and device identifiers are globally unique; floor numbers are unique within a building; zone codes are unique only within a floor, as enforced by the current model/migrations.

The canonical future topic is:

```text
buildingops/v2/telemetry/{building_code}/{floor_number}/{zone_code}
```

Floor identity is required: building code plus zone code alone cannot distinguish equal zone codes on two floors in the same building. The tuple `(building.code, floor.floor_number, zone.code)` is the smallest identity guaranteed unique by existing constraints. Encode the floor number as its canonical decimal integer string (including a minus sign for basements, no leading zeros). Transport codes must be nonempty single topic segments without `/`, `+`, or `#`; validate this at the future transport boundary rather than changing the current schema now. Do not place database UUIDs in MQTT topics. Treat transport codes/floor numbers as stable while publishing; future renaming workflows must coordinate publishers and mappings explicitly.

The future backend resolves that tuple through Building → Floor → Zone to exactly one zone UUID and validates topic/payload identity agreement before persistence, latest-state updates, or publication. Unknown or ambiguous identities are rejected observably, never resolved by first match. Current V1 payload `zone_id` actually carries a zone code; persistence resolves it globally in `app/telemetry_persistence.py`, and latest-state/WebSocket maps also use zone codes. This is safe only under the seeded demo's globally distinct codes; it is not a multi-building contract.

## Telemetry migration gate

1. **Now / M14:** Keep `buildingops/v1/telemetry/{zone_code}`, its payload, subscription, simulator, tests, latest-state maps, and WebSocket contracts unchanged. M14 does not create buildings or publish additional-building telemetry. Do not attach legacy code-keyed readings to another building merely because its zone code matches; show unavailable summaries where identity cannot be established.
2. **Future V2 telemetry milestone:** Before additional-building telemetry, implement the V2 topic and a versioned validated payload with explicit building code, floor number, and zone code (not a second meaning for V1 `zone_id`). Temporarily subscribe to both V1 and V2. Resolve V1 only through an explicit legacy demo-building context with a unique zone match; reject ambiguity. Resolve V2 through the full tuple. Normalize both to zone UUID internally, including latest-state keys, persistence, query projections, alert attribution, and AI tool context. Define versioned HTTP/WebSocket adaptations and client recovery before changing code-keyed public contracts; retain a V1 compatibility projection for the demo during transition.
3. **Simulator:** Move publishing to V2 only in that telemetry milestone after dual ingestion and client compatibility pass. Specify cutover/duplicate handling there; do not dual-publish a reading accidentally. Retire V1 only after compatibility consumers are migrated in an explicitly documented milestone.

Migration acceptance must cover repeated zone codes across buildings and floors, unknown/ambiguous identities, topic/payload disagreement, legacy demo ingestion, simulator publishing, UUID attribution through persistence/alerts/HTTP/realtime/AI, reconnect recovery, and unchanged V1 behavior. No new broker, buffering infrastructure, or routing is needed for M14.

## Hierarchy deletion and operational history

Current database foreign keys use `ON DELETE CASCADE` for Building → Floor → Zone → Device and Zone → Telemetry/Alert. ORM relationships also use `all, delete-orphan` for these child collections. Deleting a building, floor, or zone can therefore delete downstream devices, telemetry, and alerts; removing children from ORM collections can also delete them. Device deletion currently does not cascade to telemetry/alerts, which reference Zone rather than Device. Work orders, maintenance history, and reports do not yet exist.

M14 is read/navigation-only and exposes no Delete actions for Building, Floor, Zone, or Device. Existing read APIs are not a lifecycle-management API. A normal user removing a building from management must never erase operational history.

For future management, operational entities normally transition from ACTIVE to INACTIVE/ARCHIVED while retaining UUIDs, parent references, telemetry, alerts, and future work orders, maintenance history, and reports. These are planned product lifecycle states, not existing schema fields, and are distinct from alert ACTIVE/RESOLVED. Hard deletion is restricted to incorrect empty setup records, development/test fixtures, or explicit administrative cleanup after verifying no operational history on the entity or its descendants. Archival is not telemetry retention purging; no automatic purge policy is introduced here.

The first future hierarchy-management milestone must define archival visibility/ingestion semantics, implement deterministic lifecycle services and safeguards against deleting/reparenting history, review ORM and database cascades, and introduce required status/constraint changes through Alembic before exposing mutation endpoints or controls. Its acceptance criteria must test preservation of downstream history and rejection of unsafe hard deletion. No cascade/schema change is required in this documentation preparation or M14.

## Frontend identity and organization

Building navigation uses `/buildings/:buildingId`, with route UUID → validated `GET /buildings/{building_id}` query → page/feature state. A malformed, unknown, or missing ID yields an explicit invalid/not-found/selection state. Never choose the active building by `"Demo Commercial Building"`, display name, array index zero, or arbitrary fallback. M14 replaced the `frontend/src/hooks/useDashboardData.ts` name/first-item assumption with unique seeded demo-code resolution (`DEMO-BLDG-01`); missing or duplicate matches do not select a building. The Buildings feature owns independent UUID routes and never changes V1 demo context. Preserve V1 views with explicit demo context while multi-building routes use their own validated UUIDs.

Introduce persistent global building selection only if later cross-route requirements demonstrate a need; add no global state library. Keep working V1 files in place. Feature folders such as `src/features/buildings/` are optional when implementing that feature; do not pre-create empty frontend feature trees or speculative backend service/repository layers.

## V2 engineering rules

1. Preserve working V1 functionality and contracts.
2. No broad rewrite.
3. No mass file moves.
4. UUIDs are canonical REST/database identifiers.
5. MQTT transport identities must resolve unambiguously across buildings and floors.
6. No destructive hierarchy deletion from normal UI.
7. Retain operational history.
8. TanStack Query owns server state.
9. WebSocket handling remains centralized in the realtime provider.
10. UI components do not contain backend business rules; presentation projections use trusted data and documented semantics.
11. Backend routes remain thin.
12. New lifecycle workflows belong in deterministic services.
13. AI is not an operational source of truth.
14. AI never decides permissions, alert truth, health scores, or deterministic calculations.
15. Database changes require Alembic migrations.
16. New features require focused tests.
17. Add only infrastructure required by the current milestone.
18. Preserve simulated-data labeling where relevant.
19. Keep one BuildingOps Operations Agent, implemented by the existing Gemini trusted tool-calling assistant; no multi-agent architecture.
20. Every milestone needs explicit acceptance criteria before implementation.

Preserve React, strict TypeScript, Vite, React Router, TanStack Query, Recharts, FastAPI, SQLAlchemy, Alembic, PostgreSQL, MQTT, WebSockets, the Python simulator, Gemini trusted tool calling, Docker Compose, pytest, and Vitest/Testing Library. No Kafka, Kubernetes, microservices, Redis Streams, TimescaleDB, event sourcing, new global frontend state library, or speculative infrastructure is approved.

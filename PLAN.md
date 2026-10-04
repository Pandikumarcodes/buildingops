# BuildingOps — Milestone Implementation Plan

Each milestone should be reviewed against its acceptance criteria before starting the next dependent milestone. M0 establishes repository and toolchain foundations only; it does not implement product functionality. Tests and checks should stay within the active milestone's acceptance criteria.

## M0 — Repository setup

- **Objective:** Prepare clear frontend, backend, simulator, and documentation boundaries.
- **Functionality:** Establish repository layout, language/tool configuration, environment templates, basic commands, and local developer guidance. No product behavior.
- **Files/modules expected:** `frontend/`, `backend/`, `simulator/`, root README, `.gitignore`, frontend package/config files, backend Python project/config files, simulator project/config files, `.env.example` files. Do not create application features.
- **Database changes:** None.
- **API/events:** None.
- **Tests:** Toolchain/config smoke checks only; no product tests.
- **Acceptance criteria:** Clean install/setup instructions work; strict TypeScript and Python typing/lint conventions are configured; secret files are ignored; no secrets committed.
- **Dependencies:** None.

## M1 — Building domain

- **Objective:** Define and seed the demo building hierarchy.
- **Functionality:** Building, floor, zone, device entities; idempotent demo seed data for five named zones; validated parent relationships.
- **Files/modules expected:** Backend domain models, SQLAlchemy mappings, repositories/services, seed command, initial Alembic migration, focused unit tests.
- **Database changes:** Initial hierarchy tables and constraints.
- **API/events:** Read-only versioned building hierarchy endpoint; no realtime event.
- **Tests:** Entity/service validation, seed idempotency, hierarchy API response.
- **Acceptance criteria:** All floors/zones/devices are discoverable with stable IDs; invalid parent relationships fail clearly; seed can run repeatedly.
- **Dependencies:** M0.

## M2 — IoT simulator

- **Objective:** Produce repeatable telemetry scenarios independently of the broker.
- **Functionality:** Python simulator generates documented stateful random-walk measurements for the five zones; broker settings and cadence are environment-configurable.
- **Files/modules expected:** Simulator config, domain sample/schema, scenario generators, CLI/runner, logging, unit tests, simulator README.
- **Database changes:** None.
- **API/events:** Define/version telemetry envelope contract; no application API required.
- **Tests:** Pydantic/schema validity, scenario invariants, units/ranges, deterministic behavior under seeded clock/random source.
- **Acceptance criteria:** Seeded tests reproducibly produce valid, plausible timestamped samples for all five zones without needing MQTT.
- **Dependencies:** M0; use M1 IDs/contracts where available.

## M3 — MQTT integration

- **Objective:** Transport simulator samples through Mosquitto to a backend consumer.
- **Functionality:** Broker connection settings, versioned topic contract, publish/subscribe, payload and topic validation, reconnect/backoff, duplicate identity, observable rejected messages. Resolve QoS, retained policy, and late-arrival handling here.
- **Files/modules expected:** Backend MQTT adapter/lifecycle, simulator MQTT publisher, telemetry contract, config, broker local config, integration tests.
- **Database changes:** None beyond any M1 hierarchy lookups; temporary in-memory handling only if needed.
- **API/events:** MQTT topic/payload contract; internal ingestion callback; health/degraded status for broker connectivity.
- **Tests:** Topic/payload validation, broker publish/consume integration, disconnect/reconnect, malformed message isolation.
- **Acceptance criteria:** Simulator messages reach the backend; bad messages do not crash the process; broker outage is recoverable and visible.
- **Dependencies:** M0–M2.

## M4 — Telemetry persistence

- **Objective:** Validate, deduplicate, and persist telemetry as the durable source of truth.
- **Functionality:** SQLAlchemy telemetry model, type/unit/range validation, idempotent writes, query service, indexes, UTC policy, bounded latest/history queries.
- **Files/modules expected:** Telemetry models/repository/service, Alembic migration, ingest integration, config, unit and database tests.
- **Database changes:** Telemetry sample table with stable sample uniqueness, device/zone references, timestamp indexes and typed measurements.
- **API/events:** Internal service contract; latest and historical read endpoints may be exposed here or in M7/M11 according to frontend dependency, with routes documented.
- **Tests:** Duplicate handling, constraints, ordering, range query bounds, invalid samples, persistence round-trip.
- **Acceptance criteria:** Valid MQTT samples survive restarts; redelivery does not duplicate rows; historical samples can be retrieved by zone and time.
- **Dependencies:** M1, M3.

## M5 — Realtime WebSocket pipeline

- **Objective:** Deliver committed telemetry and alert state changes to connected clients.
- **Functionality:** Typed/versioned event envelope, connection manager, fanout after database commit, disconnect cleanup, reconnect guidance/refetch contract.
- **Files/modules expected:** Backend event schemas/publisher, WebSocket router/manager, telemetry pipeline integration, contract tests.
- **Database changes:** None.
- **API/events:** WebSocket endpoint and telemetry/alert event types; document heartbeat/auth assumptions for local MVP.
- **Tests:** Event schema, connected client receives persisted sample event, disconnect cleanup, event ordering/ID semantics.
- **Acceptance criteria:** A client receives current sample updates; a missed event can be recovered by HTTP query; WebSocket failure does not undo persistence.
- **Dependencies:** M4.

## M6 — React application shell

- **Objective:** Establish navigable and typed frontend application structure.
- **Functionality:** Vite React/TypeScript strict shell, React Router routes for six screens, shared layout/navigation, TanStack Query setup, typed HTTP/WebSocket clients, reusable loading/error/empty state primitives.
- **Files/modules expected:** Frontend app entry, routes/layout, API/event types/client, query provider, shared components, tests/config.
- **Database changes:** None.
- **API/events:** Consume M1 hierarchy API and M5 WebSocket contract; screen-specific queries can be stubbed only at component boundary until backend routes land.
- **Tests:** Route/navigation rendering, API client error handling, shared state primitives.
- **Acceptance criteria:** All six routes are navigable, responsive enough for desktop demo, typed and consistent in shell behavior.
- **Dependencies:** M0; contracts from M1/M5.

## M7 — Building Overview + Live Monitor

- **Objective:** Make current building and zone conditions inspectable live.
- **Functionality:** Overview of five zones and active status; zone detail monitor with all current metrics, units, freshness/stale state; WebSocket updates and refetch recovery.
- **Files/modules expected:** Frontend overview/live monitor features and hooks; backend latest telemetry endpoints; API contracts.
- **Database changes:** None.
- **API/events:** Hierarchy/latest telemetry HTTP endpoints; consume telemetry WebSocket events.
- **Tests:** Latest endpoint filtering, UI rendering of current/stale/missing data, WebSocket update and reconnect refetch behavior.
- **Acceptance criteria:** Reviewer can identify a zone’s latest temperature, humidity, CO2, occupancy, HVAC state/setpoint and power, plus sample age; unknown/stale never appears healthy by default.
- **Dependencies:** M1, M5, M6.

## M8 — HVAC monitoring

- **Objective:** Present HVAC operation by zone without control capability.
- **Functionality:** Compare status, setpoint, measured temperature, HVAC power, sample freshness across zones; indicate empty-zone operation context.
- **Files/modules expected:** HVAC backend query service/endpoint as needed, frontend HVAC screen/components/hooks, tests.
- **Database changes:** None; uses telemetry.
- **API/events:** HVAC status read endpoint or documented projection; live data can reuse M5 events.
- **Tests:** HVAC projection and freshness logic; screen comparison/empty/error states.
- **Acceptance criteria:** All five zones can be compared and units/state are explicit; no control actions are presented.
- **Dependencies:** M4, M6, M7.

## M9 — Energy analytics

- **Objective:** Explain zone and HVAC power trends from stored samples.
- **Functionality:** Historical power series and zone comparisons over bounded windows; distinguish kW from any derived kWh; label gaps and aggregation assumptions.
- **Files/modules expected:** Energy query/aggregation service and endpoint, frontend analytics feature using Recharts, tests and contract docs.
- **Database changes:** None expected; add indexes only if measurements show query need.
- **API/events:** Bounded energy history/summary API; optional reuse telemetry WebSocket for latest values.
- **Tests:** Aggregation/unit semantics, time bounds, sparse/missing intervals, API limits, chart data mapping.
- **Acceptance criteria:** User can inspect per-zone/HVAC power history with correct units, range controls and clear missing-data display; kWh is only shown if explicitly derived/documented.
- **Dependencies:** M4, M6.

## M10 — Alert engine

- **Objective:** Detect and persist the three agreed operating conditions.
- **Functionality:** Rule service for HIGH_CO2, HIGH_TEMPERATURE, and HIGH_ZONE_POWER; documented trigger/clear hysteresis; one active occurrence per rule/zone.
- **Files/modules expected:** Alert domain/model/service/rule config, Alembic migration, telemetry pipeline integration, unit/database tests.
- **Database changes:** Alert incident table and constraints/indexes for active rule/zone state and history.
- **API/events:** Internal alert transitions; active/history read API contract; alert WebSocket event.
- **Tests:** Each rule positive/negative cases, window/hysteresis, duplicate sample idempotency, resolve/reopen lifecycle, transaction/event behavior.
- **Acceptance criteria:** Each supported scenario triggers only its corresponding expected rule under documented thresholds; repeated samples do not spam incidents; state and context persist.
- **Dependencies:** M4, M5. Threshold/rule semantics must be decided before implementation.

## M11 — Alerts UI + historical analytics

- **Objective:** Let an engineer investigate incidents and historical telemetry.
- **Functionality:** Alerts & Incidents screen with active/resolved state, rule context/times; bounded historical telemetry charts/filters for relevant measurements and incident investigation.
- **Files/modules expected:** Alert/history endpoints and services if incomplete, frontend alerts/history features, tests.
- **Database changes:** None expected.
- **API/events:** Alert active/history HTTP endpoints, bounded historical telemetry endpoint, alert WebSocket events.
- **Tests:** Filtering/order/limits, lifecycle display, historical range and empty states, live alert update.
- **Acceptance criteria:** Alert reason is understandable and linked to zone/observed values; user can inspect relevant historical samples; stale/absent data is clear.
- **Dependencies:** M4, M6, M9, M10.

## M12 — AI Building Assistant

- **Objective:** Answer bounded operations questions using real application data through explicit tools.
- **Functionality:** Provider adapter, allowlisted tool definitions and handlers for approved candidate tools, argument/result limits, tool-grounded response format, timeout/provider fallback, assistant UI.
- **Files/modules expected:** Backend AI adapter/orchestrator/tool handlers/schemas/config, frontend assistant screen, tool/service tests and mocked provider tests.
- **Database changes:** Optional conversation persistence only if selected; otherwise none. Decide provider/model and persistence before this milestone.
- **API/events:** Assistant request/response API; tool calls remain internal and use domain query services.
- **Tests:** Each tool validation/authorization bounds, no direct DB access path, provider timeout/error, grounded response with missing/stale data, UI behavior.
- **Acceptance criteria:** Assistant answers representative questions from actual persisted readings/alerts; reports data timestamps/units and uncertainty; cannot generate SQL or operate equipment; core app works when provider is unavailable.
- **Dependencies:** M4, M7–M11. Resolve provider, local demo fallback, history, and tool schemas first.

## M13 — Final verification, polish, and demo readiness

- **Objective:** Verify the implemented M0–M12 product, fix genuine defects, complete security/documentation audits, and prepare a truthful portfolio demonstration without adding features.
- **Functionality:** Full quality checks; live local MQTT, persistence, API, WebSocket, alerts, history, and AI-failure verification; small UI/performance polish; final README and architecture documentation.
- **Files/modules expected:** Narrow fixes to existing modules and tests plus final documentation.
- **Database changes:** Add only `0004_alert_enum_constraints` after Alembic drift detection proved the alert model and `0003` migration were not fully aligned.
- **API/events:** Preserve settled routes; bound alert history reads for demo usability.
- **Tests:** Run backend, simulator, and frontend quality suites plus available local-stack checks.
- **Acceptance criteria:** Required automated checks pass; local data flow is verified where the execution environment permits; secrets remain server-side; documentation distinguishes PASS, FAIL, and BLOCKED evidence; a five-minute demo is documented.
- **Dependencies:** M0–M12.

## Final milestone status

| Milestone | Implementation | Verification evidence |
|---|---|---|
| M0–M1 | Complete | Backend configuration, migration, seed, and hierarchy tests pass |
| M2–M3 | Complete | Simulator unit/MQTT tests pass; live publisher connected to Mosquitto |
| M4–M5 | Complete | Persistence and realtime backend tests pass; live timestamps matched PostgreSQL history |
| M6–M8 | Complete | Frontend route, overview, realtime, and HVAC tests pass |
| M9–M11 | Complete | Energy/history/alert tests pass; live APIs returned current, history, active, and resolved data |
| M12 | Complete | Mocked tool/orchestration and UI tests pass; live provider retry was blocked by Gemini HTTP 503 while safe fallback passed |
| M13 | Complete | Quality checks and available local-stack checks pass; browser UI automation was blocked by a missing execution-environment helper |

Docker CLI validation and manual browser interaction are verification states, not implementation milestones. They remain explicitly BLOCKED in the M13 completion report when the current execution environment cannot perform them.

## Recommended execution order

M0 through M13 remain the complete V1 MVP sequence and historical authority. The approved V2 extension below does not rewrite V1 scope or verification evidence.

# BuildingOps V2

## Pre-M14 architecture preparation

This documentation-only preparation resolves three prerequisites: an authoritative M14 plan, unambiguous multi-building telemetry identity, and hierarchy retention/deletion policy. Acceptance is agreement across this plan, PRD.md, ARCHITECTURE.md, and README.md plus passing existing quality checks. No M14 UI, MQTT routing, schema changes, or broad V1 refactoring is authorized by this preparation.

## M14 — Buildings Experience Foundation

- **Status:** Implemented and verified (2026-10-03). See `docs/M14_VERIFICATION.md` for evidence.
- **Purpose:** Establish the multi-building frontend/navigation foundation needed by later Building Details, floor, zone, device, telemetry, analytics, maintenance, and AI features. Those later capabilities are not M14 scope.
- **Dependencies:** Completed V1 M0–M13; the pre-M14 decisions in ARCHITECTURE.md; existing hierarchy read APIs. Preserve the recorded environment limitations in V1 verification evidence.
- **Functionality:** Add `/buildings` with a production-style, responsive Buildings page loaded through existing `GET /buildings`. Show real-looking imagery from frontend/static assets, with a deterministic UUID/code mapping and a generic fallback for unknown buildings. Imagery is illustrative, not evidence of a real monitored site. Backend image persistence is not required. Show names/codes and only summaries supported by trusted existing hierarchy, telemetry, or alert data; missing, stale, or ambiguously attributable data must remain unknown/unavailable, never healthy by default. Do not invent health scores or treat list order as operational status.
- **Navigation:** Cards link using the building UUID to `/buildings/:buildingId`. Provide a minimal read-only destination that validates the route identity through existing `GET /buildings/{building_id}`, shows the selected building identity, and supports return navigation. Full Building Details is deferred. No arbitrary fallback for malformed or missing IDs or a 404.
- **Selection:** Remove the demo-name and first-building selection assumptions in `frontend/src/hooks/useDashboardData.ts` wherever shared use affects multi-building navigation. Pages needing a building use route parameter → validated building query → feature/page state. Preserve Dashboard and all V1 pages; retain their demo context explicitly (for example, resolve the unique configured demo building code to its UUID), never by display name or array index. No new global state library; persistent cross-route selection requires a later demonstrated need.
- **Files/modules expected:** Routes/navigation, Buildings page/cards and query hooks, static imagery, focused tests, and minimal shared-hook changes required by explicit identity. `frontend/src/features/buildings/` may be introduced if useful; retain working V1 locations and create no empty folders or speculative feature trees.
- **Database changes:** None. No new schema, lifecycle fields, cascade changes, or image storage.
- **API/events:** Consume existing building list/detail and hierarchy reads; existing telemetry/alert reads only where attribution is safe. Preserve all HTTP, MQTT V1, WebSocket, simulator, analytics, alert, and AI contracts. Centralize WebSocket handling in the existing realtime provider. No V2 MQTT implementation in M14.
- **States:** Loading, empty list, recoverable query error, invalid identity/not found, missing imagery, and unavailable operational data; responsive cards/navigation at desktop and narrow mobile widths. Preserve simulated-data labeling.
- **Excluded:** Building create/edit/delete; destructive Building/Floor/Zone/Device actions; floor plans; full Building Details; work orders; predictive maintenance; ML; anomaly detection; user management; multi-agent architecture; new telemetry infrastructure; arbitrary backend schema additions; broad refactors and mass file moves.
- **Focused tests:** Buildings response rendering and loading/empty/error/retry; UUID card links and validated destination including malformed ID/404; two buildings with reordered responses and duplicate display names; explicit V1 demo context without first-item fallback; image fallback; missing/stale/ambiguous summary data; preservation of existing Dashboard/V1 routes and realtime behavior. Review desktop/mobile layout. Tests use deterministic fixtures, no paid provider or equipment.
- **Acceptance criteria:** `/buildings` uses real API data and static imagery; each card opens the correct UUID destination regardless of list order/name; no name/index/arbitrary fallback drives active building selection; supported summaries remain attributable and missing data is explicit; all required states and responsive layout are reviewed; no destructive controls, new infrastructure/schema, or MQTT routing changes are introduced; existing V1 flows remain functional; focused tests and backend/frontend/simulator quality checks pass.

Later V2 milestones are deliberately unscheduled. Before implementation, each needs explicit scope, dependencies, acceptance criteria, and tests in this plan. V2 telemetry migration must precede telemetry for additional buildings with repeated zone codes. The first future hierarchy-management milestone must implement archival and history safeguards before exposing lifecycle mutations.

## M15 — Building Details

- **Status:** Implemented and verified (2026-10-04); see `docs/M15_VERIFICATION.md`. M16 is not started.
- **Dependencies:** Completed and verified M14.
- **Scope:** UUID-based building details, shared M14 imagery, trusted hierarchy counts, nested Floor → Zone → Device presentation, and minimal safe floor/zone navigation destinations. Read-only existing APIs; no telemetry, AI, transport, schema, CRUD, or floor-plan changes.
- **Acceptance criteria:** Validated route UUID selects exactly that building; header and imagery match the portfolio; floors, zones, and devices retain validated parent identity; counts use successful API results; floor/zone/back links use canonical IDs; loading, invalid ID, 404, partial failures with retry, and empty hierarchy states are explicit; responsive accessible layout; focused M15 tests and all existing frontend/backend/simulator checks pass.
- **Canonical routes:** `/buildings/:buildingId`, `/buildings/:buildingId/floors/:floorId`, `/zones/:zoneId`. Floor and zone destinations are context shells only; deeper experiences remain deferred to M16+.

## M16 — Floor & Zone Details

- **Status:** Implemented and verified (2026-10-04); see `docs/M16_VERIFICATION.md`. Depends on verified M15; M17 is not started.
- **Scope:** Validated floor and zone detail pages, UUID-scoped hierarchy/devices/active alerts, current telemetry through the existing provider, and a UUID device destination shell. Existing APIs only; no backend/schema/transport/AI changes, floor plans, CRUD, or analytics dashboard.
- **Acceptance criteria:** Validate route and parent identities without fallback; direct zone reload resolves trusted parents; floor zones/device counts and zone devices/alerts cannot leak across scope; REST-initialized provider readings update through the shared WebSocket; simulated labels and explicit source age/freshness/missing values; localized retries and loading/empty/error states; canonical back/zone/device links; responsive/accessibility review at 1440/820/390px; focused tests and all backend/simulator/frontend checks pass.
- **Telemetry semantics:** Existing live monitor has no freshness threshold. M16 uses a documented 30-second source-timestamp freshness threshold, reevaluated every five seconds. Legacy code-keyed telemetry is displayed only for the uniquely resolved `DEMO-BLDG-01` building and a unique zone code within its returned hierarchy. Additional-building telemetry remains unavailable until V2 transport migration.
- **Routes:** `/buildings/:buildingId/floors/:floorId`, `/zones/:zoneId`, `/devices/:deviceId` (database UUID; shell only).

## M17 — Device Details

- **Status:** Implemented and verified (2026-10-04); see `docs/M17_VERIFICATION.md`. Depends on verified M16; M18 is not started.
- **Scope:** UUID Device Details, independently resolved Zone → Floor → Building context, type-aware emphasis of zone conditions, compact latest-10 zone history, scoped zone alerts, and canonical breadcrumbs. Add only the missing read-only device UUID endpoint using the existing DeviceResponse.
- **Available model fields:** `id`, `zone_id`, `name`, `device_id`, `device_type` (ENVIRONMENT_SENSOR/OCCUPANCY_SENSOR/ENERGY_METER/HVAC_UNIT), `created_at`. No heartbeat/connectivity, manufacturer, firmware, or sensor ownership fields.
- **Acceptance criteria:** Exact UUID identity/404/invalid/mismatch handling; direct reload resolves trusted parents; current/history/alerts remain zone-scoped with no false device ownership/connectivity; reuse M16 freshness and provider without a second socket; real metadata/type emphasis/breadcrumbs; stable loading/empty/local errors/retries; bounded history; focused frontend/backend tests and all checks pass; responsive/accessibility review at 1440/820/390px. No schema, MQTT, AI, CRUD, or M18 changes.

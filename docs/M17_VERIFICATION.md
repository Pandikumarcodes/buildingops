# M17 — Device Details

Verified 2026-10-04. M18 was not started. Existing V1/M14/M15/M16 changes were preserved.

## Model and backend read contract

The existing Device model/DeviceResponse has exactly `id`, `zone_id`, `name`, `device_id`, `device_type`, and `created_at`. Types are ENVIRONMENT_SENSOR, OCCUPANCY_SENSOR, ENERGY_METER, HVAC_UNIT. There are no connectivity, heartbeat, manufacturer, firmware, installation, battery, or sensor-ownership fields.

Added only `GET /devices/{device_id}`, where the parameter is the database UUID. The thin router uses `Session.get(Device, UUID)` and the existing DeviceResponse. Existing records return 200; unknown UUIDs return 404/Device not found; malformed UUIDs and human device identifiers return FastAPI 422. No writes, generic management abstraction, model/schema change, or migration.

## Delivered experience

- `/devices/:deviceId` validates syntax before querying, normalizes UUID query identity, and rejects a response UUID mismatch or malformed zone UUID. Direct reload does not use previous-page state or list/name/human-identifier selection.
- Device identity independently resolves its zone through `getZone`; M16's `useZoneDetails` resolves exactly one parent floor/building using cached UUID hierarchy reads. Device Details disables that hook's device-list query to avoid fetching sibling devices unnecessarily.
- Header shows real name, device identifier/type, Configured, explicit Zone status, and simulated labeling. Device Information shows actual identifiers/type and trusted zone/floor/building context. Canonical breadcrumbs and the zone back link remain usable; failures retain loaded device identity.
- Current Zone Conditions reuses M16 Conditions, scope guard, 30-second freshness semantics, five-second clock, metric/source-age helpers, and the existing TelemetryProvider. Type-aware emphasis highlights environmental, occupancy, energy, or HVAC fields while retaining full zone context.
- **Current telemetry shown on Device Details is zone-level operational context, not guaranteed device-sourced telemetry.** The UI explicitly says so. It uses Current Zone Conditions, Recent Zone Telemetry, and Zone Alerts rather than device telemetry/alerts. Zone Live/Zone Stale/No Zone Telemetry/Zone Alert never claims device online/offline state.
- Legacy code-keyed current readings remain attributable only to the unique demo building and uniquely matching zone hierarchy. UUID-scoped persisted history remains available independently of legacy current-attribution support.
- Recent history requests the existing zone telemetry endpoint with `limit=10`, validates every returned row's zone UUID/source timestamp, and renders at most ten newest-first rows. The existing client's default limit remains 100 for V1 consumers. No chart/dashboard or fake readings.
- The labeled table has scoped column/row headers, caption, and a focusable scroll panel with visible focus. Mobile scrolling stays inside the table panel rather than overflowing the page.
- Zone Alerts filters the shared active-alert query by selected zone UUID, reuses seven-second polling/latest-100 saturation handling, and exposes no mutations. No active zone alerts is displayed only when the result is not saturated.
- Stable identity/parent/current/history/alert skeletons; invalid UUID, 404, response mismatch; empty history/alerts/missing readings; localized parent/current/history/alert errors with retries. Secondary failures retain metadata and usable sections.
- Vite now proxies JSON requests under `/devices` while returning the SPA for HTML navigation, so direct route reload works alongside the new endpoint.

## Focused tests

25 new Device Details cases cover exact UUID/direct parent reload/metadata, invalid UUID/404/identity and parent mismatch, trusted hierarchy and canonical breadcrumbs/back navigation, parent/history/alert/current-source failures and retry, zone-level labels, all four type emphasis variants, absent sensor values, empty history/alerts/readings, foreign history/alert exclusion, ten-row bound, legacy other-building guard, source freshness, and real shared-provider REST/WebSocket updates with exactly one connection.

One API client case verifies the device UUID endpoint and limit-10 zone history. Four backend cases verify actual persisted identity/parent/type/exact response fields, unknown UUID 404, and two malformed/human-identifier 422 cases. M16's device navigation test now expects the real Device Details header/metadata and supplies the new API/history fixtures; no existing assertions/tests were disabled.

An initial test fixture expected No Zone Telemetry while retaining an active zone alert; it was corrected to test the intended no-alert condition while preserving M16's Alert priority. All final checks below passed.

## Automated verification

| Application | Command | Result |
|---|---|---|
| Backend | `uv run pytest` | PASS — 71 tests |
| Backend | `uv run ruff check .` | PASS |
| Backend | `uv run ruff format --check .` | PASS — 43 files |
| Backend | `uv run mypy app` | PASS — 27 source files |
| Simulator | `uv run pytest` | PASS — 11 tests |
| Simulator | `uv run ruff check src tests` | PASS |
| Simulator | `uv run ruff format --check src tests` | PASS — 8 files |
| Simulator | `uv run mypy src` | PASS — 6 source files |
| Frontend | `npm run test` | PASS — 119 tests across 18 files |
| Frontend | `npm run lint` | PASS — no warnings |
| Frontend | `npm run typecheck` | PASS |
| Frontend | `npm run build` | PASS |
| Repository | `git diff --check` | PASS |

The existing backend Starlette/httpx deprecation warning remains. The existing frontend two-worker cap was retained. Frontend verification used approved outside-sandbox execution where required by the known configuration-access restriction; checks were not suppressed.

## Browser and accessibility review

Headless Edge against Vite with explicitly synthetic API fixtures, direct device navigation and a second independent direct reload:

| Width | Overview columns | History rows | Breadcrumb links | h1 | Page overflow |
|---|---|---|---|---|---|
| 1440px | 2 | 10 | 4 correct UUID targets | 1 | None |
| 820px | 1 | 10 | 4 correct UUID targets | 1 | None |
| 390px | 1 | 10 | 4 correct UUID targets | 1 | None |

Desktop and mobile screenshots were visually inspected. Breadcrumbs wrap, sections stack, telemetry remains readable, and the history table scrolls locally. Real links/buttons, shared visible focus states, table labels/header scopes, text status, logical headings, and clear error/empty states were reviewed. Temporary review harness/screenshots/profile are in ignored `.tmp/`; no application records were written.

## Acceptance and deferred scope

PASS: exact device UUID validation and read endpoint; independent trusted parents; actual metadata/type emphasis; honest zone telemetry/status/history/alert ownership; safe scope and legacy guard; bounded history; shared realtime without another socket; canonical navigation; loading/empty/partial errors/retry; responsive/accessibility review; all V1/M14–M16 regressions and required checks.

No database migration/schema change. No MQTT or WebSocket transport change. No AI change.

Deferred to M18+: per-device telemetry ownership/schema, heartbeat/connectivity, device CRUD, firmware/configuration/calibration, maintenance/work orders/predictions, device-level alert association, floor plans/maps, full analytics, lifecycle/archive workflows, MQTT V2, AI, users/access, and settings.

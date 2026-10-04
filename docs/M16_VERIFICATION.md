# M16 — Floor & Zone Details

Verified 2026-10-04. M17 was not started. Existing uncommitted V1/M14/M15 work was preserved.

## Implementation and contracts

- Floor Details validates both route UUIDs and verifies the selected floor belongs to the returned building. Floor number/name, building context, zone count, device count, and safely attributable fresh-telemetry count use existing API/provider data.
- Zone cards show only selected-floor zones, with device count, temperature, CO₂, occupancy, HVAC state, source update age, deterministic status, and zone navigation. Device requests are limited to those zones and reuse M15's per-zone query keys.
- Zone Details uses the already-existing `GET /zones/{zone_id}` endpoint, with a new centralized client wrapper. The response UUID and parent floor UUID are validated. Parent discovery uses the cached building list and floor lists, matching exactly one floor UUID; no route history, list position, code, or name selects a parent.
- Zone parent discovery requires one floor-list read per building because the current zone response has only `floor_id`. This is acceptable for the local MVP and reuses existing query caches; no backend parent/aggregation endpoint was added. Failed/ambiguous parent discovery stays unavailable while identity, devices, and UUID-scoped alerts remain usable.
- Current Conditions shows temperature/humidity/CO₂/occupancy/zone kW; HVAC shows state/setpoint/HVAC kW. Missing/non-finite values display dashes. Freshness and displayed update time use source timestamps.
- Devices display only model identifiers, name, and type. They make no individual connection-state claim. Links use database UUIDs at `/devices/:deviceId`; the minimal shell validates syntax, provides identity/navigation, and marks Device Details as upcoming. There is no device-detail endpoint or existence claim.
- Active alerts reuse `useAlerts('ACTIVE')`, the existing seven-second polling cadence, and the latest-100 bound. Floor alerts are filtered by returned zone UUIDs; zone alerts by its UUID. Saturated responses are explicitly potentially incomplete and cannot prove absence. No alert lifecycle mutations.
- Identity/header/summary/zone/device/alert skeletons, safe invalid UUID/404/mismatch states, empty states, and local retryable secondary errors preserve useful page sections.
- Canonical routes remain `/buildings/:buildingId`, `/buildings/:buildingId/floors/:floorId`, `/zones/:zoneId`; the added foundation is `/devices/:deviceId` using database UUIDs.

## Realtime and freshness

M16 consumes the existing TelemetryProvider/useTelemetry. The provider remains the single latest-state source and the only WebSocket owner; it initializes from REST and accepts snapshots/events. No provider/transport change, browser MQTT, or page socket was introduced.

V1 telemetry is code-keyed and demo-only. Attribution requires the uniquely identified `DEMO-BLDG-01` building, a unique matching zone code in its complete building hierarchy, matching zone/floor UUIDs, and matching sample code. Additional buildings and repeated/ambiguous codes get no attributed reading. This preserves the pre-M14 migration gate rather than treating V1 data as multi-building telemetry.

No prior live-monitor freshness threshold existed. M16 defines a 30-second UI source-age threshold with five-second clock reevaluation. Alert takes priority; otherwise a valid, non-future source timestamp within the threshold is Live, older/invalid/future timestamps are Stale, and absent readings are No telemetry. Live describes reading freshness, not WebSocket or device connectivity. The existing shared age helper is reused; its invalid-time fallback and the metric helper's absent-value handling were hardened without changing valid V1 display behavior.

## Focused tests

31 M16 UI/domain cases plus one client case were added:

- Floor rendering/route identity, reversed floor ordering, exact floor zone/device counts, scoped current telemetry/alerts, invalid IDs, 404, mismatch, secondary errors/retry, empty floor/no telemetry, and zone/back navigation.
- Direct zone identity/parent reload, mismatched/404/invalid UUIDs, conditions/HVAC/source age/missing values, empty devices/telemetry/alerts, foreign-device rejection, cross-zone alert exclusion, parent/device/alert partial failures and retries, and UUID device-shell navigation.
- Other-building/repeated-code/ambiguous-demo/sample-code attribution rejection; status priority and threshold boundary; idle-clock freshness transition; shared-context reading updates; real TelemetryProvider REST initialization and WebSocket updates on both Floor and Zone with exactly one connection; saturated-alert absence handling.
- M15 tests now provide a shared telemetry context and existing API fixtures for operational destinations, retaining identity/hierarchy/navigation assertions. No tests/assertions were disabled.

## Automated verification

| Application | Command | Result |
|---|---|---|
| Backend | `uv run pytest` | PASS — 67 tests |
| Backend | `uv run ruff check .` | PASS |
| Backend | `uv run ruff format --check .` | PASS — 42 files |
| Backend | `uv run mypy app` | PASS — 26 source files |
| Simulator | `uv run pytest` | PASS — 11 tests |
| Simulator | `uv run ruff check src tests` | PASS |
| Simulator | `uv run ruff format --check src tests` | PASS — 8 files |
| Simulator | `uv run mypy src` | PASS — 6 source files |
| Frontend | `npm run test` | PASS — 93 tests across 17 files |
| Frontend | `npm run lint` | PASS — no warnings |
| Frontend | `npm run typecheck` | PASS |
| Frontend | `npm run build` | PASS |
| Repository | `git diff --check` | PASS |

The first new test run exposed a clock-test problem; it was corrected to drive the installed clock callback deterministically. TypeScript's DOM/Node interval overload required a test-harness return-type cast. A React fast-refresh warning was fixed by keeping the shared clock hook in the data module. All final checks passed. Sandbox esbuild configuration access failures required approved outside-sandbox reruns. Existing backend Starlette/httpx deprecation warning remains. The M15 two-worker test cap remains unchanged.

## Browser review

Headless Edge used synthetic API fixtures against Vite. Direct Floor and Zone navigation loaded initial REST telemetry without waiting for a socket event. Direct device-shell reload passed. The disposable harness/screenshots/profile are in ignored `.tmp/`; no application records were written.

| Page | Width | Grid columns | Scoped content | h1 count | Horizontal overflow |
|---|---|---|---|---|---|
| Floor | 1440px | 3 | 3 zones / 12 devices | 1 | None |
| Floor | 820px | 2 | 3 zones / 12 devices | 1 | None |
| Floor | 390px | 1 | 3 zones / 12 devices | 1 | None |
| Zone | 1440px | 3 devices | 4 devices | 1 | None |
| Zone | 820px | 2 devices | 4 devices | 1 | None |
| Zone | 390px | 1 device | 4 devices | 1 | None |

Desktop/mobile screenshots of both pages were visually inspected. Layouts preserve readable conditions, stacked mobile cards, hierarchy context, and back navigation. Real links/buttons, shared visible focus styling, text status labels, logical headings, and definition-list telemetry labels were reviewed.

## Acceptance and deferred scope

PASS: exact UUID/parent selection; direct-zone parent context; Floor → Zone → Device/alert isolation; current provider telemetry and source freshness; missing/empty/loading/partial-error/retry states; canonical navigation and device foundation; responsive/accessibility review; preserved V1/M14/M15 regressions; all requested checks; scope boundaries.

No backend changes. No database migration/schema change. No MQTT or WebSocket transport changes. No AI changes.

Deferred to M17+: Device Details, floor plans/maps/coordinates/heatmaps/drag-drop, historical analytics previews/dashboards, alert mutations, work orders/maintenance/predictions, CRUD/archival, access/settings, MQTT V2 migration, and AI additions.

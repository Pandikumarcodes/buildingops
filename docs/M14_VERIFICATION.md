# M14 — Buildings Experience Foundation

Verified 2026-10-03. M15 was not started. Existing pre-M14 documentation edits were preserved.

## Delivered behavior

- `/buildings` loads the existing list with TanStack Query; each card independently caches its UUID-scoped floors/zones reads. No devices, alerts, or legacy telemetry are fetched for portfolio summaries.
- Cards show name, code, local illustrative commercial photography, trusted floor/zone counts, neutral unavailable operational status, and an accessible View Building link.
- Total Buildings derives only from the successful list response. Failed counts remain unavailable; zero is shown only for a successful empty hierarchy response.
- UUID navigation goes to the minimal detail destination: syntax validation, server identity validation, loading, 404, generic error/retry, and return link. No name/index/fallback selection.
- V1 context resolves the unique seeded `DEMO-BLDG-01` code regardless of order or name. Missing/ambiguous matches produce the existing empty state, never another building. Legacy Dashboard aggregation and AI/alerts context remain V1 behavior; future portfolio telemetry requires the approved migration.
- Skeleton grid, purposeful empty state, safe retryable errors, image-to-SVG-to-text fallback, simulated-data labels, and visible keyboard focus.
- Existing routes remain enabled. Buildings is enabled. Predictive Maintenance, Reports, Users & Access, Settings are disabled planned items; HVAC remains available.
- Vite distinguishes HTML navigation under `/buildings` from API requests, enabling direct route reloads without changing REST paths.

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
| Frontend | `npm run test` | PASS — 41 tests across 15 files |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm run typecheck` | PASS |
| Frontend | `npm run build` | PASS |
| Repository | `git diff --check` | PASS |

The backend emitted an existing Starlette/httpx deprecation warning. No checks were suppressed. The Energy fixture's building code was corrected to the actual seed code while preserving its assertions. App tests now explicitly clean up between cases.

## Browser and layout review

Headless Microsoft Edge against Vite with deterministic building/hierarchy API fixtures:

| Viewport | Grid | Images | Document overflow |
|---|---|---|---|
| 1440 × 1000 | 3 columns | Loaded | None |
| 820 × 1100 | 2 columns | Loaded | None |
| 390 × 1000 | 1 column | Loaded | None |

Desktop/mobile screenshots were visually inspected. The check caught and fixed sidebar minimum-width overflow. Correct UUID card navigation and direct detail reload passed. Browser fixtures are explicitly synthetic test data; they do not add buildings to the application database. The Windows capture helper failed to initialize (`CreateProcessWithLogonW failed: 2`); headless review completed instead. Historical V1 Docker/manual-provider limitations remain recorded in the existing verification documentation.

## Acceptance

All M14 criteria PASS: real API consumption/static imagery; UUID destination independent of order/name; explicit demo context without arbitrary selection; attributable hierarchy counts and unknown operational state; required loading/empty/error/identity/image states; responsive layout/accessibility review; preserved V1 tests; full quality checks; no destructive controls, backend/schema changes, infrastructure additions, or MQTT/realtime changes.

Full Building Details, hierarchy mutations, archival safeguards, portfolio telemetry/status, and V2 MQTT migration are deferred. No M15 work is implemented.

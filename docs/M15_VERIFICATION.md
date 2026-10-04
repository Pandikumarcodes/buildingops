# M15 — Building Details

Verified 2026-10-04. M14 and existing uncommitted changes were preserved. M16 is not started.

## Delivered behavior

- `/buildings/:buildingId` validates UUID syntax before requesting anything, normalizes query identity, and verifies the returned building UUID. No list/name/code/index fallback selects a building.
- Header shows the actual name, code, UUID, simulated-data label, portfolio back link, and shared M14 illustrative image. `BuildingImage` now supplies identical primary/SVG/text fallbacks to cards and details.
- Summary uses existing floors, zones, and devices APIs. Unsuccessful counts remain unavailable; pending counts use skeletons; successful empty lists produce zero. Device lists and total reuse the same per-zone queries.
- Floors are sorted by floor number. Each floor groups its zones; each zone contains its devices with human identifiers, names, and type labels. Floor names/numbers/UUIDs and zone names/codes provide context.
- Floor parent IDs are checked against the route building. Zone IDs and floor membership are validated before requesting devices. Device UUIDs/zone membership are checked before display. Invalid parent responses produce localized retryable errors, never leaked rows.
- Header/summary/hierarchy skeletons, invalid ID/404/retry, independently recoverable floors/zones/devices errors, and empty floors/zones/devices states are covered. Header remains visible through hierarchy failures.
- Canonical routes: `/buildings/:buildingId`, `/buildings/:buildingId/floors/:floorId`, `/zones/:zoneId`. Floor shell validates both UUIDs and verifies floor membership. Zone shell validates syntax and shows the destination UUID only; it deliberately does not claim existence without a zone-detail API. Full floor/zone experiences remain deferred.
- Vite serves HTML navigation under `/zones` as well as `/buildings`; JSON requests retain the existing proxy. Direct zone reload was verified in Edge.
- One page h1, nested headings/lists, descriptive navigation labels, image alt text, shared visible focus styles, and 44px hierarchy links were reviewed. No heavy tree dependency or global state was added.

## Tests

20 new deterministic M15 cases cover exact UUID/duplicate-name context, route switching, identity/loading/404/invalid IDs, summary/images/fallbacks, nested hierarchy and per-zone device isolation, floor/zone parent mismatches, partial errors/retry, all empty states, canonical floor/zone/back navigation, floor membership, and invalid destination shells. M14's destination assertion now checks the actual building header. The App route fixture mocks the new hierarchy reads.

## Automated checks

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
| Frontend | `npm run test` | PASS — 61 tests across 16 files |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm run typecheck` | PASS |
| Frontend | `npm run build` | PASS |
| Repository | `git diff --check` | PASS |

The original unconstrained frontend runner passed initially, then hit async UI timeouts during later high-concurrency runs. The complete suite passed with two workers; the npm script now explicitly caps workers at two. No assertions/tests were removed or timeouts inflated. One sandbox rerun was denied configuration-directory access; the approved outside-sandbox rerun passed. Backend retains its existing Starlette/httpx deprecation warning.

## Browser review

Headless Edge against Vite with synthetic, explicitly simulated API fixtures (2 floors, 5 zones, 20 devices):

| Viewport | Floor columns | Hierarchy | Images | Horizontal overflow |
|---|---|---|---|---|
| 1440 × 1000 | 2 | 2 / 5 / 20 | Loaded | None |
| 820 × 1100 | 1 | 2 / 5 / 20 | Loaded | None |
| 390 × 1000 | 1 | 2 / 5 / 20 | Loaded | None |

Desktop and mobile screenshots were visually inspected. The Windows Computer Use runtime failed to initialize even after reset (`CreateProcessWithLogonW failed: 2`); headless Edge completed the review. The disposable review harness/screenshots/browser profile live in ignored `.tmp/`. These fixtures did not write application database records.

## Acceptance

PASS: explicit UUID identity and no fallback; shared imagery/header; trusted scoped counts; nested Building → Floor → Zone → Device; canonical navigation and minimal shells; loading/empty/error/retry states; responsive/accessibility review; preserved M14/V1 tests; all requested checks; no backend/database/MQTT/realtime/AI changes or out-of-scope functionality.

Deferred: floor plans/maps/heatmaps, deeper floor/zone/device monitoring, history charts, health/efficiency predictions, maintenance/work orders, CRUD/archival, alert management, access/settings, MQTT V2 migration, and AI extensions.

# BuildingOps Agent and Engineering Rules

## Project intent

BuildingOps is an interview-ready, local-first MVP for a building/facility engineer. It monitors a simulated commercial building, stores and analyzes telemetry, detects three specified operating conditions, and lets an AI assistant investigate using controlled application tools. The requirements in `PRD.md`, architecture and risk decisions in `ARCHITECTURE.md`, and ordered delivery scope in `PLAN.md` are authoritative.

## Scope boundaries

- Implement only the MVP capabilities and demo scenarios defined in `PRD.md`.
- Do not add billing, subscriptions, complex authentication/RBAC, Kubernetes, microservices, Kafka, Redis without a demonstrated need, mobile apps, maintenance ERP, hardware firmware, BACnet, Modbus, predictive maintenance, ML models, RAG, or extra dashboards/CRUD.
- Do not begin a later milestone before its dependencies and acceptance criteria are met. Keep each milestone reviewable and small.
- Do not silently change thresholds, telemetry meaning, API contracts, or the chosen system boundaries. Record material changes in the relevant documents.
- Demo data is synthetic and must be labeled as simulated; never present it as live building data.

## Engineering rules

- Keep `frontend/` and `backend/` as clearly separated applications; keep the simulator separately identifiable and runnable.
- Frontend: React, TypeScript strict mode, Vite, React Router, TanStack Query, and Recharts. Keep network/state access out of presentation components where practical, show loading/empty/error states, and use typed API/event contracts.
- Backend: Python type hints, FastAPI, Pydantic validation, SQLAlchemy, Alembic, PostgreSQL, environment-based settings, modular domain/service boundaries, and meaningful HTTP/logging error handling.
- MQTT is the ingest boundary; the backend owns validation, persistence, alert evaluation, and publication of application events. WebSocket clients receive events through the backend, not directly from the broker.
- AI providers may only be given explicitly defined application tools. Tools call authorized services and return bounded, validated results; no model-generated SQL, direct database credentials, arbitrary code, or unrestricted database access.
- Never commit secrets. Provide safe examples in environment templates and validate required settings at startup.
- Use migrations for schema changes. Keep database access behind repositories/services where that makes domain logic testable; avoid generic abstraction layers without a concrete need.
- Add focused tests for business rules, validation, persistence behavior, API/event contracts, and key UI flows as described by the active milestone. Tests must use deterministic fixtures and must not require real building equipment or a paid AI provider.
- Keep dependencies minimal. Document local prerequisites, commands, assumptions, and limitations as implementation proceeds.

## Working agreement

- Before coding, identify the active milestone and its acceptance criteria in `PLAN.md`.
- Make changes within that milestone; update docs/contracts when implementation reveals a necessary decision.
- Do not claim a test or acceptance criterion passed unless it was actually run or reviewed.
- Preserve existing user changes and avoid destructive repository operations.

import type { Telemetry } from "../types/api";

export function StatusPill({
  telemetry,
}: {
  telemetry: Telemetry | undefined;
}) {
  if (!telemetry)
    return (
      <span className="status-pill status-pill--unknown">No telemetry</span>
    );
  return (
    <span
      className={`status-pill status-pill--${telemetry.hvac_status.toLowerCase()}`}
    >
      HVAC {telemetry.hvac_status}
    </span>
  );
}

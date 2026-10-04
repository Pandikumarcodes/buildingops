export function metric(value: number | undefined, unit: string, digits = 1): string {
  return typeof value !== 'number' || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)} ${unit}`
}

export function telemetryAge(timestamp: string | undefined): string {
  if (!timestamp) return 'No telemetry yet'
  if (!Number.isFinite(Date.parse(timestamp))) return 'Unknown update time'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

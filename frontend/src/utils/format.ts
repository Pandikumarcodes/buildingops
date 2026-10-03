export function metric(value: number | undefined, unit: string, digits = 1): string {
  return value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`
}

export function telemetryAge(timestamp: string | undefined): string {
  if (!timestamp) return 'No telemetry yet'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

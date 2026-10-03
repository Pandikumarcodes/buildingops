import type { AIChatResponse, Alert, AlertStatus, Building, Device, Floor, HistoricalTelemetry, Telemetry, Zone } from '../types/api'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`)
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const error = (await response.json()) as { detail?: unknown }
      if (typeof error.detail === 'string') detail = error.detail
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export const api = {
  listBuildings: () => get<Building[]>('/buildings'),
  listFloors: (buildingId: string) => get<Floor[]>(`/buildings/${buildingId}/floors`),
  listZones: (buildingId: string) => get<Zone[]>(`/buildings/${buildingId}/zones`),
  listDevices: (zoneId: string) => get<Device[]>(`/zones/${zoneId}/devices`),
  latestTelemetry: () => get<Record<string, Telemetry>>('/telemetry/latest'),
  zoneTelemetry: (zoneId: string) => get<HistoricalTelemetry[]>(`/zones/${zoneId}/telemetry?limit=100`),
  listAlerts: (status?: AlertStatus, limit = 100) => {
    const parameters = new URLSearchParams({ limit: String(limit) })
    if (status) parameters.set('status', status)
    return get<Alert[]>(`/alerts?${parameters}`)
  },
  chat: (message: string) => post<AIChatResponse>('/ai/chat', { message }),
}

export function websocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/telemetry`
}

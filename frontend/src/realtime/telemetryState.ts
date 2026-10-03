import type { Telemetry, WebSocketMessage } from '../types/api'

export function applyWebSocketMessage(
  current: Record<string, Telemetry>,
  message: WebSocketMessage,
): Record<string, Telemetry> {
  if (message.type === 'snapshot') return message.data
  return { ...current, [message.data.zone_id]: message.data }
}

export function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  if (!value || typeof value !== 'object' || !('type' in value) || !('data' in value)) return false
  return value.type === 'snapshot' || value.type === 'telemetry'
}

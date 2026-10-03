export interface Building {
  id: string
  name: string
  code: string
  created_at: string
}

export interface Floor {
  id: string
  building_id: string
  name: string
  floor_number: number
  created_at: string
}

export interface Zone {
  id: string
  floor_id: string
  name: string
  code: string
  created_at: string
}

export interface Device {
  id: string
  zone_id: string
  name: string
  device_id: string
  device_type: 'ENVIRONMENT_SENSOR' | 'OCCUPANCY_SENSOR' | 'ENERGY_METER' | 'HVAC_UNIT'
  created_at: string
}

export interface Telemetry {
  zone_id: string
  temperature: number
  humidity: number
  co2_ppm: number
  occupancy: number
  hvac_status: 'ON' | 'OFF'
  hvac_setpoint: number
  hvac_power_kw: number
  zone_power_kw: number
  timestamp: string
}

/** Persisted telemetry returned by the zone history API. */
export interface HistoricalTelemetry {
  id: string
  zone_id: string
  temperature: number
  humidity: number
  co2_ppm: number
  occupancy: number
  hvac_status: 'ON' | 'OFF'
  hvac_setpoint: number
  hvac_power_kw: number
  zone_power_kw: number
  recorded_at: string
}

export type AlertType = 'HIGH_CO2' | 'HIGH_TEMPERATURE' | 'HIGH_ZONE_POWER'
export type AlertStatus = 'ACTIVE' | 'RESOLVED'

export interface Alert {
  id: string
  zone_id: string
  zone_name: string
  floor_name: string
  alert_type: AlertType
  severity: 'WARNING'
  status: AlertStatus
  message: string
  trigger_value: number
  triggered_at: string
  resolved_at: string | null
}

export interface AIChatResponse {
  answer: string
  model: string
  grounded: boolean
  sources: string[]
}

export interface SnapshotMessage {
  type: 'snapshot'
  data: Record<string, Telemetry>
}

export interface TelemetryMessage {
  type: 'telemetry'
  data: Telemetry
}

export type WebSocketMessage = SnapshotMessage | TelemetryMessage
export type ConnectionStatus = 'connecting' | 'live' | 'disconnected'

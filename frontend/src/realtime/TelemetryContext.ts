import { createContext } from 'react'
import type { ConnectionStatus, Telemetry } from '../types/api'

export interface TelemetryContextValue {
  telemetryByZone: Record<string, Telemetry>
  connectionStatus: ConnectionStatus
  telemetryError: Error | null
}

export const TelemetryContext = createContext<TelemetryContextValue | undefined>(undefined)

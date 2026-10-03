import type { HistoricalTelemetry } from '../types/api'

export interface HistoryPoint {
  timestamp: string
  temperature: number | null
  co2Ppm: number | null
  occupancy: number | null
  zonePowerKw: number | null
  hvacPowerKw: number | null
}

export interface HistorySummary {
  averageTemperature?: number
  peakCo2?: number
  peakOccupancy?: number
  peakZonePower?: number
}

function finite(value: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The API returns newest first; keep equal timestamps in their received order. */
export function chronologicalHistory(records: HistoricalTelemetry[]): HistoryPoint[] {
  return records
    .map((record, index) => ({ record, index, time: Date.parse(record.recorded_at) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((left, right) => left.time - right.time || left.index - right.index)
    .map(({ record }) => ({
      timestamp: record.recorded_at,
      temperature: finite(record.temperature),
      co2Ppm: finite(record.co2_ppm),
      occupancy: finite(record.occupancy),
      zonePowerKw: finite(record.zone_power_kw),
      hvacPowerKw: finite(record.hvac_power_kw),
    }))
}

export function summarizeHistory(points: HistoryPoint[]): HistorySummary {
  const temperatures = points.flatMap((point) => point.temperature === null ? [] : [point.temperature])
  const co2 = points.flatMap((point) => point.co2Ppm === null ? [] : [point.co2Ppm])
  const occupancy = points.flatMap((point) => point.occupancy === null ? [] : [point.occupancy])
  const power = points.flatMap((point) => point.zonePowerKw === null ? [] : [point.zonePowerKw])
  return {
    averageTemperature: temperatures.length ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length : undefined,
    peakCo2: co2.length ? Math.max(...co2) : undefined,
    peakOccupancy: occupancy.length ? Math.max(...occupancy) : undefined,
    peakZonePower: power.length ? Math.max(...power) : undefined,
  }
}

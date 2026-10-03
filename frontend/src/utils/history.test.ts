import { describe, expect, it } from 'vitest'
import type { HistoricalTelemetry } from '../types/api'
import { chronologicalHistory, summarizeHistory } from './history'

function sample(id: string, recorded_at: string, values: Partial<HistoricalTelemetry> = {}): HistoricalTelemetry {
  return { id, zone_id: 'zone-1', temperature: 24, humidity: 50, co2_ppm: 800, occupancy: 0,
    hvac_status: 'OFF', hvac_setpoint: 23, hvac_power_kw: 0, zone_power_kw: 2,
    recorded_at, ...values }
}

describe('historical telemetry calculations', () => {
  it('orders newest-first records chronologically and retains duplicate timestamps', () => {
    const points = chronologicalHistory([
      sample('new', '2026-09-30T10:02:00Z', { temperature: 28 }),
      sample('duplicate-a', '2026-09-30T10:01:00Z', { temperature: 25 }),
      sample('duplicate-b', '2026-09-30T10:01:00Z', { temperature: 26 }),
      sample('old', '2026-09-30T10:00:00Z', { temperature: 22 }),
    ])
    expect(points.map((point) => point.temperature)).toEqual([22, 25, 26, 28])
  })

  it('computes averages and peaks while keeping valid zero values', () => {
    const points = chronologicalHistory([
      sample('later', '2026-09-30T10:01:00Z', { temperature: 26, co2_ppm: 1200, occupancy: 8, zone_power_kw: 10, hvac_power_kw: 0 }),
      sample('earlier', '2026-09-30T10:00:00Z', { temperature: 22, co2_ppm: 600, occupancy: 0, zone_power_kw: 0 }),
    ])
    expect(summarizeHistory(points)).toEqual({ averageTemperature: 24, peakCo2: 1200, peakOccupancy: 8, peakZonePower: 10 })
    expect(points[0].occupancy).toBe(0)
    expect(points[1].hvacPowerKw).toBe(0)
  })

  it('omits invalid timestamps and numeric values without producing NaN', () => {
    const points = chronologicalHistory([
      sample('invalid-time', 'not-a-date'),
      sample('valid', '2026-09-30T10:00:00Z', { temperature: Number.NaN, co2_ppm: Number.POSITIVE_INFINITY, occupancy: 0, zone_power_kw: Number.NaN }),
    ])
    expect(points).toHaveLength(1)
    expect(points[0].temperature).toBeNull()
    expect(summarizeHistory(points)).toEqual({ averageTemperature: undefined, peakCo2: undefined, peakOccupancy: 0, peakZonePower: undefined })
    expect(summarizeHistory([])).toEqual({ averageTemperature: undefined, peakCo2: undefined, peakOccupancy: undefined, peakZonePower: undefined })
  })
})

import { describe, expect, it } from 'vitest'
import { aggregateBuildingPower, highestDemandZone, hvacSharePercent, nonHvacPower, totalBuildingPower, totalHvacPower } from './energy'
import type { HistoricalTelemetry, Telemetry, Zone } from '../types/api'

const current = [
  { zone_id: 'A', zone_power_kw: 3.2, hvac_power_kw: 1.5 },
  { zone_id: 'B', zone_power_kw: 2.8, hvac_power_kw: 0.5 },
] as Telemetry[]

const zones = [
  { id: 'zone-a', floor_id: 'floor-1', name: 'Reception', code: 'A', created_at: '' },
  { id: 'zone-b', floor_id: 'floor-1', name: 'Office', code: 'B', created_at: '' },
] as Zone[]

function history(zoneId: string, power: number, recordedAt: string): HistoricalTelemetry {
  return { id: `${zoneId}-${recordedAt}`, zone_id: zoneId, temperature: 22, humidity: 45, co2_ppm: 500, occupancy: 2, hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 1, zone_power_kw: power, recorded_at: recordedAt }
}

describe('energy calculations', () => {
  it('calculates current building, HVAC, non-HVAC power and share', () => {
    expect(totalBuildingPower(current)).toBe(6)
    expect(totalHvacPower(current)).toBe(2)
    expect(nonHvacPower(6, 2)).toBe(4)
    expect(hvacSharePercent(6, 2)).toBeCloseTo(33.333)
  })

  it('handles missing, invalid, and zero telemetry safely', () => {
    expect(totalBuildingPower([{ zone_id: 'A', zone_power_kw: Number.NaN, hvac_power_kw: Number.NaN }])).toBe(0)
    expect(nonHvacPower(1, 2)).toBe(0)
    expect(hvacSharePercent(0, 0)).toBe(0)
    expect(highestDemandZone(zones, {})).toBeUndefined()
  })

  it('selects the human-readable highest demand zone', () => {
    expect(highestDemandZone(zones, { A: current[0], B: current[1] })).toEqual({ name: 'Reception', powerKw: 3.2 })
  })

  it('turns newest-first histories into chronological, aligned building snapshots', () => {
    const result = aggregateBuildingPower([
      [history('zone-a', 5, '2026-09-29T10:00:11Z'), history('zone-a', 2, '2026-09-29T10:00:09Z'), history('zone-a', 1, '2026-09-29T10:00:01Z')],
      [history('zone-b', 4, '2026-09-29T10:00:08Z'), history('zone-b', 3, '2026-09-29T10:00:01Z')],
    ])
    expect(result).toEqual([
      { timestamp: '2026-09-29T10:00:00.000Z', powerKw: 6 },
      { timestamp: '2026-09-29T10:00:10.000Z', powerKw: 5 },
    ])
  })
})

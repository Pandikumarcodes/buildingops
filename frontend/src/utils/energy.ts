import type { HistoricalTelemetry, Telemetry, Zone } from '../types/api'

type PowerTelemetry = Pick<Telemetry, 'zone_id' | 'hvac_power_kw' | 'zone_power_kw'>

export interface HighestDemandZone {
  name: string
  powerKw: number
}

export interface BuildingPowerPoint {
  timestamp: string
  powerKw: number
}

const BUCKET_MS = 10_000

function finitePower(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function cleanPower(value: number): number {
  return Math.abs(value) < 0.000_001 ? 0 : value
}

export function totalBuildingPower(telemetry: PowerTelemetry[]): number {
  return cleanPower(telemetry.reduce((total, item) => total + finitePower(item.zone_power_kw), 0))
}

export function totalHvacPower(telemetry: PowerTelemetry[]): number {
  return cleanPower(telemetry.reduce((total, item) => total + finitePower(item.hvac_power_kw), 0))
}

export function nonHvacPower(buildingPower: number, hvacPower: number): number {
  return cleanPower(Math.max(0, finitePower(buildingPower) - finitePower(hvacPower)))
}

export function hvacSharePercent(buildingPower: number, hvacPower: number): number {
  if (buildingPower <= 0 || !Number.isFinite(buildingPower)) return 0
  return (finitePower(hvacPower) / buildingPower) * 100
}

export function highestDemandZone(zones: Zone[], telemetryByZone: Record<string, Telemetry>): HighestDemandZone | undefined {
  return zones.reduce<HighestDemandZone | undefined>((highest, zone) => {
    const powerKw = finitePower(telemetryByZone[zone.code]?.zone_power_kw ?? Number.NaN)
    if (!telemetryByZone[zone.code] || (highest && highest.powerKw >= powerKw)) return highest
    return { name: zone.name, powerKw }
  }, undefined)
}

/**
 * Aligns asynchronous zone histories into 10-second snapshots. The simulator's
 * default cadence is five seconds; retaining the latest reading per zone in a
 * bucket avoids double-counting when a bucket contains adjacent samples.
 */
export function aggregateBuildingPower(histories: HistoricalTelemetry[][]): BuildingPowerPoint[] {
  const buckets = new Map<number, Map<string, HistoricalTelemetry>>()
  for (const history of histories) {
    for (const sample of history) {
      const time = new Date(sample.recorded_at).getTime()
      if (!Number.isFinite(time) || !Number.isFinite(sample.zone_power_kw)) continue
      const bucket = Math.floor(time / BUCKET_MS) * BUCKET_MS
      const readings = buckets.get(bucket) ?? new Map<string, HistoricalTelemetry>()
      const previous = readings.get(sample.zone_id)
      if (!previous || new Date(previous.recorded_at).getTime() < time) readings.set(sample.zone_id, sample)
      buckets.set(bucket, readings)
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timestamp, readings]) => ({
      timestamp: new Date(timestamp).toISOString(),
      powerKw: cleanPower([...readings.values()].reduce((total, item) => total + finitePower(item.zone_power_kw), 0)),
    }))
}

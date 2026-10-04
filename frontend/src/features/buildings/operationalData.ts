import { useEffect, useState } from 'react'
import type { Building, Telemetry, Zone } from '../../types/api'
import { sameId } from './useBuildingDetails'

export const TELEMETRY_FRESHNESS_MS = 30_000
export function useOperationalClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer) }, [])
  return now
}
// V1 samples identify zone codes, not UUIDs. Only the unique legacy demo context
// and a unique code within its complete hierarchy can be attributed safely.
export function canAttributeTelemetry(building: Building | undefined, buildings: Building[] | undefined, zones: Zone[] | undefined, zone: Zone) {
  const demo = buildings?.filter((item) => item.code === 'DEMO-BLDG-01') ?? []
  const matches = zones?.filter((item) => item.code === zone.code) ?? []
  return Boolean(building && demo.length === 1 && sameId(demo[0].id, building.id) && matches.length === 1 && sameId(matches[0].id, zone.id) && sameId(matches[0].floor_id, zone.floor_id))
}
export function scopedReading(building: Building | undefined, buildings: Building[] | undefined, zones: Zone[] | undefined, zone: Zone, readings: Record<string, Telemetry>) {
  if (!canAttributeTelemetry(building, buildings, zones, zone)) return undefined
  const reading = readings[zone.code]
  return reading?.zone_id === zone.code ? reading : undefined
}

export function zoneStatus(reading: Telemetry | undefined, hasAlert: boolean, now: number) {
  if (hasAlert) return 'Alert'
  if (!reading) return 'No telemetry'
  const time = Date.parse(reading.timestamp)
  return Number.isFinite(time) && time <= now && now - time <= TELEMETRY_FRESHNESS_MS ? 'Live' : 'Stale'
}

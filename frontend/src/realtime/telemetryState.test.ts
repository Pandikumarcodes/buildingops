import { describe, expect, it } from 'vitest'
import { applyWebSocketMessage } from './telemetryState'
import type { Telemetry } from '../types/api'

const reception: Telemetry = {
  zone_id: 'RECEPTION', temperature: 22.5, humidity: 45, co2_ppm: 550, occupancy: 3,
  hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 1.2, zone_power_kw: 2, timestamp: '2026-09-29T12:00:00Z',
}

describe('applyWebSocketMessage', () => {
  it('replaces state from a snapshot and updates only the matching zone for an event', () => {
    const snapshot = applyWebSocketMessage({}, { type: 'snapshot', data: { RECEPTION: reception } })
    const updated = applyWebSocketMessage(snapshot, { type: 'telemetry', data: { ...reception, temperature: 25 } })

    expect(snapshot.RECEPTION.temperature).toBe(22.5)
    expect(updated.RECEPTION.temperature).toBe(25)
    expect(Object.keys(updated)).toEqual(['RECEPTION'])
  })
})

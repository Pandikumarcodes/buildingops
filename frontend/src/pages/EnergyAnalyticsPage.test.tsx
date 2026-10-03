// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnergyAnalyticsPage } from './EnergyAnalyticsPage'
import { TelemetryProvider } from '../realtime/TelemetryProvider'
import type { Telemetry } from '../types/api'

const latest: Record<string, Telemetry> = {
  RECEPTION: { zone_id: 'RECEPTION', temperature: 24, humidity: 45, co2_ppm: 500, occupancy: 3, hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 1.5, zone_power_kw: 3.2, timestamp: '2026-09-29T10:00:10Z' },
  OFFICE: { zone_id: 'OFFICE', temperature: 22, humidity: 45, co2_ppm: 500, occupancy: 8, hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 0.5, zone_power_kw: 2.8, timestamp: '2026-09-29T10:00:10Z' },
}

class MockWebSocket {
  static instance: MockWebSocket
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) { void url; MockWebSocket.instance = this; queueMicrotask(() => this.onopen?.()) }
  close() { this.onclose?.() }
}

const building = [{ id: 'building-1', name: 'Demo Commercial Building', code: 'DEMO', created_at: '' }]
const floors = [{ id: 'floor-1', building_id: 'building-1', name: 'Ground Floor', floor_number: 0, created_at: '' }]
const zones = [
  { id: 'zone-1', floor_id: 'floor-1', name: 'Reception', code: 'RECEPTION', created_at: '' },
  { id: 'zone-2', floor_id: 'floor-1', name: 'Engineering Office', code: 'OFFICE', created_at: '' },
]
function response(data: unknown) { return Promise.resolve(new Response(JSON.stringify(data), { status: 200 })) }

function renderPage() {
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    if (input === '/buildings') return response(building)
    if (input.includes('/floors')) return response(floors)
    if (input.includes('/zones') && !input.includes('/telemetry')) return response(zones)
    if (input.includes('/devices')) return response([])
    if (input === '/telemetry/latest') return response(latest)
    if (input.includes('/zones/zone-1/telemetry')) return response([{ id: 'a', zone_id: 'zone-1', zone_power_kw: 3, recorded_at: '2026-09-29T10:00:09Z' }])
    if (input.includes('/zones/zone-2/telemetry')) return response([{ id: 'b', zone_id: 'zone-2', zone_power_kw: 2, recorded_at: '2026-09-29T10:00:08Z' }])
    throw new Error(`Unexpected request: ${input}`)
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><TelemetryProvider><EnergyAnalyticsPage /></TelemetryProvider></QueryClientProvider>)
}

describe('EnergyAnalyticsPage', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('renders discovered zones, current energy metrics, and the historical trend', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Energy Analytics' })).toBeInTheDocument())
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('6.0 kW')
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('2.0 kW')
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('4.0 kW')
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('Reception')
    expect(screen.getByText('Current Power by Zone')).toBeInTheDocument()
    expect(screen.getByText('Recent Building Power')).toBeInTheDocument()
  })

  it('updates the current energy summary from the shared websocket', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Energy summary')).toHaveTextContent('6.0 kW'))
    MockWebSocket.instance.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'telemetry', data: { ...latest.OFFICE, zone_power_kw: 4, hvac_power_kw: 2 } }) }))
    await waitFor(() => expect(screen.getByLabelText('Energy summary')).toHaveTextContent('7.2 kW'))
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('3.5 kW')
    expect(screen.getByLabelText('Energy summary')).toHaveTextContent('Engineering Office')
  })
})

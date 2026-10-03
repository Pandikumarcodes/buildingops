// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HVACMonitoringPage } from './HVACMonitoringPage'
import { TelemetryProvider } from '../realtime/TelemetryProvider'
import type { Telemetry } from '../types/api'

const latestTelemetry = {
  RECEPTION: { zone_id: 'RECEPTION', temperature: 25, humidity: 45, co2_ppm: 550, occupancy: 3, hvac_status: 'ON' as const, hvac_setpoint: 23, hvac_power_kw: 1.2, zone_power_kw: 2, timestamp: '2026-09-29T12:00:00Z' },
  OFFICE: { zone_id: 'OFFICE', temperature: 21.8, humidity: 44, co2_ppm: 500, occupancy: 8, hvac_status: 'OFF' as const, hvac_setpoint: 23, hvac_power_kw: 0, zone_power_kw: 1.3, timestamp: '2026-09-29T12:00:00Z' },
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

const building = [{ id: 'building-1', name: 'Demo Commercial Building', code: 'DEMO-BLDG-01', created_at: '' }]
const floors = [{ id: 'floor-1', building_id: 'building-1', name: 'Ground Floor', floor_number: 0, created_at: '' }]
const zones = [
  { id: 'zone-1', floor_id: 'floor-1', name: 'Reception', code: 'RECEPTION', created_at: '' },
  { id: 'zone-2', floor_id: 'floor-1', name: 'Engineering Office', code: 'OFFICE', created_at: '' },
  { id: 'zone-3', floor_id: 'floor-1', name: 'Conference Room', code: 'CONFERENCE', created_at: '' },
]

function response(data: unknown) { return Promise.resolve(new Response(JSON.stringify(data), { status: 200 })) }

function renderPage(telemetry: Record<string, Telemetry> = latestTelemetry) {
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    if (input === '/buildings') return response(building)
    if (input.includes('/floors')) return response(floors)
    if (input.includes('/zones') && !input.includes('/devices')) return response(zones)
    if (input.includes('/devices')) return response([])
    if (input === '/telemetry/latest') return response(telemetry)
    throw new Error(`Unexpected request: ${input}`)
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><TelemetryProvider><HVACMonitoringPage /></TelemetryProvider></QueryClientProvider>)
}

describe('HVACMonitoringPage', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('renders discovered zones, derived summary values, HVAC states, and temperature differences', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'HVAC Monitoring' })).toBeInTheDocument())
    expect(screen.getByText('Reception')).toBeInTheDocument()
    expect(screen.getByText('Engineering Office')).toBeInTheDocument()
    expect(screen.getByText('Conference Room')).toBeInTheDocument()
    expect(screen.getAllByText('Ground Floor')).toHaveLength(3)
    expect(screen.getByText('HVAC ON')).toBeInTheDocument()
    expect(screen.getByText('HVAC OFF')).toBeInTheDocument()
    expect(screen.getByText('+2.0 °C')).toBeInTheDocument()
    expect(screen.getByText('-1.2 °C')).toBeInTheDocument()
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('HVAC Units3')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('Units Running1')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('1.2 kW')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('23.4 °C')
  })

  it('retains zones without telemetry and updates the affected card and summary from the shared websocket', async () => {
    renderPage({ RECEPTION: latestTelemetry.RECEPTION })

    await waitFor(() => expect(screen.getAllByText('No telemetry yet')).toHaveLength(2))
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('HVAC Units3')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('Units Running1')

    MockWebSocket.instance.onmessage?.(new MessageEvent('message', { data: JSON.stringify({
      type: 'telemetry', data: { ...latestTelemetry.OFFICE, temperature: 24, hvac_status: 'ON', hvac_power_kw: 2.5 },
    }) }))

    await waitFor(() => expect(screen.getByText('+1.0 °C')).toBeInTheDocument())
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('Units Running2')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('3.7 kW')
    expect(screen.getByLabelText('HVAC summary')).toHaveTextContent('24.5 °C')
  })
})

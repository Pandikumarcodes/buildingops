// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { OverviewPage } from './OverviewPage'
import { TelemetryProvider } from '../realtime/TelemetryProvider'

const telemetry = {
  zone_id: 'RECEPTION', temperature: 22.5, humidity: 45, co2_ppm: 550, occupancy: 3,
  hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 1.2, zone_power_kw: 2, timestamp: '2026-09-29T12:00:00Z',
}

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) { void url; MockWebSocket.instances.push(this); queueMicrotask(() => this.onopen?.()) }
  close() { this.onclose?.() }
}

function response(data: unknown) { return Promise.resolve(new Response(JSON.stringify(data), { status: 200 })) }

describe('OverviewPage', () => {
  afterEach(() => { vi.restoreAllMocks(); MockWebSocket.instances = [] })

  it('renders discovered building, zone, and latest telemetry information', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input === '/buildings') return response([{ id: 'building-1', name: 'Demo Commercial Building', code: 'DEMO-BLDG-01', created_at: '' }])
      if (input.includes('/floors')) return response([{ id: 'floor-1', building_id: 'building-1', name: 'Ground Floor', floor_number: 0, created_at: '' }])
      if (input.includes('/zones')) return response([{ id: 'zone-1', floor_id: 'floor-1', name: 'Reception', code: 'RECEPTION', created_at: '' }])
      if (input.includes('/devices')) return response([{ id: 'device-1', zone_id: 'zone-1', name: 'Reception Sensor', device_id: 'ENV-REC-01', device_type: 'ENVIRONMENT_SENSOR', created_at: '' }])
      if (input === '/telemetry/latest') return response({ RECEPTION: telemetry })
      if (input === '/alerts?limit=100&status=ACTIVE') return response([{ id: 'alert-1', zone_id: 'zone-1', zone_name: 'Reception', floor_name: 'Ground Floor', alert_type: 'HIGH_CO2', severity: 'WARNING', status: 'ACTIVE', message: 'High CO₂ detected in Reception.', trigger_value: 1250, triggered_at: '2026-09-30T12:00:00Z', resolved_at: null }])
      throw new Error(`Unexpected request: ${input}`)
    }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><TelemetryProvider><OverviewPage /></TelemetryProvider></QueryClientProvider>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Demo Commercial Building' })).toBeInTheDocument())
    expect(screen.getByText('Reception')).toBeInTheDocument()
    expect(screen.getByText('22.5 °C')).toBeInTheDocument()
    expect(screen.getByText('3 people')).toBeInTheDocument()
    expect(screen.getByText('Active Alerts').nextElementSibling).toHaveTextContent('1')
  })
})

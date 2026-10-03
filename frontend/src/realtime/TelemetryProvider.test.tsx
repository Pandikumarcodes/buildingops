// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelemetryProvider } from './TelemetryProvider'
import { useTelemetry } from './useTelemetry'

const sample = { zone_id: 'RECEPTION', temperature: 22, humidity: 45, co2_ppm: 500, occupancy: 2, hvac_status: 'ON' as const, hvac_setpoint: 23, hvac_power_kw: 1, zone_power_kw: 2, timestamp: '2026-09-29T12:00:00Z' }

class MockWebSocket {
  static instance: MockWebSocket
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) { void url; MockWebSocket.instance = this; queueMicrotask(() => this.onopen?.()) }
  close() { this.onclose?.() }
}

function Probe() {
  const { connectionStatus, telemetryByZone } = useTelemetry()
  return <p>{connectionStatus}:{telemetryByZone.RECEPTION?.temperature ?? 'empty'}</p>
}

describe('TelemetryProvider', () => {
  afterEach(() => vi.restoreAllMocks())

  it('becomes live, handles its snapshot, and updates only the emitted zone', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><TelemetryProvider><Probe /></TelemetryProvider></QueryClientProvider>)

    await waitFor(() => expect(screen.getByText('live:empty')).toBeInTheDocument())
    MockWebSocket.instance.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'snapshot', data: { RECEPTION: sample } }) }))
    await waitFor(() => expect(screen.getByText('live:22')).toBeInTheDocument())
    MockWebSocket.instance.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'telemetry', data: { ...sample, temperature: 26 } }) }))
    await waitFor(() => expect(screen.getByText('live:26')).toBeInTheDocument())
  })
})

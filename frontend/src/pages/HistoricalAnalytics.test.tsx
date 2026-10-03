// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoricalTelemetry, Zone } from '../types/api'
import { HistoricalAnalytics } from './HistoricalAnalytics'

const zones: Zone[] = [
  { id: 'zone-1', floor_id: 'floor-1', name: 'Reception', code: 'RECEPTION', created_at: '' },
  { id: 'zone-2', floor_id: 'floor-1', name: 'Open Office', code: 'OPEN-OFFICE', created_at: '' },
]
const records: HistoricalTelemetry[] = [
  { id: 'new', zone_id: 'zone-1', temperature: 26, humidity: 50, co2_ppm: 1100, occupancy: 8, hvac_status: 'ON', hvac_setpoint: 23, hvac_power_kw: 2, zone_power_kw: 5, recorded_at: '2026-09-30T10:01:00Z' },
  { id: 'old', zone_id: 'zone-1', temperature: 22, humidity: 50, co2_ppm: 600, occupancy: 0, hvac_status: 'OFF', hvac_setpoint: 23, hvac_power_kw: 0, zone_power_kw: 2, recorded_at: '2026-09-30T10:00:00Z' },
]

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><HistoricalAnalytics zones={zones} /></QueryClientProvider>)
}

describe('HistoricalAnalytics', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('loads the first discovered zone, then requests the selected zone by UUID', async () => {
    const fetcher = vi.fn((input: string) => Promise.resolve(new Response(JSON.stringify(input.includes('zone-1') ? records : []), { status: 200 })))
    vi.stubGlobal('fetch', fetcher)
    renderSection()
    expect(screen.getByRole('heading', { name: 'Historical Analytics' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Reception' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Open Office' })).toBeInTheDocument()
    expect(screen.getByLabelText('Historical zone')).toHaveValue('zone-1')
    await waitFor(() => expect(screen.getByLabelText('Historical summary')).toHaveTextContent('24.0 °C'))
    expect(screen.getByLabelText('Historical summary')).toHaveTextContent('1100 ppm')
    expect(screen.getByLabelText('Historical summary')).toHaveTextContent('8 people')
    expect(screen.getByLabelText('Historical summary')).toHaveTextContent('5.0 kW')
    expect(fetcher).toHaveBeenCalledWith('/zones/zone-1/telemetry?limit=100')

    fireEvent.change(screen.getByLabelText('Historical zone'), { target: { value: 'zone-2' } })
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/zones/zone-2/telemetry?limit=100'))
    await waitFor(() => expect(screen.getByText('No historical telemetry available for this zone yet.')).toBeInTheDocument())
  })

  it('keeps loading and error states within the section', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))
    renderSection()
    expect(screen.getByRole('heading', { name: 'Historical Analytics' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Request failed (500)'))
  })
})

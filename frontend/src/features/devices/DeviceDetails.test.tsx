// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Alert, Building, Device, Floor, HistoricalTelemetry, Telemetry, Zone } from '../../types/api'
import { TelemetryContext, type TelemetryContextValue } from '../../realtime/TelemetryContext'
import { TelemetryProvider } from '../../realtime/TelemetryProvider'
import { DeviceDetailsPage } from './DeviceDetailsPage'

const id = (n: number) => `${n.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
const now = Date.parse('2026-10-04T12:00:00Z')
const building: Building = { id: id(1), name: 'Demo Commercial Building', code: 'DEMO-BLDG-01', created_at: '' }
const floor: Floor = { id: id(2), building_id: building.id, name: 'Ground floor', floor_number: 1, created_at: '' }
const zone: Zone = { id: id(3), floor_id: floor.id, name: 'Reception', code: 'REC', created_at: '' }
const device: Device = { id: id(4), zone_id: zone.id, name: 'Reception environmental sensor', device_id: 'ENV-REC-01', device_type: 'ENVIRONMENT_SENSOR', created_at: '' }
const reading: Telemetry = { zone_id: zone.code, temperature: 23.8, humidity: 46, co2_ppm: 610, occupancy: 18, hvac_status: 'ON', hvac_setpoint: 22, hvac_power_kw: 2.3, zone_power_kw: 4.2, timestamp: new Date(now - 8000).toISOString() }
const history: HistoricalTelemetry = { ...reading, id: id(5), zone_id: zone.id, temperature: 19.4, recorded_at: new Date(now - 60_000).toISOString() }
const alert: Alert = { id: id(6), zone_id: zone.id, zone_name: zone.name, floor_name: floor.name, alert_type: 'HIGH_CO2', severity: 'WARNING', status: 'ACTIVE', message: 'Reception air alert', trigger_value: 1300, triggered_at: new Date(now - 60_000).toISOString(), resolved_at: null }
const path = `/devices/${device.id}`

function setup(route = path, readings: Record<string, Telemetry> = { [zone.code]: reading }, realProvider = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
  let context: TelemetryContextValue = { telemetryByZone: readings, connectionStatus: 'live', telemetryError: null }
  const routes = <MemoryRouter initialEntries={[route]}><Routes><Route path="/devices/:deviceId" element={<DeviceDetailsPage />} /><Route path="/zones/:zoneId" element={<h1>Zone back destination</h1>} /><Route path="/buildings/:buildingId/floors/:floorId" element={<h1>Floor destination</h1>} /><Route path="/buildings/:buildingId" element={<h1>Building destination</h1>} /><Route path="/buildings" element={<h1>Buildings destination</h1>} /></Routes></MemoryRouter>
  const tree = () => <QueryClientProvider client={client}>{realProvider ? <TelemetryProvider>{routes}</TelemetryProvider> : <TelemetryContext.Provider value={context}>{routes}</TelemetryContext.Provider>}</QueryClientProvider>
  const view = render(tree())
  return { update: (next: Partial<TelemetryContextValue>) => { context = { ...context, ...next }; view.rerender(tree()) } }
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.spyOn(api, 'getDevice').mockResolvedValue(device)
  vi.spyOn(api, 'getZone').mockResolvedValue(zone)
  vi.spyOn(api, 'listBuildings').mockResolvedValue([building])
  vi.spyOn(api, 'listFloors').mockResolvedValue([floor])
  vi.spyOn(api, 'listZones').mockResolvedValue([zone])
  vi.spyOn(api, 'listDevices').mockResolvedValue([device])
  vi.spyOn(api, 'zoneTelemetry').mockResolvedValue([history])
  vi.spyOn(api, 'listAlerts').mockResolvedValue([alert, { ...alert, id: id(7), zone_id: id(99), message: 'Foreign zone alert' }])
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('M17 Device Details', () => {
  it('directly loads exact device identity and trusted metadata/hierarchy', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: device.name })).toBeInTheDocument()
    const metadata = within(screen.getByRole('region', { name: 'Device Information' }))
    expect(metadata.getByText(device.device_id)).toBeInTheDocument()
    expect(metadata.getByText('Environmental')).toBeInTheDocument()
    expect(await metadata.findByText(building.name)).toBeInTheDocument()
    expect(metadata.getByText('Floor 1: Ground floor')).toBeInTheDocument()
    expect(metadata.getByText(zone.name)).toBeInTheDocument()
    expect(api.getDevice).toHaveBeenCalledWith(device.id)
    expect(api.getZone).toHaveBeenCalledWith(zone.id)
    expect(api.listDevices).not.toHaveBeenCalled()
    expect(screen.queryByText(/Device Online|Device Offline|Device Telemetry/)).not.toBeInTheDocument()
  })
  it('rejects malformed UUID without identity/parent/history/alert requests', () => {
    setup('/devices/ENV-REC-01')
    expect(screen.getByText('Invalid device ID')).toBeInTheDocument()
    expect(api.getDevice).not.toHaveBeenCalled()
    expect(api.getZone).not.toHaveBeenCalled()
    expect(api.zoneTelemetry).not.toHaveBeenCalled()
    expect(api.listAlerts).not.toHaveBeenCalled()
  })
  it('rejects a returned UUID mismatch', async () => {
    vi.mocked(api.getDevice).mockResolvedValue({ ...device, id: id(99) })
    setup()
    expect(await screen.findByText('Unable to load device')).toBeInTheDocument()
    expect(api.getZone).not.toHaveBeenCalled()
  })
  it('rejects a malformed parent zone UUID', async () => {
    vi.mocked(api.getDevice).mockResolvedValue({ ...device, zone_id: 'invalid' })
    setup()
    expect(await screen.findByText('Unable to load device')).toBeInTheDocument()
    expect(api.getZone).not.toHaveBeenCalled()
  })
  it('handles device 404 with safe navigation', async () => {
    vi.mocked(api.getDevice).mockRejectedValue(new ApiError(404))
    setup()
    expect(await screen.findByText('Device not found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '← Back to Buildings' }))
    expect(screen.getByText('Buildings destination')).toBeInTheDocument()
  })
  it('keeps device identity on parent-zone failure and retries locally', async () => {
    vi.mocked(api.getZone).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load parent zone')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(device.name)
    fireEvent.click(screen.getByRole('button', { name: 'Retry parent zone' }))
    expect(await screen.findByText(/Updated 8s ago/)).toBeInTheDocument()
  })
  it('rejects mismatched parent zone data and withholds history/alerts', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ ...zone, id: id(99) })
    setup()
    expect(await screen.findByText('Unable to load parent zone')).toBeInTheDocument()
    expect(api.zoneTelemetry).not.toHaveBeenCalled()
    expect(api.listAlerts).not.toHaveBeenCalled()
  })
  it('retains identity and safe zone history when floor context fails', async () => {
    vi.mocked(api.listFloors).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load parent hierarchy')).toBeInTheDocument()
    expect(screen.queryByText('23.8 °C')).not.toBeInTheDocument()
    expect(screen.getByText('19.4 °C')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry parent hierarchy' }))
    expect(await screen.findByText(/Updated 8s ago/)).toBeInTheDocument()
  })
  it('labels all current/history/alerts as zone context and shows scoped readings', async () => {
    setup()
    expect(await screen.findByText(/Updated 8s ago/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Current Zone Conditions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent Zone Telemetry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zone Alerts' })).toBeInTheDocument()
    expect(screen.getByText('Zone Alert')).toBeInTheDocument()
    expect(screen.getByText(alert.message)).toBeInTheDocument()
    expect(screen.queryByText('Foreign zone alert')).not.toBeInTheDocument()
    expect(api.zoneTelemetry).toHaveBeenCalledWith(zone.id, 10)
    expect(screen.getByText(/not guaranteed to originate from this device/)).toBeInTheDocument()
  })
  it.each([
    ['ENVIRONMENT_SENSOR', 'Environmental zone context', 'Temperature', '23.8 °C'],
    ['OCCUPANCY_SENSOR', 'Occupancy zone context', 'Occupancy', '18 people'],
    ['ENERGY_METER', 'Energy zone context', 'Zone power', '4.2 kW'],
    ['HVAC_UNIT', 'HVAC zone context', 'HVAC power', '2.3 kW'],
  ] as const)('emphasizes real zone fields for %s without sensor ownership claims', async (type, label, field, value) => {
    vi.mocked(api.getDevice).mockResolvedValue({ ...device, device_type: type })
    setup()
    await screen.findByText(/Updated 8s ago/)
    const emphasis = within(screen.getByLabelText(label))
    expect(emphasis.getByText(field)).toBeInTheDocument()
    expect(emphasis.getByText(value)).toBeInTheDocument()
    expect(screen.getByText(/not guaranteed to originate from this device/)).toBeInTheDocument()
    expect(screen.getAllByText('610 ppm').length).toBeGreaterThan(0)
  })
  it('shows empty history/alerts and absent readings without fake zeros', async () => {
    vi.mocked(api.zoneTelemetry).mockResolvedValue([])
    vi.mocked(api.listAlerts).mockResolvedValue([])
    setup(path, {})
    expect(await screen.findByText('No recent zone telemetry')).toBeInTheDocument()
    expect(screen.getByText('No active zone alerts')).toBeInTheDocument()
    expect(await screen.findByText('No Zone Telemetry')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0.0 °C')).not.toBeInTheDocument()
  })
  it('renders partial missing fields safely', async () => {
    setup(path, { [zone.code]: { ...reading, temperature: undefined, humidity: null } as unknown as Telemetry })
    await screen.findByText(/Updated 8s ago/)
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.getAllByText('610 ppm').length).toBeGreaterThan(0)
  })
  it('localizes history failure and recovers without hiding identity', async () => {
    vi.mocked(api.zoneTelemetry).mockRejectedValueOnce(new Error('private error'))
    setup()
    expect(await screen.findByText('Unable to load recent zone telemetry')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(device.name)
    fireEvent.click(screen.getByRole('button', { name: 'Retry recent zone telemetry' }))
    expect(await screen.findByText('19.4 °C')).toBeInTheDocument()
  })
  it('rejects history rows belonging to another zone', async () => {
    vi.mocked(api.zoneTelemetry).mockResolvedValue([{ ...history, zone_id: id(99) }])
    setup()
    expect(await screen.findByText('Unable to load recent zone telemetry')).toBeInTheDocument()
    expect(screen.queryByText('19.4 °C')).not.toBeInTheDocument()
  })
  it('bounds recent history to ten rows', async () => {
    vi.mocked(api.zoneTelemetry).mockResolvedValue(Array.from({ length: 15 }, (_, index) => ({ ...history, id: id(100 + index) })))
    setup()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(11)
  })
  it('localizes zone alert failure and retries', async () => {
    vi.mocked(api.listAlerts).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load zone alerts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry zone alerts' }))
    expect(await screen.findByText(alert.message)).toBeInTheDocument()
  })
  it('keeps metadata/current context visible through REST telemetry errors', async () => {
    const view = setup()
    await screen.findByText(/Updated 8s ago/)
    view.update({ telemetryError: new Error('failed') })
    expect(screen.getByText('Unable to load current zone telemetry')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(device.name)
    expect(screen.getAllByText('23.8 °C').length).toBeGreaterThan(0)
  })
  it('provides UUID building/floor/zone breadcrumbs and back navigation', async () => {
    setup()
    await screen.findByText(/Updated 8s ago/)
    const breadcrumbs = within(screen.getByRole('navigation', { name: 'Device breadcrumbs' }))
    expect(breadcrumbs.getByRole('link', { name: building.name })).toHaveAttribute('href', `/buildings/${building.id}`)
    expect(breadcrumbs.getByRole('link', { name: 'Floor 1' })).toHaveAttribute('href', `/buildings/${building.id}/floors/${floor.id}`)
    expect(breadcrumbs.getByRole('link', { name: zone.name })).toHaveAttribute('href', `/zones/${zone.id}`)
    fireEvent.click(screen.getByRole('link', { name: `← ${zone.name}` }))
    expect(screen.getByText('Zone back destination')).toBeInTheDocument()
  })
  it('provides stable identity and section skeletons', () => {
    vi.mocked(api.getDevice).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Loading device identity' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading recent zone telemetry' })).toBeInTheDocument()
  })
  it('reuses M16 freshness status as Zone Live / Zone Stale', async () => {
    vi.mocked(api.listAlerts).mockResolvedValue([])
    const view = setup()
    expect(await screen.findByText('Zone Live')).toBeInTheDocument()
    view.update({ telemetryByZone: { [zone.code]: { ...reading, timestamp: new Date(now - 60_000).toISOString() } } })
    expect(screen.getByText('Zone Stale')).toBeInTheDocument()
  })
  it('preserves the legacy guard for devices in another building', async () => {
    vi.mocked(api.listAlerts).mockResolvedValue([])
    const other = { ...building, id: id(20), code: 'OFFICE-02' }
    vi.mocked(api.listBuildings).mockResolvedValue([other])
    vi.mocked(api.listFloors).mockResolvedValue([{ ...floor, building_id: other.id }])
    setup()
    await screen.findByRole('link', { name: 'Floor 1' })
    expect(await screen.findByText('No Zone Telemetry')).toBeInTheDocument()
    expect(screen.queryByText('23.8 °C')).not.toBeInTheDocument()
    expect(screen.getByText('19.4 °C')).toBeInTheDocument()
  })
  it('initializes from REST and applies shared socket updates without another connection', async () => {
    const sockets: FakeSocket[] = []
    class FakeSocket {
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent<string>) => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor() { sockets.push(this) }
      close() {}
    }
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.spyOn(api, 'latestTelemetry').mockResolvedValue({ [zone.code]: reading })
    setup(path, {}, true)
    await screen.findByText(/Updated 8s ago/)
    expect(sockets).toHaveLength(1)
    act(() => sockets[0].onmessage?.({ data: JSON.stringify({ type: 'telemetry', data: { ...reading, temperature: 26 } }) } as MessageEvent<string>))
    expect(await screen.findAllByText('26.0 °C')).toHaveLength(2)
    expect(sockets).toHaveLength(1)
  })
})

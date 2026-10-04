// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Alert, Building, Device, Floor, Telemetry, Zone } from '../../types/api'
import { TelemetryContext, type TelemetryContextValue } from '../../realtime/TelemetryContext'
import { TelemetryProvider } from '../../realtime/TelemetryProvider'
import { FloorDetailsPage } from './FloorDetailsPage'
import { ZoneDetailsPage } from './ZoneDetailsPage'
import { DeviceDestination } from './HierarchyDestination'
import { scopedReading, zoneStatus, TELEMETRY_FRESHNESS_MS } from './operationalData'

const id = (n: number) => `${n.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
const building: Building = { id: id(1), name: 'Demo Commercial Building', code: 'DEMO-BLDG-01', created_at: '' }
const floor: Floor = { id: id(2), building_id: building.id, floor_number: 1, name: 'Ground floor', created_at: '' }
const otherFloor: Floor = { ...floor, id: id(3), floor_number: 2, name: 'Other floor' }
const zone: Zone = { id: id(4), floor_id: floor.id, name: 'Reception', code: 'REC', created_at: '' }
const otherZone: Zone = { ...zone, id: id(5), floor_id: otherFloor.id, name: 'Other zone', code: 'OTHER' }
const device: Device = { id: id(6), zone_id: zone.id, name: 'Reception sensor', device_id: 'ENV-REC', device_type: 'ENVIRONMENT_SENSOR', created_at: '' }
const now = Date.parse('2026-10-04T09:00:00Z')
const reading: Telemetry = { zone_id: zone.code, temperature: 23.8, humidity: 46, co2_ppm: 610, occupancy: 18, hvac_status: 'ON', hvac_setpoint: 22, hvac_power_kw: 2.3, zone_power_kw: 4.2, timestamp: new Date(now - 8000).toISOString() }
const alert: Alert = { id: id(7), zone_id: zone.id, zone_name: zone.name, floor_name: floor.name, alert_type: 'HIGH_CO2', severity: 'WARNING', status: 'ACTIVE', message: 'Reception air alert', trigger_value: 1300, triggered_at: new Date(now - 60_000).toISOString(), resolved_at: null }
const foreignAlert: Alert = { ...alert, id: id(8), zone_id: otherZone.id, zone_name: otherZone.name, message: 'Foreign alert' }
const floorPath = `/buildings/${building.id}/floors/${floor.id}`
const zonePath = `/zones/${zone.id}`

function setup(path = zonePath, readings: Record<string, Telemetry> = { [zone.code]: reading }, realProvider = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
  let value: TelemetryContextValue = { telemetryByZone: readings, connectionStatus: 'live', telemetryError: null }
  const routes = <MemoryRouter initialEntries={[path]}><Routes><Route path="/buildings/:buildingId/floors/:floorId" element={<FloorDetailsPage />} /><Route path="/zones/:zoneId" element={<ZoneDetailsPage />} /><Route path="/devices/:deviceId" element={<DeviceDestination />} /><Route path="/buildings/:buildingId" element={<h1>Building back destination</h1>} /><Route path="/buildings" element={<h1>Buildings back destination</h1>} /></Routes></MemoryRouter>
  const tree = () => <QueryClientProvider client={client}>{realProvider ? <TelemetryProvider>{routes}</TelemetryProvider> : <TelemetryContext.Provider value={value}>{routes}</TelemetryContext.Provider>}</QueryClientProvider>
  const view = render(tree())
  return { client, update: (next: Partial<TelemetryContextValue>) => { value = { ...value, ...next }; view.rerender(tree()) } }
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.spyOn(api, 'getBuilding').mockResolvedValue(building)
  vi.spyOn(api, 'listBuildings').mockResolvedValue([building])
  vi.spyOn(api, 'listFloors').mockResolvedValue([otherFloor, floor])
  vi.spyOn(api, 'listZones').mockResolvedValue([otherZone, zone])
  vi.spyOn(api, 'getZone').mockResolvedValue(zone)
  vi.spyOn(api, 'getDevice').mockResolvedValue(device)
  vi.spyOn(api, 'zoneTelemetry').mockResolvedValue([])
  vi.spyOn(api, 'listDevices').mockImplementation(async (zoneId) => zoneId === zone.id ? [device] : [])
  vi.spyOn(api, 'listAlerts').mockResolvedValue([foreignAlert, alert])
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('M16 Floor Details', () => {
  it('renders correct floor, zones, counts, current readings and scoped alerts', async () => {
    setup(floorPath)
    expect(await screen.findByRole('heading', { level: 1, name: 'Floor 1: Ground floor' })).toBeInTheDocument()
    const card = await screen.findByRole('article', { name: 'Reception' })
    expect(await within(card).findByText('23.8 °C')).toBeInTheDocument()
    expect(within(card).getByText('610 ppm')).toBeInTheDocument()
    expect(within(card).getByText('18 people')).toBeInTheDocument()
    expect(within(card).getByText('Alert')).toBeInTheDocument()
    expect(await screen.findByText('Reception air alert')).toBeInTheDocument()
    expect(screen.queryByText('Foreign alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: otherZone.name })).not.toBeInTheDocument()
    expect(api.listDevices).toHaveBeenCalledTimes(1)
    expect(api.listDevices).toHaveBeenCalledWith(zone.id)
    expect(within(screen.getByLabelText('Floor summary')).getAllByText('1')).toHaveLength(3)
  })
  it.each([`/buildings/bad/floors/${floor.id}`, `/buildings/${building.id}/floors/bad`])('rejects invalid route %s before API calls', (path) => {
    setup(path)
    expect(screen.getByText('Invalid floor destination')).toBeInTheDocument()
    expect(api.getBuilding).not.toHaveBeenCalled()
    expect(api.listDevices).not.toHaveBeenCalled()
    expect(api.listAlerts).not.toHaveBeenCalled()
  })
  it('shows building 404 and floor/building mismatch without fallback', async () => {
    vi.mocked(api.getBuilding).mockRejectedValue(new ApiError(404))
    setup(floorPath)
    expect(await screen.findByText('Building not found')).toBeInTheDocument()
  })
  it('rejects unrelated floor UUID', async () => {
    setup(`/buildings/${building.id}/floors/${id(99)}`)
    expect(await screen.findByText('Floor not found in this building')).toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects inconsistent building response identity', async () => {
    vi.mocked(api.getBuilding).mockResolvedValue({ ...building, id: id(99) })
    setup(floorPath)
    expect(await screen.findByText('Unable to load floor destination')).toBeInTheDocument()
    expect(api.listFloors).not.toHaveBeenCalled()
  })
  it('keeps the header on zone failure and retries', async () => {
    vi.mocked(api.listZones).mockRejectedValueOnce(new Error('private details'))
    setup(floorPath)
    expect(await screen.findByText('Unable to load zones')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(floor.name)
    fireEvent.click(screen.getByRole('button', { name: 'Retry zones' }))
    expect(await screen.findByRole('article', { name: zone.name })).toBeInTheDocument()
  })
  it('keeps zones on alert failure and retries locally', async () => {
    vi.mocked(api.listAlerts).mockRejectedValueOnce(new Error('failed'))
    setup(floorPath)
    expect(await screen.findByText('Unable to load alerts')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: zone.name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry alerts' }))
    expect(await screen.findByText(alert.message)).toBeInTheDocument()
  })
  it('renders empty floor and no telemetry states', async () => {
    vi.mocked(api.listZones).mockResolvedValue([otherZone])
    setup(floorPath, {})
    expect(await screen.findByText('No zones configured on this floor.')).toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
    expect(screen.queryByText('Reception air alert')).not.toBeInTheDocument()
  })
  it('shows no telemetry and navigates to zone/back destinations', async () => {
    setup(floorPath, {})
    expect(await screen.findByText('No telemetry available.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /View Zone: Reception/ }))
    expect(await screen.findByRole('heading', { level: 1, name: zone.name })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('link', { name: '← Floor 1' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Ground floor/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '← Back to Building' }))
    expect(await screen.findByText('Building back destination')).toBeInTheDocument()
  })
})

describe('M16 Zone Details', () => {
  it('resolves direct route parents and renders current conditions, HVAC, devices and scoped alerts', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: zone.name })).toBeInTheDocument()
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
    expect(screen.getByText('46.0 %')).toBeInTheDocument()
    expect(screen.getByText('4.2 kW')).toBeInTheDocument()
    expect(screen.getByText('22.0 °C')).toBeInTheDocument()
    expect(screen.getByText('2.3 kW')).toBeInTheDocument()
    expect(screen.getByText(/Updated 8s ago/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Floor 1' })).toHaveAttribute('href', floorPath)
    expect(screen.getByText(device.device_id)).toBeInTheDocument()
    expect(screen.getByText(alert.message)).toBeInTheDocument()
    expect(screen.queryByText(foreignAlert.message)).not.toBeInTheDocument()
    expect(api.getZone).toHaveBeenCalledWith(zone.id)
  })
  it('shows missing sensor fields as dashes without fake zeros', async () => {
    setup(zonePath, { [zone.code]: { ...reading, temperature: undefined, humidity: null, hvac_setpoint: undefined } as unknown as Telemetry })
    await screen.findByText('4.2 kW')
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(screen.queryByText('0.0 °C')).not.toBeInTheDocument()
  })
  it('shows no telemetry, devices and alerts', async () => {
    vi.mocked(api.listDevices).mockResolvedValue([])
    vi.mocked(api.listAlerts).mockResolvedValue([])
    setup(zonePath, {})
    expect(await screen.findByText('No telemetry available.')).toBeInTheDocument()
    expect(screen.getByText('No devices configured.')).toBeInTheDocument()
    expect(screen.getByText('No active alerts.')).toBeInTheDocument()
  })
  it('rejects malformed UUID before identity or secondary queries', () => {
    setup('/zones/bad')
    expect(screen.getByText('Invalid zone ID')).toBeInTheDocument()
    expect(api.getZone).not.toHaveBeenCalled()
    expect(api.listBuildings).not.toHaveBeenCalled()
    expect(api.listAlerts).not.toHaveBeenCalled()
  })
  it('shows zone 404', async () => {
    vi.mocked(api.getZone).mockRejectedValue(new ApiError(404))
    setup()
    expect(await screen.findByText('Zone not found')).toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects returned UUID mismatch without guessing context', async () => {
    vi.mocked(api.getZone).mockResolvedValue(otherZone)
    setup()
    expect(await screen.findByText('Unable to load zone')).toBeInTheDocument()
    expect(api.listBuildings).not.toHaveBeenCalled()
  })
  it('keeps header/conditions when devices fail and retries', async () => {
    vi.mocked(api.listDevices).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load devices')).toBeInTheDocument()
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry devices' }))
    expect(await screen.findByText(device.device_id)).toBeInTheDocument()
  })
  it('rejects foreign zone devices instead of rendering them', async () => {
    vi.mocked(api.listDevices).mockResolvedValue([{ ...device, zone_id: otherZone.id }])
    setup()
    expect(await screen.findByText('Unable to load devices')).toBeInTheDocument()
    expect(screen.queryByText(device.device_id)).not.toBeInTheDocument()
  })
  it('keeps conditions and devices when alerts fail', async () => {
    vi.mocked(api.listAlerts).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load alerts')).toBeInTheDocument()
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry alerts' }))
    expect(await screen.findByText(alert.message)).toBeInTheDocument()
  })
  it('localizes unresolved parent context while retaining zone/devices', async () => {
    vi.mocked(api.listFloors).mockResolvedValue([])
    setup()
    expect(await screen.findByText(/Parent floor\/building context could not be resolved uniquely/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(zone.name)
    expect(screen.queryByText('23.8 °C')).not.toBeInTheDocument()
    expect(screen.getByText(device.device_id)).toBeInTheDocument()
  })
  it('keeps header on parent failure and recovers context by retry', async () => {
    vi.mocked(api.listFloors).mockRejectedValueOnce(new Error('failed'))
    setup()
    expect(await screen.findByText('Unable to load parent context')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry parent context' }))
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
  })
  it('links devices by database UUID to the M17 shell', async () => {
    setup()
    const link = await screen.findByRole('link', { name: /View Device: ENV-REC/ })
    expect(link).toHaveAttribute('href', `/devices/${device.id}`)
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: device.name })).toBeInTheDocument()
    expect(screen.getByText(device.id)).toBeInTheDocument()
  })
  it('shows stable skeletons during identity load', () => {
    vi.mocked(api.getZone).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Loading zone header' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading telemetry cards' })).toBeInTheDocument()
  })
  it('withholds code-keyed readings for another building on a direct reload', async () => {
    const second = { ...building, id: id(20), code: 'OFFICE-02' }
    const secondFloor = { ...floor, id: id(21), building_id: second.id }
    const secondZone = { ...zone, id: id(22), floor_id: secondFloor.id }
    vi.mocked(api.getZone).mockResolvedValue(secondZone)
    vi.mocked(api.listBuildings).mockResolvedValue([building, second])
    vi.mocked(api.listFloors).mockImplementation(async (buildingId) => buildingId === second.id ? [secondFloor] : [floor])
    vi.mocked(api.listZones).mockResolvedValue([secondZone])
    vi.mocked(api.listDevices).mockResolvedValue([])
    setup(`/zones/${secondZone.id}`)
    expect(await screen.findByText('Current telemetry is unavailable for this building.')).toBeInTheDocument()
    expect(screen.queryByText('23.8 °C')).not.toBeInTheDocument()
  })
  it('does not claim alert absence when the active result is saturated', async () => {
    vi.mocked(api.listAlerts).mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({ ...foreignAlert, id: id(100 + index) })))
    setup()
    expect(await screen.findByText('No matching alerts in the returned results.')).toBeInTheDocument()
    expect(screen.queryByText('No active alerts.')).not.toBeInTheDocument()
  })
  it('updates current readings through shared context', async () => {
    vi.mocked(api.listAlerts).mockResolvedValue([])
    const view = setup()
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    view.update({ telemetryByZone: { [zone.code]: { ...reading, temperature: 28, timestamp: new Date(now - 60_000).toISOString() } } })
    expect(await screen.findByText('28.0 °C')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })
})

describe('M16 telemetry identity and freshness', () => {
  it('does not attribute legacy telemetry to other buildings or repeated codes', () => {
    const readings = { [zone.code]: reading }
    const second = { ...building, id: id(20), code: 'OFFICE-02' }
    expect(scopedReading(second, [building, second], [zone], zone, readings)).toBeUndefined()
    expect(scopedReading(building, [building], [zone, { ...otherZone, code: zone.code }], zone, readings)).toBeUndefined()
    expect(scopedReading(building, [building, { ...building, id: id(20) }], [zone], zone, readings)).toBeUndefined()
    expect(scopedReading(building, [building], [zone], zone, { [zone.code]: { ...reading, zone_id: 'OTHER' } })).toBeUndefined()
  })
  it('uses deterministic priority and source timestamps at the freshness boundary', () => {
    expect(zoneStatus(undefined, true, now)).toBe('Alert')
    expect(zoneStatus(undefined, false, now)).toBe('No telemetry')
    expect(zoneStatus({ ...reading, timestamp: new Date(now - TELEMETRY_FRESHNESS_MS).toISOString() }, false, now)).toBe('Live')
    expect(zoneStatus({ ...reading, timestamp: new Date(now - TELEMETRY_FRESHNESS_MS - 1).toISOString() }, false, now)).toBe('Stale')
    expect(zoneStatus({ ...reading, timestamp: 'invalid' }, false, now)).toBe('Stale')
  })
  it.each([floorPath, zonePath])('initializes REST readings and applies WebSocket updates with one connection at %s', async (path) => {
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
    expect(await screen.findByText('23.8 °C')).toBeInTheDocument()
    expect(sockets).toHaveLength(1)
    act(() => sockets[0].onmessage?.({ data: JSON.stringify({ type: 'telemetry', data: { ...reading, temperature: 26 } }) } as MessageEvent<string>))
    expect(await screen.findByText('26.0 °C')).toBeInTheDocument()
    expect(sockets).toHaveLength(1)
  })
  it('reevaluates freshness while no new events arrive', async () => {
    vi.mocked(api.listAlerts).mockResolvedValue([])
    let tick: (() => void) | undefined
    const originalInterval = window.setInterval.bind(window)
    vi.spyOn(window, 'setInterval').mockImplementation((handler, delay) => { if (delay === 5000 && typeof handler === 'function') tick = handler as () => void; return originalInterval(handler, delay) as unknown as ReturnType<typeof setInterval> })
    setup()
    await screen.findByText('Live')
    vi.mocked(Date.now).mockReturnValue(now + 40_000)
    expect(tick).toBeDefined()
    act(() => tick!())
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })
})

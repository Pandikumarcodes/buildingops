// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Building, Floor, Zone, Device } from '../../types/api'
import { BuildingDestination } from './BuildingDestination'
import { FloorDestination, ZoneDestination } from './HierarchyDestination'
import { buildingImage, fallbackBuildingImage } from './buildingImages'
import { TelemetryContext } from '../../realtime/TelemetryContext'

const id = (n: number) => `${n.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
const building: Building = { id: id(1), name: 'Shared name', code: 'BLDG-01', created_at: '' }
const floor: Floor = { id: id(2), building_id: building.id, name: 'Ground level', floor_number: 0, created_at: '' }
const zone: Zone = { id: id(3), floor_id: floor.id, name: 'Reception', code: 'REC', created_at: '' }
const otherZone: Zone = { ...zone, id: id(4), name: 'Office', code: 'OFF' }
const device: Device = { id: id(5), zone_id: zone.id, device_id: 'ENV-01', name: 'Reception sensor', device_type: 'ENVIRONMENT_SENSOR', created_at: '' }

function setup(path = `/buildings/${building.id}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
  render(<QueryClientProvider client={client}><TelemetryContext.Provider value={{ telemetryByZone: {}, connectionStatus: 'disconnected', telemetryError: null }}><MemoryRouter initialEntries={[path]}><Link to={`/buildings/${id(9)}`}>Switch building context</Link><Routes>
    <Route path="/buildings/:buildingId" element={<BuildingDestination />} />
    <Route path="/buildings/:buildingId/floors/:floorId" element={<FloorDestination />} />
    <Route path="/zones/:zoneId" element={<ZoneDestination />} />
    <Route path="/buildings" element={<h1>Portfolio destination</h1>} />
  </Routes></MemoryRouter></TelemetryContext.Provider></QueryClientProvider>)
  return client
}
beforeEach(() => {
  vi.spyOn(api, 'listBuildings').mockResolvedValue([building])
  vi.spyOn(api, 'getZone').mockResolvedValue(zone)
  vi.spyOn(api, 'listAlerts').mockResolvedValue([])
  vi.spyOn(api, 'getBuilding').mockResolvedValue(building)
  vi.spyOn(api, 'listFloors').mockResolvedValue([floor])
  vi.spyOn(api, 'listZones').mockResolvedValue([zone, otherZone])
  vi.spyOn(api, 'listDevices').mockImplementation(async (zoneId) => zoneId === zone.id ? [device] : [])
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('M15 Building Details', () => {
  it('loads exact UUID identity, trusted counts, nested devices and shared imagery', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: building.name })).toBeInTheDocument()
    expect(screen.getByText(building.code)).toBeInTheDocument()
    expect(api.getBuilding).toHaveBeenCalledWith(building.id)
    expect(screen.getByRole('img')).toHaveAttribute('src', buildingImage(building))
    const reception = await screen.findByRole('list', { name: 'Devices in Reception' })
    expect(within(reception).getByText('ENV-01')).toBeInTheDocument()
    expect(await screen.findByText('No devices configured')).toBeInTheDocument()
    const summary = within(screen.getByLabelText('Building summary'))
    expect(summary.getByText('2')).toBeInTheDocument()
    expect(summary.getAllByText('1')).toHaveLength(2)
    expect(api.listDevices).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link', { name: /View Floor/ })).toHaveAttribute('href', `/buildings/${building.id}/floors/${floor.id}`)
    expect(screen.getByRole('link', { name: /View Zone: Reception/ })).toHaveAttribute('href', `/zones/${zone.id}`)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('img')).toHaveAttribute('src', fallbackBuildingImage)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('Building image unavailable')).toBeInTheDocument()
  })
  it('changes building context by UUID even for identical display names', async () => {
    const second = { ...building, id: id(9), code: 'BLDG-09' }
    vi.mocked(api.getBuilding).mockResolvedValue(second)
    vi.mocked(api.listFloors).mockResolvedValue([])
    vi.mocked(api.listZones).mockResolvedValue([])
    setup(`/buildings/${second.id.toUpperCase()}`)
    expect(await screen.findByText(second.code)).toBeInTheDocument()
    expect(api.getBuilding).toHaveBeenCalledWith(second.id)
    expect(api.listFloors).toHaveBeenCalledWith(second.id)
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('shows stable loading states before identity and hierarchy resolve', async () => {
    vi.mocked(api.getBuilding).mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Loading building identity' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading building summary' })).toBeInTheDocument()
    expect(api.listFloors).not.toHaveBeenCalled()
  })
  it('keeps identity visible while secondary hierarchy is loading', async () => {
    vi.mocked(api.listFloors).mockReturnValue(new Promise(() => {}))
    setup()
    expect(await screen.findByText(building.code)).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading floors and zones' })).toBeInTheDocument()
  })
  it.each(['bad-id', 'undefined'])('rejects malformed route %s without API requests', (route) => {
    setup(`/buildings/${route}`)
    expect(screen.getByRole('heading', { name: 'Invalid building ID' })).toBeInTheDocument()
    expect(api.getBuilding).not.toHaveBeenCalled()
    expect(api.listFloors).not.toHaveBeenCalled()
    expect(api.listZones).not.toHaveBeenCalled()
  })
  it('handles 404 without fallback or child queries', async () => {
    vi.mocked(api.getBuilding).mockRejectedValue(new ApiError(404))
    setup()
    expect(await screen.findByRole('heading', { name: 'Building not found' })).toBeInTheDocument()
    expect(api.listFloors).not.toHaveBeenCalled()
  })
  it.each(['floors', 'zones'] as const)('localizes %s failure and recovers with retry', async (kind) => {
    const query = kind === 'floors' ? vi.mocked(api.listFloors) : vi.mocked(api.listZones)
    query.mockRejectedValueOnce(new Error('private details'))
    setup()
    expect(await screen.findByRole('heading', { name: `Unable to load ${kind}` })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: building.name })).toBeInTheDocument()
    expect(screen.queryByText('private details')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Retry ${kind}` }))
    expect(await screen.findByText('ENV-01')).toBeInTheDocument()
  })
  it('shows no floors and no zones configured', async () => {
    vi.mocked(api.listFloors).mockResolvedValue([])
    vi.mocked(api.listZones).mockResolvedValue([])
    setup()
    expect(await screen.findByText('No floors configured')).toBeInTheDocument()
    expect(await screen.findByText('No zones configured')).toBeInTheDocument()
  })
  it('shows floors with no zones without fetching devices', async () => {
    vi.mocked(api.listZones).mockResolvedValue([])
    setup()
    expect(await screen.findByText('No zones configured')).toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects floors from another building', async () => {
    vi.mocked(api.listFloors).mockResolvedValue([{ ...floor, building_id: id(9) }])
    setup()
    expect(await screen.findByText('Unable to load floors')).toBeInTheDocument()
    expect(screen.queryByText(floor.name)).not.toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects zones from unreturned floors before querying devices', async () => {
    vi.mocked(api.listZones).mockResolvedValue([{ ...zone, floor_id: id(9) }])
    setup()
    expect(await screen.findByText('Unable to load zones')).toBeInTheDocument()
    expect(screen.queryByText(zone.name)).not.toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects cross-zone devices, keeps sibling zones usable and recovers locally', async () => {
    vi.mocked(api.listDevices).mockImplementation(async (zoneId) => zoneId === zone.id ? [{ ...device, zone_id: otherZone.id }] : [])
    setup()
    expect(await screen.findByText('Unable to load devices')).toBeInTheDocument()
    expect(screen.queryByText(device.device_id)).not.toBeInTheDocument()
    expect(screen.getByText('No devices configured')).toBeInTheDocument()
    vi.mocked(api.listDevices).mockResolvedValue([device])
    fireEvent.click(screen.getByRole('button', { name: 'Retry devices for Reception' }))
    expect(await screen.findByText(device.device_id)).toBeInTheDocument()
  })
  it('navigates to the floor shell and back without duplicate device requests', async () => {
    setup()
    await screen.findByText('ENV-01')
    fireEvent.click(screen.getByRole('link', { name: /View Floor/ }))
    expect(await screen.findByRole('heading', { name: 'Floor 0: Ground level' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '← Back to Building' }))
    expect(await screen.findByText('ENV-01')).toBeInTheDocument()
    expect(api.listDevices).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('link', { name: /Back to Buildings/ }))
    expect(await screen.findByText('Portfolio destination')).toBeInTheDocument()
  })
  it('opens the canonical zone shell', async () => {
    setup()
    fireEvent.click(await screen.findByRole('link', { name: /View Zone: Reception/ }))
    expect(await screen.findByRole('heading', { level: 1, name: zone.name })).toBeInTheDocument()
    expect(screen.getByText(`Zone UUID: ${zone.id}`)).toBeInTheDocument()
  })
  it('rejects a floor UUID outside the route building', async () => {
    setup(`/buildings/${building.id}/floors/${id(9)}`)
    expect(await screen.findByText('Floor not found in this building')).toBeInTheDocument()
    expect(api.listDevices).not.toHaveBeenCalled()
  })
  it('rejects malformed floor shell identifiers before querying', () => {
    setup(`/buildings/${building.id}/floors/bad`)
    expect(screen.getByText('Invalid floor destination')).toBeInTheDocument()
    expect(api.getBuilding).not.toHaveBeenCalled()
  })
  it('rejects malformed zone shell identifiers', () => {
    setup('/zones/bad')
    expect(screen.getByText('Invalid zone ID')).toBeInTheDocument()
  })
  it('does not reuse another building’s hierarchy during navigation', async () => {
    const client = setup()
    await screen.findByText('ENV-01')
    await waitFor(() => expect(client.getQueryData(['zones', zone.id, 'devices'])).toEqual([device]))
    vi.mocked(api.getBuilding).mockResolvedValue({ ...building, id: id(9), code: 'BLDG-09' })
    vi.mocked(api.listFloors).mockResolvedValue([{ ...floor, id: id(10), building_id: id(9), name: 'Different floor' }])
    vi.mocked(api.listZones).mockResolvedValue([{ ...zone, id: id(11), floor_id: id(10), name: 'Different zone' }])
    vi.mocked(api.listDevices).mockResolvedValue([])
    fireEvent.click(screen.getByRole('link', { name: 'Switch building context' }))
    expect(await screen.findByText('Different zone')).toBeInTheDocument()
    expect(screen.getByText('BLDG-09')).toBeInTheDocument()
    expect(screen.queryByText('Reception')).not.toBeInTheDocument()
    expect(screen.queryByText('ENV-01')).not.toBeInTheDocument()
    expect(api.listDevices).toHaveBeenCalledWith(id(11))
  })
})

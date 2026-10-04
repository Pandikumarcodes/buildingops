// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuildingsPage } from './BuildingsPage'
import { BuildingDestination } from './BuildingDestination'
import { AppLayout } from '../../layouts/AppLayout'
import { api, ApiError } from '../../api/client'
import type { Building } from '../../types/api'
import { buildingImage, fallbackBuildingImage } from './buildingImages'

const first: Building = { id: '11111111-1111-4111-8111-111111111111', name: 'Shared Commercial Name', code: 'DEMO-BLDG-01', created_at: '' }
const second: Building = { ...first, id: '22222222-2222-4222-8222-222222222222', code: 'OFFICE-02' }

function setup(path = '/buildings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}><Route path="buildings" element={<BuildingsPage />} /><Route path="buildings/:buildingId" element={<BuildingDestination />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
  return client
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Buildings experience', () => {
  it('renders both buildings with identical names in reversed order and opens the clicked UUID', async () => {
    vi.spyOn(api, 'listBuildings').mockResolvedValue([second, first])
    vi.spyOn(api, 'listFloors').mockResolvedValue([])
    vi.spyOn(api, 'listZones').mockResolvedValue([])
    const detail = vi.spyOn(api, 'getBuilding').mockResolvedValue(second)
    setup()
    const links = await screen.findAllByRole('link', { name: /View Building:/ })
    expect(screen.getAllByRole('heading', { name: first.name })).toHaveLength(2)
    expect(screen.getByText(first.code)).toBeInTheDocument()
    expect(screen.getByText(second.code)).toBeInTheDocument()
    expect(links[0]).toHaveAttribute('href', `/buildings/${second.id}`)
    expect(links[1]).toHaveAttribute('href', `/buildings/${first.id}`)
    expect(within(screen.getByLabelText('Portfolio summary')).getByText('2')).toBeInTheDocument()
    fireEvent.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: second.name })).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(second.id)
    expect(screen.getByRole('link', { name: /Back to Buildings/ })).toHaveAttribute('href', '/buildings')
  })

  it('shows skeleton loading while preserving sidebar navigation', () => {
    vi.spyOn(api, 'listBuildings').mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByRole('status', { name: 'Loading buildings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buildings' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows a purposeful empty state without creation controls', async () => {
    vi.spyOn(api, 'listBuildings').mockResolvedValue([])
    setup()
    expect(await screen.findByRole('heading', { name: 'No buildings available' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add|Create|Delete/ })).not.toBeInTheDocument()
  })

  it('shows a safe error and successfully retries', async () => {
    const list = vi.spyOn(api, 'listBuildings').mockRejectedValueOnce(new Error('private backend detail')).mockResolvedValueOnce([])
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load buildings')
    expect(screen.queryByText(/private backend/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'No buildings available' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps failed hierarchy counts unavailable and recovers them without inventing operational health', async () => {
    vi.spyOn(api, 'listBuildings').mockResolvedValue([first])
    vi.spyOn(api, 'listFloors').mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce([])
    vi.spyOn(api, 'listZones').mockResolvedValue([])
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry hierarchy' }))
    expect(await screen.findByText('Operational status unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Operational')).not.toBeInTheDocument()
    expect(await screen.findAllByText('0')).toHaveLength(2)
  })

  it('maps images deterministically and falls back twice safely', async () => {
    expect(buildingImage(first)).toBe(buildingImage({ ...first, name: 'Renamed' } as Building))
    vi.spyOn(api, 'listBuildings').mockResolvedValue([second])
    vi.spyOn(api, 'listFloors').mockResolvedValue([])
    vi.spyOn(api, 'listZones').mockResolvedValue([])
    setup()
    const img = await screen.findByRole('img')
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', fallbackBuildingImage)
    fireEvent.error(img)
    expect(screen.getByText('Building image unavailable')).toBeInTheDocument()
  })

  it('rejects malformed IDs without sending a building request', async () => {
    const detail = vi.spyOn(api, 'getBuilding')
    setup('/buildings/not-a-uuid')
    expect(screen.getByRole('heading', { name: 'Invalid building ID' })).toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
  })

  it('shows not found for an unknown UUID without fallback', async () => {
    vi.spyOn(api, 'getBuilding').mockRejectedValue(new ApiError(404))
    const list = vi.spyOn(api, 'listBuildings')
    setup(`/buildings/${first.id}`)
    expect(await screen.findByRole('heading', { name: 'Building not found' })).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('rejects a response for a different UUID', async () => {
    vi.spyOn(api, 'getBuilding').mockResolvedValue(second)
    setup(`/buildings/${first.id}`)
    expect(await screen.findByRole('heading', { name: 'Unable to load building' })).toBeInTheDocument()
    expect(screen.queryByText('Building selected')).not.toBeInTheDocument()
  })
})

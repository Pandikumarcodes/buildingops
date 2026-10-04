// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from './api/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./realtime/TelemetryProvider', () => ({
  TelemetryProvider: ({ children }: { children: ReactNode }) => children,
}))

describe('application routes', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })
  it('enables the Buildings route and validates the detail route UUID', async () => {
    const building = { id: '11111111-1111-4111-8111-111111111111', name: 'Office One', code: 'OFFICE-01', created_at: '' }
    const detail = vi.spyOn(api, 'getBuilding').mockResolvedValue(building)
    vi.spyOn(api, 'listFloors').mockResolvedValue([])
    vi.spyOn(api, 'listZones').mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/buildings/${building.id}`]}><App /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('heading', { name: 'Office One' })).toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(building.id)
    expect(screen.getByRole('link', { name: 'Buildings' })).toHaveAttribute('href', '/buildings')
    detail.mockRestore()
  })

  it('renders the enabled AI Assistant at /ai without a coming-soon state', async () => {
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'AI Building Assistant' })).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai')
  })
})

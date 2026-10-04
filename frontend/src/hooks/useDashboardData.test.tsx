// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { useDashboardData } from './useDashboardData'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const demo = { id: 'demo-uuid', code: 'DEMO-BLDG-01', name: 'Renamed demo', created_at: '' }
const other = { ...demo, id: 'other-uuid', code: 'OTHER', name: 'Demo Commercial Building' }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(useDashboardData, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

it('preserves V1 with explicit demo code regardless of name or order', async () => {
  vi.spyOn(api, 'listBuildings').mockResolvedValue([other, demo])
  const floors = vi.spyOn(api, 'listFloors').mockResolvedValue([])
  vi.spyOn(api, 'listZones').mockResolvedValue([])
  const { result } = setup()
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.building?.id).toBe(demo.id)
  expect(floors).toHaveBeenCalledWith(demo.id)
})

it.each([[other], [demo, { ...demo, id: 'duplicate-uuid' }]])('never falls back for missing or ambiguous demo context: %j', async (...buildings) => {
  vi.spyOn(api, 'listBuildings').mockResolvedValue(buildings)
  const floors = vi.spyOn(api, 'listFloors')
  const { result } = setup()
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.building).toBeUndefined()
  expect(floors).not.toHaveBeenCalled()
})

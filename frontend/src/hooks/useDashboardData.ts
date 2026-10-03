import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Building, Device, Floor, Zone } from '../types/api'

interface DashboardData {
  building?: Building
  floors: Floor[]
  zones: Zone[]
  devices: Device[]
  isLoading: boolean
  error: Error | null
}

export function useDashboardData(): DashboardData {
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.listBuildings })
  const building = buildings.data?.find((item) => item.name === 'Demo Commercial Building') ?? buildings.data?.[0]
  const floors = useQuery({
    queryKey: ['buildings', building?.id, 'floors'],
    queryFn: () => api.listFloors(building!.id),
    enabled: Boolean(building),
  })
  const zones = useQuery({
    queryKey: ['buildings', building?.id, 'zones'],
    queryFn: () => api.listZones(building!.id),
    enabled: Boolean(building),
  })
  const devices = useQuery({
    queryKey: ['buildings', building?.id, 'devices'],
    queryFn: async () => {
      const zoneList = zones.data ?? []
      return (await Promise.all(zoneList.map((zone) => api.listDevices(zone.id)))).flat()
    },
    enabled: Boolean(zones.data),
  })

  return {
    building,
    floors: floors.data ?? [],
    zones: zones.data ?? [],
    devices: devices.data ?? [],
    isLoading: buildings.isLoading || floors.isLoading || zones.isLoading || devices.isLoading,
    error: buildings.error ?? floors.error ?? zones.error ?? devices.error ?? null,
  }
}

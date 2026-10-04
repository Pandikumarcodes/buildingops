import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

export const isUuid = (value?: string): value is string => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
export const sameId = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()

export function useBuildingDetails(routeId?: string, includeDevices = true, selectedFloorId?: string) {
  const buildingId = isUuid(routeId) ? routeId.toLowerCase() : undefined
  const building = useQuery({
    queryKey: ['buildings', buildingId], enabled: Boolean(buildingId), retry: false,
    queryFn: async () => {
      const result = await api.getBuilding(buildingId!)
      if (!sameId(result.id, buildingId!)) throw new Error('Building identity mismatch')
      return result
    },
  })
  const floors = useQuery({
    queryKey: ['buildings', buildingId, 'floors'], enabled: Boolean(building.data) && !building.isError,
    queryFn: async () => {
      const result = await api.listFloors(buildingId!)
      if (result.some((floor) => !isUuid(floor.id) || !sameId(floor.building_id, buildingId!))) throw new Error('Floor identity mismatch')
      return result
    },
  })
  const zones = useQuery({
    queryKey: ['buildings', buildingId, 'zones'], enabled: includeDevices && Boolean(building.data) && !building.isError,
    queryFn: () => api.listZones(buildingId!),
  })
  // Do not render or request devices for zones until their floor membership is known.
  const zoneIdentityError = Boolean(floors.data && zones.data && zones.data.some((zone) => !isUuid(zone.id) || !floors.data.some((floor) => sameId(floor.id, zone.floor_id))))
  const scopedZones = floors.data && zones.data && !floors.isError && !zones.isError && !zoneIdentityError ? zones.data.filter((zone) => !selectedFloorId || sameId(zone.floor_id, selectedFloorId)) : []
  const devices = useQueries({ queries: includeDevices ? scopedZones.map((zone) => ({
    queryKey: ['zones', zone.id.toLowerCase(), 'devices'],
    queryFn: async () => {
      const result = await api.listDevices(zone.id)
      if (result.some((device) => !isUuid(device.id) || !sameId(device.zone_id, zone.id))) throw new Error('Device identity mismatch')
      return result
    },
  })) : [] })
  return { valid: Boolean(buildingId), building, floors, zones, scopedZones, zoneIdentityError, devices }
}

import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { isUuid, sameId } from './useBuildingDetails'

export function useZoneDetails(routeId?: string, includeDevices = true) {
  const zoneId = isUuid(routeId) ? routeId.toLowerCase() : undefined
  const zone = useQuery({ queryKey: ['zones', zoneId], enabled: Boolean(zoneId), retry: false, queryFn: async () => {
    const result = await api.getZone(zoneId!)
    if (!sameId(result.id, zoneId!) || !isUuid(result.floor_id)) throw new Error('Zone identity mismatch')
    return result
  } })
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.listBuildings, enabled: zone.isSuccess })
  const floorQueries = useQueries({ queries: zone.isSuccess ? (buildings.data ?? []).map((building) => ({
    queryKey: ['buildings', building.id, 'floors'], queryFn: async () => {
      const result = await api.listFloors(building.id)
      if (result.some((floor) => !isUuid(floor.id) || !sameId(floor.building_id, building.id))) throw new Error('Floor identity mismatch')
      return result
    },
  })) : [] })
  const parentPending = zone.isSuccess && (buildings.isPending || floorQueries.some((query) => query.isPending))
  const parentError = buildings.isError || floorQueries.some((query) => query.isError)
  const matches = floorQueries.flatMap((query, index) => (query.data ?? []).filter((floor) => sameId(floor.id, zone.data!.floor_id)).map((floor) => ({ floor, building: buildings.data![index] })))
  const parent = !parentPending && !parentError && matches.length === 1 ? matches[0] : undefined
  const zones = useQuery({ queryKey: ['buildings', parent?.building.id, 'zones'], enabled: Boolean(parent), queryFn: async () => {
    const result = await api.listZones(parent!.building.id)
    const parentFloors = floorQueries.find((_, index) => sameId(buildings.data![index].id, parent!.building.id))?.data ?? []
    if (result.some((item) => !isUuid(item.id) || !parentFloors.some((floor) => sameId(floor.id, item.floor_id)))) throw new Error('Zone hierarchy mismatch')
    return result
  } })
  const devices = useQuery({ queryKey: ['zones', zoneId, 'devices'], enabled: zone.isSuccess && includeDevices, queryFn: async () => {
    const result = await api.listDevices(zoneId!)
    if (result.some((device) => !isUuid(device.id) || !sameId(device.zone_id, zoneId!))) throw new Error('Device identity mismatch')
    return result
  } })
  function retryParent() { void buildings.refetch(); floorQueries.forEach((query) => { if (query.isError) void query.refetch() }) }
  return { valid: Boolean(zoneId), zone, buildings, parent, parentPending, parentError, retryParent, zones, devices }
}

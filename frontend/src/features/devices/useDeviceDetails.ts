import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { isUuid, sameId } from '../buildings/useBuildingDetails'
import { useZoneDetails } from '../buildings/useZoneDetails'

export function useDeviceDetails(routeId?: string) {
  const deviceId = isUuid(routeId) ? routeId.toLowerCase() : undefined
  const device = useQuery({ queryKey: ['devices', deviceId], enabled: Boolean(deviceId), retry: false, queryFn: async () => {
    const result = await api.getDevice(deviceId!)
    if (!sameId(result.id, deviceId!) || !isUuid(result.zone_id)) throw new Error('Device identity mismatch')
    return result
  } })
  const context = useZoneDetails(device.isSuccess ? device.data.zone_id : undefined, false)
  const zoneId = context.zone.isSuccess ? context.zone.data.id.toLowerCase() : undefined
  const history = useQuery({ queryKey: ['zones', zoneId, 'telemetry', 'recent', 10], enabled: Boolean(zoneId), queryFn: async () => {
    const result = await api.zoneTelemetry(zoneId!, 10)
    if (result.some((row) => !sameId(row.zone_id, zoneId!) || !Number.isFinite(Date.parse(row.recorded_at)))) throw new Error('Zone history identity mismatch')
    return result.slice(0, 10)
  } })
  return { valid: Boolean(deviceId), device, context, history }
}

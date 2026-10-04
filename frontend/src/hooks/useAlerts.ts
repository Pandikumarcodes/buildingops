import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AlertStatus } from '../types/api'

const ALERTS_REFRESH_MS = 7_000

export function useAlerts(status?: AlertStatus, enabled = true) {
  const limit = status === 'RESOLVED' ? 10 : 100
  return useQuery({
    queryKey: ['alerts', status ?? 'all', limit],
    queryFn: () => api.listAlerts(status, limit),
    refetchInterval: ALERTS_REFRESH_MS,
    enabled,
  })
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, websocketUrl } from '../api/client'
import type { ConnectionStatus, Telemetry } from '../types/api'
import { applyWebSocketMessage, isWebSocketMessage } from './telemetryState'
import { TelemetryContext } from './TelemetryContext'

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { data: latestData, error: telemetryError, refetch } = useQuery({
    queryKey: ['telemetry', 'latest'],
    queryFn: api.latestTelemetry,
  })
  const [telemetryByZone, setTelemetryByZone] = useState<Record<string, Telemetry>>({})
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const hasTelemetry = useRef(false)

  useEffect(() => {
    if (latestData && !hasTelemetry.current) {
      hasTelemetry.current = true
      setTelemetryByZone(latestData)
    }
  }, [latestData])

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | undefined
    let reconnectTimer: number | undefined

    const connect = () => {
      if (disposed) return
      setConnectionStatus('connecting')
      socket = new WebSocket(websocketUrl())
      socket.onopen = () => {
        if (disposed) return
        setConnectionStatus('live')
        void refetch().then((result) => {
          if (result.data && !disposed) {
            hasTelemetry.current = true
            setTelemetryByZone((current) => ({ ...current, ...result.data }))
          }
        })
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const message: unknown = JSON.parse(event.data)
          if (!isWebSocketMessage(message)) return
          hasTelemetry.current = true
          setTelemetryByZone((current) => applyWebSocketMessage(current, message))
        } catch {
          // Ignore malformed messages; the backend contract is the source of truth.
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setConnectionStatus('disconnected')
        reconnectTimer = window.setTimeout(connect, 1500)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [refetch])

  return (
    <TelemetryContext.Provider value={{ telemetryByZone, connectionStatus, telemetryError }}>
      {children}
    </TelemetryContext.Provider>
  )
}

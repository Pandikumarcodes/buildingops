import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { StatusPill } from '../components/TelemetryValue'
import { useDashboardData } from '../hooks/useDashboardData'
import { useTelemetry } from '../realtime/useTelemetry'
import { metric, telemetryAge } from '../utils/format'

export function LiveMonitorPage() {
  const dashboard = useDashboardData()
  const { telemetryByZone, connectionStatus, telemetryError } = useTelemetry()
  if (dashboard.isLoading) return <LoadingState />
  if (dashboard.error) return <ErrorState message={dashboard.error.message} />
  if (!dashboard.building) return <EmptyState message="No building data is available yet." />

  return <section className="page">
    <header className="page-header">
      <div><p className="eyebrow">Live zone monitor</p><h1>Current zone conditions</h1><p className="muted">{dashboard.building.name} · Simulated telemetry</p></div>
      <div className={`connection-indicator connection-indicator--${connectionStatus}`} role="status"><span />{connectionStatus === 'live' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected'}</div>
    </header>
    {telemetryError && <p className="inline-warning">REST telemetry could not be loaded. Realtime updates may still arrive.</p>}
    {dashboard.zones.length === 0 ? <EmptyState message="No zones are configured for this building." /> : <div className="live-zone-list">
      {dashboard.zones.map((zone) => {
        const item = telemetryByZone[zone.code]
        const floor = dashboard.floors.find((entry) => entry.id === zone.floor_id)
        return <article className="live-zone-card" key={zone.id}>
          <div className="live-zone-card__heading"><div><h2>{zone.name}</h2><p>{floor?.name ?? 'Unknown floor'} · {zone.code}</p></div><StatusPill telemetry={item} /></div>
          {!item ? <p className="no-telemetry">No telemetry yet</p> : <><dl className="live-metrics">
            <div><dt>Temperature</dt><dd>{metric(item.temperature, '°C')}</dd></div><div><dt>Humidity</dt><dd>{metric(item.humidity, '%')}</dd></div><div><dt>CO₂</dt><dd>{metric(item.co2_ppm, 'ppm', 0)}</dd></div><div><dt>Occupancy</dt><dd>{metric(item.occupancy, 'people', 0)}</dd></div>
            <div><dt>HVAC setpoint</dt><dd>{metric(item.hvac_setpoint, '°C')}</dd></div><div><dt>HVAC power</dt><dd>{metric(item.hvac_power_kw, 'kW')}</dd></div><div><dt>Zone power</dt><dd>{metric(item.zone_power_kw, 'kW')}</dd></div><div><dt>Last updated</dt><dd>{telemetryAge(item.timestamp)}</dd></div>
          </dl><p className="timestamp">{new Date(item.timestamp).toLocaleString()}</p></>}
        </article>
      })}
    </div>}
  </section>
}

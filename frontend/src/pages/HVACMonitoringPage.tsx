import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { StatusPill } from '../components/TelemetryValue'
import { useDashboardData } from '../hooks/useDashboardData'
import { useTelemetry } from '../realtime/useTelemetry'
import { metric, telemetryAge } from '../utils/format'
import { temperatureDifference } from '../utils/hvac'

function connectionLabel(status: 'connecting' | 'live' | 'disconnected'): string {
  return status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Disconnected'
}

export function HVACMonitoringPage() {
  const dashboard = useDashboardData()
  const { telemetryByZone, connectionStatus, telemetryError } = useTelemetry()

  if (dashboard.isLoading) return <LoadingState />
  if (dashboard.error) return <ErrorState message={dashboard.error.message} />
  if (!dashboard.building) return <EmptyState message="No building data is available yet." />

  const telemetry = Object.values(telemetryByZone)
  const unitsRunning = telemetry.filter((item) => item.hvac_status === 'ON').length
  const totalHvacPower = telemetry.reduce((total, item) => total + item.hvac_power_kw, 0)
  const temperatures = telemetry.map((item) => item.temperature).filter(Number.isFinite)
  const averageTemperature = temperatures.length
    ? temperatures.reduce((total, temperature) => total + temperature, 0) / temperatures.length
    : undefined

  return <section className="page">
    <header className="page-header">
      <div><p className="eyebrow">HVAC operations</p><h1>HVAC Monitoring</h1><p className="muted">Realtime HVAC operating conditions across the building.</p></div>
      <div className={`connection-indicator connection-indicator--${connectionStatus}`} role="status"><span />{connectionLabel(connectionStatus)}</div>
    </header>
    {telemetryError && <p className="inline-warning">REST telemetry could not be loaded. Realtime updates may still arrive.</p>}
    <div className="summary-grid" aria-label="HVAC summary">
      <article className="summary-card"><span>HVAC Units</span><strong>{dashboard.zones.length}</strong><small>Configured zone units</small></article>
      <article className="summary-card"><span>Units Running</span><strong>{unitsRunning}</strong><small>HVAC status is ON</small></article>
      <article className="summary-card"><span>Total HVAC Power</span><strong>{metric(totalHvacPower, 'kW')}</strong><small>Latest reported demand</small></article>
      <article className="summary-card"><span>Average Zone Temperature</span><strong>{metric(averageTemperature, '°C')}</strong><small>Zones with telemetry</small></article>
    </div>
    <section className="section-block">
      <div className="section-heading"><div><p className="eyebrow">Current operation</p><h2>Zone HVAC status</h2></div><p className="muted">Simulated telemetry</p></div>
      {dashboard.zones.length === 0 ? <EmptyState message="No zones are configured for this building." /> : <div className="hvac-zone-grid">
        {dashboard.zones.map((zone) => {
          const item = telemetryByZone[zone.code]
          const floor = dashboard.floors.find((entry) => entry.id === zone.floor_id)
          return <article className="hvac-zone-card" key={zone.id}>
            <div className="live-zone-card__heading"><div><h3>{zone.name}</h3><p>{floor?.name ?? 'Unknown floor'}</p></div><StatusPill telemetry={item} /></div>
            {!item ? <p className="no-telemetry">No telemetry yet</p> : <dl className="hvac-metrics">
              <div><dt>Current temperature</dt><dd>{metric(item.temperature, '°C')}</dd></div>
              <div><dt>HVAC setpoint</dt><dd>{metric(item.hvac_setpoint, '°C')}</dd></div>
              <div><dt>Temperature vs setpoint</dt><dd>{temperatureDifference(item.temperature, item.hvac_setpoint)}</dd></div>
              <div><dt>HVAC power</dt><dd>{metric(item.hvac_power_kw, 'kW')}</dd></div>
              <div><dt>Occupancy</dt><dd>{metric(item.occupancy, 'people', 0)}</dd></div>
              <div><dt>Last updated</dt><dd>{telemetryAge(item.timestamp)}</dd></div>
            </dl>}
          </article>
        })}
      </div>}
    </section>
  </section>
}

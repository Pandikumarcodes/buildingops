import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { StatusPill } from '../components/TelemetryValue'
import { useDashboardData } from '../hooks/useDashboardData'
import { useTelemetry } from '../realtime/useTelemetry'
import { metric } from '../utils/format'
import { useAlerts } from '../hooks/useAlerts'

export function OverviewPage() {
  const dashboard = useDashboardData()
  const { telemetryByZone, telemetryError } = useTelemetry()
  const alerts = useAlerts('ACTIVE')

  if (dashboard.isLoading) return <LoadingState />
  if (dashboard.error) return <ErrorState message={dashboard.error.message} />
  if (!dashboard.building) return <EmptyState message="No building data is available yet." />

  const telemetry = Object.values(telemetryByZone)
  const occupancy = telemetry.reduce((total, item) => total + item.occupancy, 0)
  const power = telemetry.reduce((total, item) => total + item.zone_power_kw, 0)

  return (
    <section className="page">
      <header className="page-header">
        <div><p className="eyebrow">Building overview</p><h1>{dashboard.building.name}</h1><p className="muted">{dashboard.building.code} · Simulated telemetry</p></div>
        <div className="header-counts"><span>{dashboard.floors.length} floors</span><span>{dashboard.zones.length} zones</span><span>{dashboard.devices.length} devices</span></div>
      </header>
      {telemetryError && <p className="inline-warning">Initial telemetry is unavailable; waiting for a realtime snapshot.</p>}
      <div className="summary-grid" aria-label="Operational summary">
        <article className="summary-card"><span>Total Zones</span><strong>{dashboard.zones.length}</strong><small>Configured zones</small></article>
        <article className="summary-card"><span>Current Occupancy</span><strong>{occupancy}</strong><small>people in reported zones</small></article>
        <article className="summary-card"><span>Total Power</span><strong>{metric(power, 'kW')}</strong><small>latest zone demand</small></article>
        <article className="summary-card"><span>Active Alerts</span><strong>{alerts.isError ? '—' : (alerts.data?.length ?? 0)}</strong><small>{alerts.isError ? 'Alert data unavailable' : 'telemetry-driven alerts'}</small></article>
      </div>
      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">Current conditions</p><h2>Zone summary</h2></div><p className="muted">Updates from simulated telemetry</p></div>
        {dashboard.zones.length === 0 ? <EmptyState message="No zones are configured for this building." /> : (
          <div className="zone-summary-grid">
            {dashboard.zones.map((zone) => {
              const item = telemetryByZone[zone.code]
              return <article className="zone-summary-card" key={zone.id}>
                <div className="card-heading"><div><h3>{zone.name}</h3><p>{zone.code}</p></div><StatusPill telemetry={item} /></div>
                {!item ? <p className="no-telemetry">No telemetry yet</p> : <dl className="metric-grid">
                  <div><dt>Temperature</dt><dd>{metric(item.temperature, '°C')}</dd></div>
                  <div><dt>CO₂</dt><dd>{metric(item.co2_ppm, 'ppm', 0)}</dd></div>
                  <div><dt>Occupancy</dt><dd>{metric(item.occupancy, 'people', 0)}</dd></div>
                  <div><dt>Power</dt><dd>{metric(item.zone_power_kw, 'kW')}</dd></div>
                </dl>}
              </article>
            })}
          </div>
        )}
      </section>
    </section>
  )
}

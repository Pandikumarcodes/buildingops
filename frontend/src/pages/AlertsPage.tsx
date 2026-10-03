import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { useAlerts } from '../hooks/useAlerts'
import type { Alert, AlertType } from '../types/api'
import { metric } from '../utils/format'

const labels: Record<AlertType, string> = {
  HIGH_CO2: 'High CO₂',
  HIGH_TEMPERATURE: 'High Temperature',
  HIGH_ZONE_POWER: 'High Zone Power',
}

function value(alert: Alert) {
  if (alert.alert_type === 'HIGH_CO2') return metric(alert.trigger_value, 'ppm', 0)
  if (alert.alert_type === 'HIGH_TEMPERATURE') return metric(alert.trigger_value, '°C')
  return metric(alert.trigger_value, 'kW')
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function AlertCard({ alert, resolved = false }: { alert: Alert; resolved?: boolean }) {
  return <article className="alert-card">
    <div className="card-heading"><div><p className="eyebrow">{labels[alert.alert_type]}</p><h3>{alert.zone_name}</h3><p>{alert.floor_name}</p></div><div className="alert-badges"><span className="alert-badge">{alert.severity}</span><span className={resolved ? 'alert-status alert-status--resolved' : 'alert-status'}>{resolved ? 'Resolved' : 'Active'}</span></div></div>
    <p className="alert-message">{alert.message}</p>
    <dl className="alert-details"><div><dt>Trigger value</dt><dd>{value(alert)}</dd></div><div><dt>Triggered</dt><dd>{timestamp(alert.triggered_at)}</dd></div>{resolved && <div><dt>Resolved</dt><dd>{timestamp(alert.resolved_at)}</dd></div>}</dl>
  </article>
}

export function AlertsPage() {
  const active = useAlerts('ACTIVE')
  const resolved = useAlerts('RESOLVED')
  if (active.isLoading || resolved.isLoading) return <LoadingState />
  if (active.error || resolved.error) return <ErrorState message={(active.error ?? resolved.error)!.message} />
  const activeAlerts = active.data ?? []
  const resolvedAlerts = resolved.data ?? []
  const affectedZones = new Set(activeAlerts.map((alert) => alert.zone_id)).size
  return <section className="page">
    <header className="page-header"><div><p className="eyebrow">Operations</p><h1>Alerts &amp; Incidents</h1><p className="muted">Telemetry-driven operational alerts across the building.</p></div></header>
    <div className="summary-grid" aria-label="Alert summary">
      <article className="summary-card"><span>Active Alerts</span><strong>{activeAlerts.length}</strong><small>requiring attention</small></article>
      <article className="summary-card"><span>Resolved Recently</span><strong>{resolvedAlerts.length}</strong><small>latest alert occurrences</small></article>
      <article className="summary-card"><span>Affected Zones</span><strong>{affectedZones}</strong><small>with active alerts</small></article>
    </div>
    <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Current state</p><h2>Active alerts</h2></div></div>{activeAlerts.length ? <div className="alert-list">{activeAlerts.map((alert) => <AlertCard alert={alert} key={alert.id} />)}</div> : <EmptyState message="No active telemetry alerts." />}</section>
    <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Alert history</p><h2>Recently resolved</h2></div></div>{resolvedAlerts.length ? <div className="alert-list">{resolvedAlerts.map((alert) => <AlertCard alert={alert} key={alert.id} resolved />)}</div> : <EmptyState message="No recently resolved alerts." />}</section>
  </section>
}

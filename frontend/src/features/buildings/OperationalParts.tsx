import { Link } from 'react-router-dom'
import type { Alert, Telemetry } from '../../types/api'
import { metric, telemetryAge } from '../../utils/format'
import { zoneStatus } from './operationalData'

export function DetailSkeleton({ label }: { label: string }) {
  return <div className="details-skeleton" role="status" aria-label={label}><span className="buildings-sr-only">{label}</span><div aria-hidden="true" /></div>
}
export function LocalError({ title, retry }: { title: string; retry: () => void }) {
  return <div className="buildings-state" role="alert"><h3>{title}</h3><button className="building-primary" onClick={retry}>Retry {title.replace('Unable to load ', '')}</button></div>
}
export function OperationalStatus({ reading, hasAlert, now }: { reading?: Telemetry; hasAlert: boolean; now: number }) {
  const status = zoneStatus(reading, hasAlert, now)
  return <span className={`operational-status operational-status--${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
}
export function Conditions({ reading, compact = false }: { reading?: Telemetry; compact?: boolean }) {
  return <><dl className="condition-grid">
    <div><dt>Temperature</dt><dd>{metric(reading?.temperature, '°C')}</dd></div>
    {!compact && <div><dt>Humidity</dt><dd>{metric(reading?.humidity, '%')}</dd></div>}
    <div><dt>CO₂</dt><dd>{metric(reading?.co2_ppm, 'ppm', 0)}</dd></div>
    <div><dt>Occupancy</dt><dd>{metric(reading?.occupancy, 'people', 0)}</dd></div>
    {compact ? <div><dt>HVAC</dt><dd>{reading?.hvac_status ?? '—'}</dd></div> : <div><dt>Zone power</dt><dd>{metric(reading?.zone_power_kw, 'kW')}</dd></div>}
  </dl>{!reading ? <p className="hierarchy-empty">No telemetry available.</p> : <p className="timestamp">Updated {telemetryAge(reading.timestamp)} · {Number.isFinite(Date.parse(reading.timestamp)) ? new Date(reading.timestamp).toLocaleString() : 'Unknown source timestamp'}</p>}</>
}
export function ActiveAlertList({ alerts, saturated, emptyMessage = 'No active alerts.' }: { alerts: Alert[]; saturated: boolean; emptyMessage?: string }) {
  return <><p className="muted">Read-only active alerts · latest 100 application-wide{ saturated ? ' · results may be incomplete' : '' }</p>
    {alerts.length === 0 ? <p>{saturated ? 'No matching alerts in the returned results.' : emptyMessage}</p> : <ul className="active-detail-alerts">{alerts.map((alert) => <li key={alert.id}><Link to={`/zones/${alert.zone_id}`}>{alert.zone_name}</Link><strong>{alert.alert_type.replaceAll('_', ' ')}</strong><span>{alert.severity}</span><p>{alert.message}</p><span>Triggered {new Date(alert.triggered_at).toLocaleString()}</span></li>)}</ul>}
  </>
}

import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAlerts } from '../../hooks/useAlerts'
import { useTelemetry } from '../../realtime/useTelemetry'
import { metric } from '../../utils/format'
import { ActiveAlertList, Conditions, DetailSkeleton, LocalError } from '../buildings/OperationalParts'
import { scopedReading, useOperationalClock, zoneStatus } from '../buildings/operationalData'
import { sameId } from '../buildings/useBuildingDetails'
import { useDeviceDetails } from './useDeviceDetails'
import '../buildings/buildings.css'
import './devices.css'

const typeLabels = { ENVIRONMENT_SENSOR: 'Environmental', OCCUPANCY_SENSOR: 'Occupancy', ENERGY_METER: 'Energy', HVAC_UNIT: 'HVAC' }

export function DeviceDetailsPage() {
  const { deviceId } = useParams()
  const { valid, device, context, history } = useDeviceDetails(deviceId)
  const { zone, parent } = context
  const alerts = useAlerts('ACTIVE', zone.isSuccess)
  const { telemetryByZone, telemetryError } = useTelemetry()
  const loadingLatest = useIsFetching({ queryKey: ['telemetry', 'latest'] }) > 0
  const queryClient = useQueryClient()
  const now = useOperationalClock()
  const reading = zone.isSuccess ? scopedReading(parent?.building, context.buildings.isError ? undefined : context.buildings.data, context.zones.isError ? undefined : context.zones.data, zone.data, telemetryByZone) : undefined
  const zoneAlerts = alerts.isError ? [] : alerts.data?.filter((alert) => alert.status === 'ACTIVE' && zone.isSuccess && sameId(alert.zone_id, zone.data.id)) ?? []
  const status = zoneStatus(reading, zoneAlerts.length > 0, now)
  const currentPending = device.isSuccess && (zone.isPending || context.parentPending || (parent && context.zones.isPending) || (loadingLatest && !reading))
  return <section className="page buildings-page device-details-page">
    <Link className="building-back" to={zone.isSuccess ? `/zones/${zone.data.id}` : '/buildings'}>{zone.isSuccess ? `← ${zone.data.name}` : '← Back to Buildings'}</Link>
    {!valid ? <div className="buildings-state" role="alert"><h1>Invalid device ID</h1></div>
      : device.isPending ? <><DetailSkeleton label="Loading device identity" /><DetailSkeleton label="Loading parent context" /><DetailSkeleton label="Loading current zone conditions" /><DetailSkeleton label="Loading recent zone telemetry" /><DetailSkeleton label="Loading zone alerts" /></>
      : device.isError ? <div className="buildings-state" role="alert"><h1>{device.error instanceof ApiError && device.error.status === 404 ? 'Device not found' : 'Unable to load device'}</h1><button className="building-primary" onClick={() => void device.refetch()}>Retry device</button></div>
      : <>
        <nav className="device-breadcrumbs" aria-label="Device breadcrumbs"><Link to="/buildings">Buildings</Link>{parent && <><span aria-hidden="true">›</span><Link to={`/buildings/${parent.building.id}`}>{parent.building.name}</Link><span aria-hidden="true">›</span><Link to={`/buildings/${parent.building.id}/floors/${parent.floor.id}`}>Floor {parent.floor.floor_number}</Link></>}{zone.isSuccess && <><span aria-hidden="true">›</span><Link to={`/zones/${zone.data.id}`}>{zone.data.name}</Link></>}<span aria-hidden="true">›</span><span aria-current="page">{device.data.device_id}</span></nav>
        <header className="page-header"><div><p className="eyebrow">Device details · {typeLabels[device.data.device_type]}</p><h1>{device.data.name}</h1><p className="building-card__code">{device.data.device_id}</p></div><div><span className="operational-status">Configured</span><span className={`operational-status operational-status--${status.toLowerCase().replace(' ', '-')}`}>{currentPending ? 'Loading zone context' : status === 'No telemetry' ? 'No Zone Telemetry' : `Zone ${status}`}</span><p className="buildings-demo-label">Simulated building data</p></div></header>
        {zone.isError ? <LocalError title="Unable to load parent zone" retry={() => void zone.refetch()} /> : zone.isPending || context.parentPending ? <DetailSkeleton label="Loading parent context" /> : context.parentError ? <LocalError title="Unable to load parent hierarchy" retry={context.retryParent} /> : !parent ? <div className="buildings-state" role="alert">Parent floor/building context could not be resolved uniquely.</div> : null}
        <div className="device-overview-grid"><section className="operational-card" aria-labelledby="device-information"><h2 id="device-information">Device Information</h2><dl className="condition-grid"><div><dt>Device ID</dt><dd>{device.data.device_id}</dd></div><div><dt>Type</dt><dd>{typeLabels[device.data.device_type]}</dd></div><div><dt>Zone</dt><dd>{zone.isSuccess ? zone.data.name : 'Unavailable'}</dd></div><div><dt>Floor</dt><dd>{parent ? `Floor ${parent.floor.floor_number}: ${parent.floor.name}` : 'Unavailable'}</dd></div><div><dt>Building</dt><dd>{parent?.building.name ?? 'Unavailable'}</dd></div><div><dt>UUID</dt><dd className="device-uuid">{device.data.id}</dd></div></dl></section>
        <section className="operational-card" aria-labelledby="device-zone-conditions"><h2 id="device-zone-conditions">Current Zone Conditions</h2><p className="muted">Zone-level readings provide operational context; they are not guaranteed to originate from this device.</p>
          {telemetryError ? <LocalError title="Unable to load current zone telemetry" retry={() => void queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest'] })} /> : null}
          {context.zones.isError && <LocalError title="Unable to load telemetry context" retry={() => void context.zones.refetch()} />}
          {currentPending ? <DetailSkeleton label="Loading current zone conditions" /> : <>
            <dl className="device-relevance" aria-label={`${typeLabels[device.data.device_type]} zone context`}>{device.data.device_type === 'ENVIRONMENT_SENSOR' ? <><div><dt>Temperature</dt><dd>{metric(reading?.temperature, '°C')}</dd></div><div><dt>Humidity</dt><dd>{metric(reading?.humidity, '%')}</dd></div><div><dt>CO₂</dt><dd>{metric(reading?.co2_ppm, 'ppm', 0)}</dd></div></> : device.data.device_type === 'OCCUPANCY_SENSOR' ? <div><dt>Occupancy</dt><dd>{metric(reading?.occupancy, 'people', 0)}</dd></div> : device.data.device_type === 'ENERGY_METER' ? <div><dt>Zone power</dt><dd>{metric(reading?.zone_power_kw, 'kW')}</dd></div> : <><div><dt>HVAC state</dt><dd>{reading?.hvac_status ?? '—'}</dd></div><div><dt>Setpoint</dt><dd>{metric(reading?.hvac_setpoint, '°C')}</dd></div><div><dt>HVAC power</dt><dd>{metric(reading?.hvac_power_kw, 'kW')}</dd></div></>}</dl>
            <Conditions reading={reading} /><dl className="condition-grid"><div><dt>HVAC state</dt><dd>{reading?.hvac_status ?? '—'}</dd></div><div><dt>HVAC setpoint</dt><dd>{metric(reading?.hvac_setpoint, '°C')}</dd></div><div><dt>HVAC power</dt><dd>{metric(reading?.hvac_power_kw, 'kW')}</dd></div></dl>
          </>}
        </section></div>
        <section className="section-block" aria-labelledby="device-history"><h2 id="device-history">Recent Zone Telemetry</h2><p className="muted">Latest 10 persisted zone readings · newest first · zone-level, not device-sourced.</p>{zone.isError ? <p>Parent zone unavailable.</p> : history.isPending ? <DetailSkeleton label="Loading recent zone telemetry" /> : history.isError ? <LocalError title="Unable to load recent zone telemetry" retry={() => void history.refetch()} /> : history.data.length === 0 ? <p className="buildings-state">No recent zone telemetry</p> : <div className="device-history-table" tabIndex={0} role="region" aria-label="Recent zone readings table"><table><caption className="buildings-sr-only">Recent readings for {zone.data?.name}</caption><thead><tr><th scope="col">Recorded</th><th scope="col">Temperature °C</th><th scope="col">CO₂ ppm</th><th scope="col">Occupancy</th><th scope="col">Zone kW</th><th scope="col">HVAC kW</th></tr></thead><tbody>{history.data.map((row) => <tr key={row.id}><th scope="row">{new Date(row.recorded_at).toLocaleString()}</th><td>{metric(row.temperature, '°C')}</td><td>{metric(row.co2_ppm, 'ppm', 0)}</td><td>{metric(row.occupancy, 'people', 0)}</td><td>{metric(row.zone_power_kw, 'kW')}</td><td>{metric(row.hvac_power_kw, 'kW')}</td></tr>)}</tbody></table></div>}</section>
        <section className="section-block" aria-labelledby="device-zone-alerts"><h2 id="device-zone-alerts">Zone Alerts</h2>{zone.isError ? <p>Parent zone unavailable.</p> : alerts.isPending ? <DetailSkeleton label="Loading zone alerts" /> : alerts.isError ? <LocalError title="Unable to load zone alerts" retry={() => void alerts.refetch()} /> : <ActiveAlertList alerts={zoneAlerts} saturated={alerts.data.length >= 100} emptyMessage="No active zone alerts" />}</section>
      </>}
  </section>
}

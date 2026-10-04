import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAlerts } from '../../hooks/useAlerts'
import { useTelemetry } from '../../realtime/useTelemetry'
import { metric } from '../../utils/format'
import { sameId } from './useBuildingDetails'
import { useZoneDetails } from './useZoneDetails'
import { scopedReading, useOperationalClock } from './operationalData'
import { ActiveAlertList, Conditions, DetailSkeleton, LocalError, OperationalStatus } from './OperationalParts'
import './buildings.css'

const deviceLabels = { ENVIRONMENT_SENSOR: 'Environmental sensor', OCCUPANCY_SENSOR: 'Occupancy sensor', ENERGY_METER: 'Energy meter', HVAC_UNIT: 'HVAC unit' }

export function ZoneDetailsPage() {
  const { zoneId } = useParams()
  const data = useZoneDetails(zoneId)
  const { zone, parent, devices } = data
  const alerts = useAlerts('ACTIVE', zone.isSuccess)
  const { telemetryByZone, telemetryError } = useTelemetry()
  const latestLoading = useIsFetching({ queryKey: ['telemetry', 'latest'] }) > 0
  const queryClient = useQueryClient()
  const now = useOperationalClock()
  const reading = zone.data ? scopedReading(parent?.building, data.buildings.isError ? undefined : data.buildings.data, data.zones.isError ? undefined : data.zones.data, zone.data, telemetryByZone) : undefined
  const zoneAlerts = alerts.data?.filter((alert) => alert.status === 'ACTIVE' && zone.data && sameId(alert.zone_id, zone.data.id)) ?? []
  return <section className="page buildings-page">
    <Link className="building-back" to={parent ? `/buildings/${parent.building.id}/floors/${parent.floor.id}` : '/buildings'}>{parent ? `← Floor ${parent.floor.floor_number}` : '← Back to Buildings'}</Link>
    {!data.valid ? <div className="buildings-state" role="alert"><h1>Invalid zone ID</h1></div>
      : zone.isPending ? <><DetailSkeleton label="Loading zone header" /><DetailSkeleton label="Loading telemetry cards" /><DetailSkeleton label="Loading devices" /><DetailSkeleton label="Loading zone alerts" /></>
      : zone.isError ? <div className="buildings-state" role="alert"><h1>{zone.error instanceof ApiError && zone.error.status === 404 ? 'Zone not found' : 'Unable to load zone'}</h1><button className="building-primary" onClick={() => void zone.refetch()}>Retry zone</button></div>
      : <><header className="page-header"><div><p className="eyebrow">Zone details · {zone.data.code}</p><h1>{zone.data.name}</h1>{parent && <p className="muted">{parent.building.name} · {parent.building.code} · Floor {parent.floor.floor_number}: {parent.floor.name}</p>}<p className="hierarchy-id">Zone UUID: {zone.data.id}</p></div><div><OperationalStatus reading={reading} hasAlert={zoneAlerts.length > 0} now={now} /><p className="buildings-demo-label">Simulated telemetry</p></div></header>
        {data.parentPending ? <DetailSkeleton label="Loading building and floor context" /> : data.parentError ? <LocalError title="Unable to load parent context" retry={data.retryParent} /> : !parent ? <div className="buildings-state" role="alert">Parent floor/building context could not be resolved uniquely.</div> : null}
        {data.zones.isError && <LocalError title="Unable to load telemetry context" retry={() => void data.zones.refetch()} />}
        {telemetryError && <LocalError title="Unable to load latest telemetry" retry={() => void queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest'] })} />}
        <div className="zone-condition-layout"><section className="operational-card" aria-labelledby="current-conditions"><h2 id="current-conditions">Current Conditions</h2>
          {data.parentPending || (parent && data.zones.isPending) || (latestLoading && !reading) ? <DetailSkeleton label="Loading current conditions" /> : <Conditions reading={reading} />}
          {parent && parent.building.code !== 'DEMO-BLDG-01' && <p className="hierarchy-empty">Current telemetry is unavailable for this building.</p>}
        </section><section className="operational-card" aria-labelledby="zone-hvac"><h2 id="zone-hvac">HVAC</h2><dl className="condition-grid"><div><dt>Status</dt><dd>{reading?.hvac_status ?? '—'}</dd></div><div><dt>Setpoint</dt><dd>{metric(reading?.hvac_setpoint, '°C')}</dd></div><div><dt>HVAC power</dt><dd>{metric(reading?.hvac_power_kw, 'kW')}</dd></div></dl></section></div>
        <section className="section-block" aria-labelledby="zone-devices"><h2 id="zone-devices">Devices</h2><p className="muted">Configured devices · zone telemetry does not indicate individual device connection state.</p>
          {devices.isPending ? <DetailSkeleton label="Loading devices" /> : devices.isError ? <LocalError title="Unable to load devices" retry={() => void devices.refetch()} /> : devices.data.length === 0 ? <p className="buildings-state">No devices configured.</p> : <ul className="zone-device-grid">{devices.data.map((device) => <li className="operational-card" key={device.id}><h3>{device.device_id}</h3><p>{device.name}</p><p className="muted">{deviceLabels[device.device_type]}</p><Link className="hierarchy-link" to={`/devices/${device.id}`}>View Device: {device.device_id} →</Link></li>)}</ul>}
        </section>
        <section className="section-block" aria-labelledby="zone-alerts"><h2 id="zone-alerts">Active Alerts</h2>{alerts.isPending ? <DetailSkeleton label="Loading zone alerts" /> : alerts.isError ? <LocalError title="Unable to load alerts" retry={() => void alerts.refetch()} /> : <ActiveAlertList alerts={zoneAlerts} saturated={alerts.data.length >= 100} />}</section>
      </>}
  </section>
}

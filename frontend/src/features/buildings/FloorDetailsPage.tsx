import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import { useAlerts } from '../../hooks/useAlerts'
import { useTelemetry } from '../../realtime/useTelemetry'
import { isUuid, sameId, useBuildingDetails } from './useBuildingDetails'
import { canAttributeTelemetry, scopedReading, zoneStatus, useOperationalClock } from './operationalData'
import { ActiveAlertList, Conditions, DetailSkeleton, LocalError, OperationalStatus } from './OperationalParts'
import './buildings.css'

export function FloorDetailsPage() {
  const { buildingId, floorId } = useParams()
  return isUuid(buildingId) && isUuid(floorId) ? <FloorDetails buildingId={buildingId} floorId={floorId} /> : <section className="page buildings-page"><Link className="building-back" to="/buildings">← Back to Buildings</Link><div className="buildings-state" role="alert"><h1>Invalid floor destination</h1></div></section>
}
function FloorDetails({ buildingId, floorId }: { buildingId: string; floorId: string }) {
  const data = useBuildingDetails(buildingId, true, floorId)
  const { building, floors, zones, scopedZones, devices } = data
  const floor = floors.data?.find((item) => sameId(item.id, floorId))
  const portfolio = useQuery({ queryKey: ['buildings'], queryFn: api.listBuildings, enabled: Boolean(floor) })
  const alerts = useAlerts('ACTIVE', Boolean(floor))
  const { telemetryByZone, telemetryError } = useTelemetry()
  const latestLoading = useIsFetching({ queryKey: ['telemetry', 'latest'] }) > 0
  const queryClient = useQueryClient()
  const now = useOperationalClock()
  const ready = floors.isSuccess && zones.isSuccess && !data.zoneIdentityError
  const floorAlerts = alerts.data?.filter((alert) => alert.status === 'ACTIVE' && scopedZones.some((zone) => sameId(zone.id, alert.zone_id))) ?? []
  const totalDevices = devices.some((query) => query.isError) ? 'Unavailable' : !ready || devices.some((query) => query.isPending) ? 'Loading' : devices.reduce((sum, query) => sum + (query.data?.length ?? 0), 0)
  const freshZones = portfolio.isError || zones.isError || data.zoneIdentityError || telemetryError ? 'Unavailable' : portfolio.isPending || !ready || latestLoading ? 'Loading' : building.data?.code !== 'DEMO-BLDG-01' || !scopedZones.every((zone) => canAttributeTelemetry(building.data, portfolio.data, zones.data, zone)) ? 'Unavailable' : scopedZones.filter((zone) => zoneStatus(scopedReading(building.data, portfolio.data, zones.data, zone, telemetryByZone), false, now) === 'Live').length
  return <section className="page buildings-page">
    <Link className="building-back" to={`/buildings/${buildingId.toLowerCase()}`}>← Back to Building</Link>
    {building.isError || floors.isError ? <div className="buildings-state" role="alert"><h1>{building.error instanceof ApiError && building.error.status === 404 ? 'Building not found' : 'Unable to load floor destination'}</h1><button className="building-primary" onClick={() => { if (building.isError) void building.refetch(); if (floors.isError) void floors.refetch() }}>Retry</button></div>
      : building.isPending || floors.isPending ? <><DetailSkeleton label="Loading floor header" /><DetailSkeleton label="Loading floor summary" /><DetailSkeleton label="Loading zone cards" /></>
      : !floor ? <div className="buildings-state" role="alert"><h1>Floor not found in this building</h1></div>
      : <><header className="page-header"><div><p className="eyebrow">Floor details · {building.data.code}</p><h1>Floor {floor.floor_number}: {floor.name}</h1><p className="muted">{building.data.name}</p></div><span className="buildings-demo-label">Simulated telemetry</span></header>
        <dl className="building-details-summary" aria-label="Floor summary"><div><dt>Zones</dt><dd>{zones.isError || data.zoneIdentityError ? 'Unavailable' : ready ? scopedZones.length : <DetailSkeleton label="Loading zone count" />}</dd></div><div><dt>Devices</dt><dd>{totalDevices === 'Loading' ? <DetailSkeleton label="Loading device count" /> : totalDevices}</dd></div><div><dt>Zones with fresh telemetry</dt><dd>{freshZones === 'Loading' ? <DetailSkeleton label="Loading fresh telemetry count" /> : freshZones}</dd></div></dl>
        {telemetryError && <LocalError title="Unable to load latest telemetry" retry={() => void queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest'] })} />}
        {portfolio.isError && <LocalError title="Unable to load telemetry context" retry={() => void portfolio.refetch()} />}
        <section aria-labelledby="floor-zones"><h2 id="floor-zones">Zones</h2>
          {zones.isError || data.zoneIdentityError ? <LocalError title="Unable to load zones" retry={() => void zones.refetch()} /> : !ready ? <DetailSkeleton label="Loading zone cards" /> : scopedZones.length === 0 ? <p className="buildings-state">No zones configured on this floor.</p> : <div className="operational-zone-grid">{scopedZones.map((zone, index) => {
            const reading = scopedReading(building.data, portfolio.isError ? undefined : portfolio.data, zones.data, zone, telemetryByZone)
            const zoneAlerts = floorAlerts.filter((alert) => sameId(alert.zone_id, zone.id))
            const query = devices[index]
            return <article className="operational-card" key={zone.id} aria-label={zone.name}><header><div><h3>{zone.name}</h3><p className="building-card__code">{zone.code}</p></div><OperationalStatus reading={reading} hasAlert={zoneAlerts.length > 0} now={now} /></header><p className="muted">{query.isError ? 'Device count unavailable' : query.isPending ? 'Loading devices' : `${query.data.length} devices`}</p>
              {query.isError && <LocalError title={`Unable to load devices for ${zone.name}`} retry={() => void query.refetch()} />}
              {latestLoading && !reading ? <DetailSkeleton label={`Loading telemetry for ${zone.name}`} /> : <Conditions compact reading={reading} />}
              <p className="muted">{alerts.isError ? 'Alerts unavailable' : alerts.isPending ? 'Loading alerts' : zoneAlerts.length ? `${zoneAlerts.length} active alerts` : alerts.data.length >= 100 ? 'No alerts in returned results' : 'No active alerts'}</p>
              {zoneStatus(reading, false, now) === 'Stale' && <p className="hierarchy-empty">Reading is stale.</p>}
              <Link className="hierarchy-link" to={`/zones/${zone.id}`}>View Zone: {zone.name} →</Link>
            </article>
          })}</div>}
        </section>
        <section className="section-block" aria-labelledby="floor-alerts"><h2 id="floor-alerts">Active Alerts</h2>{alerts.isPending ? <DetailSkeleton label="Loading floor alerts" /> : alerts.isError ? <LocalError title="Unable to load alerts" retry={() => void alerts.refetch()} /> : !ready ? <p>Floor zone context unavailable.</p> : <ActiveAlertList alerts={floorAlerts} saturated={alerts.data.length >= 100} />}</section>
      </>}
  </section>
}

import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { BuildingImage } from './BuildingImage'
import { sameId, useBuildingDetails } from './useBuildingDetails'
import './buildings.css'

const deviceLabels = { ENVIRONMENT_SENSOR: 'Environmental sensor', OCCUPANCY_SENSOR: 'Occupancy sensor', ENERGY_METER: 'Energy meter', HVAC_UNIT: 'HVAC unit' }

function Skeleton({ label, header = false }: { label: string; header?: boolean }) {
  return <div role="status" aria-label={label} className={`details-skeleton ${header ? 'details-skeleton--header' : ''}`}><span className="buildings-sr-only">{label}</span><div aria-hidden="true" /></div>
}

export function BuildingDestination() {
  const { buildingId } = useParams()
  const data = useBuildingDetails(buildingId)
  const { building, floors, zones, devices, scopedZones, zoneIdentityError } = data
  const notFound = building.error instanceof ApiError && building.error.status === 404
  const zonesReady = floors.isSuccess && zones.isSuccess && !zoneIdentityError
  const deviceCount = floors.isError || zones.isError || zoneIdentityError || devices.some((query) => query.isError) ? 'Unavailable' : !zonesReady || devices.some((query) => query.isPending) ? 'Loading' : devices.reduce((total, query) => total + (query.data?.length ?? 0), 0)
  return <section className="page buildings-page">
    <Link className="building-back" to="/buildings">← Back to Buildings</Link>
    {!data.valid ? <div className="buildings-state" role="alert"><h1>Invalid building ID</h1><p>Choose a building from your portfolio.</p></div>
      : building.isPending ? <><Skeleton header label="Loading building identity" /><Skeleton label="Loading building summary" /><Skeleton label="Loading hierarchy" /></>
      : building.isError ? <div className="buildings-state" role="alert"><h1>{notFound ? 'Building not found' : 'Unable to load building'}</h1><p>Choose a building from your portfolio or try again.</p>{!notFound && <button className="building-primary" onClick={() => void building.refetch()}>Retry</button>}</div>
      : <>
        <header className="building-details-header">
          <div><p className="eyebrow">Building details</p><h1>{building.data.name}</h1><p className="building-card__code">{building.data.code}</p><p className="muted">Building ID: {building.data.id}</p><span className="buildings-demo-label">Simulated building data</span></div>
          <BuildingImage key={building.data.id} building={building.data} />
        </header>
        <dl className="building-details-summary" aria-label="Building summary">
          <div><dt>Floors</dt><dd>{floors.isError ? 'Unavailable' : floors.isPending ? <Skeleton label="Loading floor count" /> : floors.data.length}</dd></div>
          <div><dt>Zones</dt><dd>{zones.isError || floors.isError || zoneIdentityError ? 'Unavailable' : !zonesReady ? <Skeleton label="Loading zone count" /> : scopedZones.length}</dd></div>
          <div><dt>Devices</dt><dd>{deviceCount === 'Loading' ? <Skeleton label="Loading device count" /> : deviceCount}</dd></div>
        </dl>
        <section aria-labelledby="hierarchy-heading"><h2 id="hierarchy-heading">Floors and zones</h2><p className="muted">Explore floors, their zones, and configured devices.</p>
          {zones.isError || zoneIdentityError ? <div className="buildings-state" role="alert"><h3>Unable to load zones</h3><button className="building-primary" onClick={() => void zones.refetch()}>Retry zones</button></div> : null}
          {floors.isError ? <div className="buildings-state" role="alert"><h3>Unable to load floors</h3><button className="building-primary" onClick={() => void floors.refetch()}>Retry floors</button></div>
            : floors.isPending ? <Skeleton label="Loading floors and zones" />
            : floors.data.length === 0 ? <div className="buildings-state"><h3>No floors configured</h3>{zonesReady && <p>No zones configured</p>}</div>
            : <div className="floor-grid">{[...floors.data].sort((a, b) => a.floor_number - b.floor_number).map((floor) => {
              const floorZones = scopedZones.filter((zone) => sameId(zone.floor_id, floor.id))
              return <article className="floor-card" key={floor.id} aria-label={`Floor ${floor.floor_number}: ${floor.name}`}>
                <header><div><p className="eyebrow">Floor {floor.floor_number}</p><h3>{floor.name}</h3><p className="muted">{zonesReady ? `${floorZones.length} zones` : 'Zone count unavailable'}</p></div><Link className="hierarchy-link" to={`/buildings/${building.data.id}/floors/${floor.id}`} aria-label={`View Floor ${floor.floor_number}: ${floor.name}`}>View Floor →</Link></header>
                <p className="hierarchy-id">Floor ID: {floor.id}</p>
                {zones.isPending ? <Skeleton label={`Loading zones for Floor ${floor.floor_number}`} /> : zonesReady && (floorZones.length === 0 ? <p className="hierarchy-empty">No zones configured</p> : <ul className="zone-list">{floorZones.map((zone) => {
                  const query = devices[scopedZones.indexOf(zone)]
                  return <li className="zone-card" key={zone.id}><header><div><h4>{zone.name}</h4><p className="building-card__code">{zone.code}</p><p className="muted">Floor {floor.floor_number} · {query.isError ? 'Device count unavailable' : query.isPending ? 'Loading devices' : `${query.data.length} devices`}</p></div><Link className="hierarchy-link" to={`/zones/${zone.id}`} aria-label={`View Zone: ${zone.name} (${zone.code})`}>View Zone →</Link></header>
                    {query.isError ? <div role="alert"><p>Unable to load devices</p><button className="building-retry" onClick={() => void query.refetch()}>Retry devices for {zone.name}</button></div> : query.isPending ? <Skeleton label={`Loading devices for ${zone.name}`} /> : query.data.length === 0 ? <p className="hierarchy-empty">No devices configured</p> : <ul className="device-list" aria-label={`Devices in ${zone.name}`}>{query.data.map((device) => <li key={device.id}><div><strong>{device.device_id}</strong><span>{device.name}</span></div><span>{deviceLabels[device.device_type]}</span></li>)}</ul>}
                  </li>
                })}</ul>)}
              </article>
            })}</div>}
        </section>
      </>}
  </section>
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { Building } from '../../types/api'
import { BuildingImage } from './BuildingImage'

export function BuildingCard({ building }: { building: Building }) {
  const floors = useQuery({ queryKey: ['buildings', building.id, 'floors'], queryFn: () => api.listFloors(building.id) })
  const zones = useQuery({ queryKey: ['buildings', building.id, 'zones'], queryFn: () => api.listZones(building.id) })
  function count(query: typeof floors | typeof zones) {
    return query.isError ? 'Unavailable' : query.data ? query.data.length : 'Loading'
  }
  return <article className="building-card">
    <BuildingImage key={building.id} building={building} />
    <div className="building-card__body">
      <p className="building-card__code">{building.code}</p><h2>{building.name}</h2>
      <p className="building-data-status"><span aria-hidden="true" />Operational status unavailable</p>
      <dl className="building-card__counts"><div><dt>Floors</dt><dd>{count(floors)}</dd></div><div><dt>Zones</dt><dd>{count(zones)}</dd></div></dl>
      {(floors.isError || zones.isError) && <button className="building-retry" onClick={() => { if (floors.isError) void floors.refetch(); if (zones.isError) void zones.refetch() }}>Retry hierarchy</button>}
      <Link className="building-card__link" to={`/buildings/${building.id}`} aria-label={`View Building: ${building.name} (${building.code})`}>View Building <span aria-hidden="true">→</span></Link>
    </div>
  </article>
}

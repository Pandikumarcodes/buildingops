import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { BuildingCard } from './BuildingCard'
import './buildings.css'

export function BuildingsPage() {
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.listBuildings })
  return <section className="page buildings-page">
    <header className="page-header"><div><p className="eyebrow">Your portfolio</p><h1>Buildings</h1><p className="muted">Manage and monitor buildings across your portfolio.</p></div><span className="buildings-demo-label">Simulated building data</span></header>
    {buildings.isPending ? <div role="status" aria-label="Loading buildings"><span className="buildings-sr-only">Loading buildings</span><div className="building-grid" aria-hidden="true">{[1, 2, 3].map((key) => <div className="building-card building-skeleton" key={key}><div /><div /><div /><div /></div>)}</div></div>
      : buildings.isError ? <div className="buildings-state" role="alert"><h2>Unable to load buildings</h2><p>Please try again to retrieve your portfolio.</p><button className="building-primary" onClick={() => void buildings.refetch()}>Retry</button></div>
      : buildings.data.length === 0 ? <div className="buildings-state"><h2>No buildings available</h2><p>Buildings connected to BuildingOps will appear here.</p></div>
      : <><div className="buildings-summary" aria-label="Portfolio summary"><div><span>Total Buildings</span><strong>{buildings.data.length}</strong></div><p>Explore your building hierarchy.<br /><span>Operational status is unavailable in this portfolio view.</span></p></div><div className="building-grid">{buildings.data.map((building) => <BuildingCard key={building.id} building={building} />)}</div></>}
  </section>
}

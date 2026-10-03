import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'Overview', to: '/' },
  { label: 'Live Monitor', to: '/live' },
  { label: 'HVAC', to: '/hvac' },
  { label: 'Energy', to: '/energy' },
  { label: 'Alerts', to: '/alerts' },
  { label: 'AI Assistant', to: '/ai' },
]

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark">B</span><span>BuildingOps</span></div>
        <p className="sidebar__label">Operations</p>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar__footnote">Simulated building data</p>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}

import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'Dashboard', to: '/' },
  { label: 'Buildings', to: '/buildings' },
  { label: 'Live Monitoring', to: '/live' },
  { label: 'HVAC', to: '/hvac' },
  { label: 'Analytics', to: '/energy' },
  { label: 'Alerts', to: '/alerts' },
  { label: 'Predictive Maintenance', to: null },
  { label: 'AI Assistant', to: '/ai' },
  { label: 'Reports', to: null },
  { label: 'Users & Access', to: null },
  { label: 'Settings', to: null },
]

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark">B</span><span>BuildingOps</span></div>
        <p className="sidebar__label">Operations</p>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => item.to === null ? (
            <span key={item.label} className="nav-link nav-link--disabled" aria-disabled="true">{item.label}<small>Planned</small></span>
          ) : (
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

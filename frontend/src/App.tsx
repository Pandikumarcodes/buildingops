import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { LoadingState } from './components/PageState'
import { TelemetryProvider } from './realtime/TelemetryProvider'

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })))
const LiveMonitorPage = lazy(() => import('./pages/LiveMonitorPage').then((module) => ({ default: module.LiveMonitorPage })))
const HVACMonitoringPage = lazy(() => import('./pages/HVACMonitoringPage').then((module) => ({ default: module.HVACMonitoringPage })))
const EnergyAnalyticsPage = lazy(() => import('./pages/EnergyAnalyticsPage').then((module) => ({ default: module.EnergyAnalyticsPage })))
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((module) => ({ default: module.AlertsPage })))
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage').then((module) => ({ default: module.AIAssistantPage })))

const BuildingsPage = lazy(() => import('./features/buildings/BuildingsPage').then((module) => ({ default: module.BuildingsPage })))
const BuildingDestination = lazy(() => import('./features/buildings/BuildingDestination').then((module) => ({ default: module.BuildingDestination })))
const FloorDestination = lazy(() => import('./features/buildings/HierarchyDestination').then((module) => ({ default: module.FloorDestination })))
const ZoneDestination = lazy(() => import('./features/buildings/HierarchyDestination').then((module) => ({ default: module.ZoneDestination })))
const DeviceDestination = lazy(() => import('./features/buildings/HierarchyDestination').then((module) => ({ default: module.DeviceDestination })))

function App() {
  return <TelemetryProvider><Suspense fallback={<LoadingState />}><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="buildings" element={<BuildingsPage />} />
        <Route path="buildings/:buildingId" element={<BuildingDestination />} />
        <Route path="buildings/:buildingId/floors/:floorId" element={<FloorDestination />} />
        <Route path="zones/:zoneId" element={<ZoneDestination />} />
        <Route path="devices/:deviceId" element={<DeviceDestination />} />
        <Route path="live" element={<LiveMonitorPage />} />
        <Route path="hvac" element={<HVACMonitoringPage />} />
        <Route path="energy" element={<EnergyAnalyticsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="ai" element={<AIAssistantPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></Suspense></TelemetryProvider>
}

export default App

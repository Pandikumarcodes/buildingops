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

function App() {
  return <TelemetryProvider><Suspense fallback={<LoadingState />}><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
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

import { useQueries } from '@tanstack/react-query'
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { useDashboardData } from '../hooks/useDashboardData'
import { useTelemetry } from '../realtime/useTelemetry'
import { metric } from '../utils/format'
import { aggregateBuildingPower, highestDemandZone, hvacSharePercent, nonHvacPower, totalBuildingPower, totalHvacPower } from '../utils/energy'
import { HistoricalAnalytics } from './HistoricalAnalytics'

function connectionLabel(status: 'connecting' | 'live' | 'disconnected'): string {
  return status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Disconnected'
}

function timeLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function EnergyAnalyticsPage() {
  const dashboard = useDashboardData()
  const { telemetryByZone, connectionStatus, telemetryError } = useTelemetry()
  const historyQueries = useQueries({
    queries: dashboard.zones.map((zone) => ({ queryKey: ['zones', zone.id, 'telemetry', 100], queryFn: () => api.zoneTelemetry(zone.id) })),
  })

  if (dashboard.isLoading) return <LoadingState />
  if (dashboard.error) return <ErrorState message={dashboard.error.message} />
  if (!dashboard.building) return <EmptyState message="No building data is available yet." />

  const currentTelemetry = Object.values(telemetryByZone)
  const buildingPower = totalBuildingPower(currentTelemetry)
  const hvacPower = totalHvacPower(currentTelemetry)
  const nonHvac = nonHvacPower(buildingPower, hvacPower)
  const highest = highestDemandZone(dashboard.zones, telemetryByZone)
  const zonePower = dashboard.zones.flatMap((zone) => {
    const sample = telemetryByZone[zone.code]
    return sample && Number.isFinite(sample.zone_power_kw) ? [{ name: zone.name, powerKw: sample.zone_power_kw }] : []
  })
  const shareData = [{ name: 'HVAC', value: hvacPower }, { name: 'Non-HVAC', value: nonHvac }]
  const histories = historyQueries.map((query) => query.data ?? [])
  const trend = aggregateBuildingPower(histories)
  const historyLoading = historyQueries.some((query) => query.isLoading)
  const historyError = historyQueries.find((query) => query.error)?.error

  return <section className="page">
    <header className="page-header">
      <div><p className="eyebrow">Energy operations</p><h1>Energy Analytics</h1><p className="muted">Current and recent power demand across the building.</p></div>
      <div className={`connection-indicator connection-indicator--${connectionStatus}`} role="status"><span />{connectionLabel(connectionStatus)}</div>
    </header>
    {telemetryError && <p className="inline-warning">REST telemetry could not be loaded. Last known realtime values remain available.</p>}
    <div className="summary-grid" aria-label="Energy summary">
      <article className="summary-card"><span>Current Building Power</span><strong>{metric(buildingPower, 'kW')}</strong><small>{currentTelemetry.length} zones reporting</small></article>
      <article className="summary-card"><span>HVAC Power</span><strong>{metric(hvacPower, 'kW')}</strong><small>{metric(hvacSharePercent(buildingPower, hvacPower), '%')} of current demand</small></article>
      <article className="summary-card"><span>Non-HVAC Power</span><strong>{metric(nonHvac, 'kW')}</strong><small>Current building demand minus HVAC</small></article>
      <article className="summary-card"><span>Highest Demand Zone</span><strong>{highest ? metric(highest.powerKw, 'kW') : '—'}</strong><small>{highest?.name ?? 'No telemetry yet'}</small></article>
    </div>
    <div className="energy-chart-grid">
      <section className="section-block chart-card">
        <div className="section-heading"><div><p className="eyebrow">Current demand</p><h2>Current Power by Zone</h2></div><p className="muted">Simulated telemetry</p></div>
        {zonePower.length === 0 ? <EmptyState message="No current zone power telemetry is available yet." /> : <div className="energy-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={zonePower} margin={{ top: 8, right: 12, left: 0, bottom: 34 }}><XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={60} tick={{ fontSize: 11 }} /><YAxis unit=" kW" width={64} /><Tooltip formatter={(value) => `${Number(value).toFixed(1)} kW`} /><Bar dataKey="powerKw" name="Power" fill="#28b99a" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </section>
      <section className="section-block chart-card">
        <div className="section-heading"><div><p className="eyebrow">Current demand</p><h2>HVAC Share</h2></div><p className="muted">{metric(hvacSharePercent(buildingPower, hvacPower), '%')} HVAC</p></div>
        {buildingPower <= 0 ? <EmptyState message="No current building power is available yet." /> : <div className="energy-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={shareData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="78%" paddingAngle={3}>{shareData.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#28b99a' : '#7e9cc0'} />)}</Pie><Tooltip formatter={(value) => `${Number(value).toFixed(1)} kW`} /><Legend /></PieChart></ResponsiveContainer></div>}
      </section>
    </div>
    <section className="section-block chart-card">
      <div className="section-heading"><div><p className="eyebrow">Stored telemetry</p><h2>Recent Building Power</h2></div><p className="muted">10-second aligned snapshots · latest 100 records per zone</p></div>
      {historyLoading ? <LoadingState /> : historyError ? <ErrorState message={historyError.message} /> : trend.length === 0 ? <EmptyState message="No historical telemetry records are available yet." /> : <div className="energy-chart energy-chart--trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}><XAxis dataKey="timestamp" tickFormatter={timeLabel} minTickGap={45} tick={{ fontSize: 11 }} /><YAxis unit=" kW" width={64} /><Tooltip labelFormatter={(label) => new Date(String(label)).toLocaleString()} formatter={(value) => `${Number(value).toFixed(1)} kW`} /><Line type="monotone" dataKey="powerKw" name="Total building power" stroke="#26527a" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>}
    </section>
    <HistoricalAnalytics zones={dashboard.zones} />
  </section>
}

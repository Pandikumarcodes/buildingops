import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import type { Zone } from '../types/api'
import { metric } from '../utils/format'
import { chronologicalHistory, summarizeHistory } from '../utils/history'

function timeLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dateLabel(value: unknown): string {
  return new Date(String(value)).toLocaleString()
}

function unit(value: unknown, suffix: string, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} ${suffix}` : '—'
}

export function HistoricalAnalytics({ zones }: { zones: Zone[] }) {
  const [requestedZoneId, setRequestedZoneId] = useState<string | undefined>()
  const selectedZoneId = zones.some((zone) => zone.id === requestedZoneId) ? requestedZoneId : zones[0]?.id
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId)
  const history = useQuery({
    queryKey: ['zones', selectedZoneId, 'telemetry', 100],
    queryFn: () => api.zoneTelemetry(selectedZoneId!),
    enabled: Boolean(selectedZoneId),
    staleTime: 30_000,
  })

  const points = chronologicalHistory(history.data ?? [])
  const summary = summarizeHistory(points)

  return <section className="section-block historical-analytics" aria-labelledby="historical-analytics-heading">
    <div className="section-heading historical-heading">
      <div><p className="eyebrow">Stored telemetry</p><h2 id="historical-analytics-heading">Historical Analytics</h2><p className="muted">Recent telemetry · latest 100 records for the selected zone</p></div>
      {zones.length > 0 && <label className="zone-selector">Zone
        <select aria-label="Historical zone" value={selectedZoneId} onChange={(event) => setRequestedZoneId(event.target.value)}>
          {zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}
        </select>
      </label>}
    </div>
    {!selectedZone ? <EmptyState message="No zones are configured for historical analytics." />
      : history.isPending ? <LoadingState />
      : history.error ? <ErrorState message={history.error.message} />
      : points.length === 0 ? <EmptyState message="No historical telemetry available for this zone yet." />
      : <>
        <div className="summary-grid" aria-label="Historical summary">
          <article className="summary-card"><span>Average Temperature</span><strong>{metric(summary.averageTemperature, '°C')}</strong><small>{selectedZone.name}</small></article>
          <article className="summary-card"><span>Peak CO₂</span><strong>{metric(summary.peakCo2, 'ppm', 0)}</strong><small>{selectedZone.name}</small></article>
          <article className="summary-card"><span>Peak Occupancy</span><strong>{metric(summary.peakOccupancy, 'people', 0)}</strong><small>{selectedZone.name}</small></article>
          <article className="summary-card"><span>Peak Zone Power</span><strong>{metric(summary.peakZonePower, 'kW')}</strong><small>{selectedZone.name}</small></article>
        </div>
        <div className="historical-chart-grid">
          <section className="chart-card"><h3>Temperature &amp; CO₂ History</h3><p className="muted">Temperature (°C) and CO₂ (ppm)</p>
            <div className="energy-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#e8edf3" /><XAxis dataKey="timestamp" tickFormatter={timeLabel} minTickGap={32} tick={{ fontSize: 11 }} /><YAxis yAxisId="temperature" unit=" °C" width={60} /><YAxis yAxisId="co2" orientation="right" unit=" ppm" width={78} /><Tooltip labelFormatter={dateLabel} formatter={(value, name) => name === 'Temperature' ? unit(value, '°C') : unit(value, 'ppm', 0)} /><Line yAxisId="temperature" type="monotone" dataKey="temperature" name="Temperature" stroke="#d97743" strokeWidth={2} dot={false} connectNulls={false} /><Line yAxisId="co2" type="monotone" dataKey="co2Ppm" name="CO₂" stroke="#26527a" strokeWidth={2} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>
          </section>
          <section className="chart-card"><h3>Occupancy History</h3><p className="muted">People in {selectedZone.name}</p>
            <div className="energy-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#e8edf3" /><XAxis dataKey="timestamp" tickFormatter={timeLabel} minTickGap={32} tick={{ fontSize: 11 }} /><YAxis unit=" people" width={76} allowDecimals={false} /><Tooltip labelFormatter={dateLabel} formatter={(value) => unit(value, 'people', 0)} /><Line type="monotone" dataKey="occupancy" name="Occupancy" stroke="#0f8c7a" strokeWidth={2} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>
          </section>
          <section className="chart-card"><h3>Power History</h3><p className="muted">Zone and HVAC demand (kW)</p>
            <div className="energy-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}><CartesianGrid stroke="#e8edf3" /><XAxis dataKey="timestamp" tickFormatter={timeLabel} minTickGap={32} tick={{ fontSize: 11 }} /><YAxis unit=" kW" width={65} /><Tooltip labelFormatter={dateLabel} formatter={(value) => unit(value, 'kW')} /><Line type="monotone" dataKey="zonePowerKw" name="Zone Power" stroke="#26527a" strokeWidth={2} dot={false} connectNulls={false} /><Line type="monotone" dataKey="hvacPowerKw" name="HVAC Power" stroke="#28b99a" strokeWidth={2} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>
          </section>
        </div>
      </>}
  </section>
}

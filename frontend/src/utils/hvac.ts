export function temperatureDifference(temperature: number | undefined, setpoint: number | undefined): string {
  if (temperature === undefined || setpoint === undefined) return '—'
  const difference = temperature - setpoint
  return `${difference > 0 ? '+' : ''}${difference.toFixed(1)} °C`
}

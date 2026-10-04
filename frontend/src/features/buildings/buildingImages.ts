import commercial from '../../assets/buildings/commercial.jpg'
import fallback from '../../assets/buildings/fallback.svg'
import type { Building } from '../../types/api'

export const fallbackBuildingImage = fallback
const imagesByCode = new Map([['DEMO-BLDG-01', commercial]])

// Illustrative photography, never a claim that this is the monitored site.
export function buildingImage(building: Pick<Building, 'id' | 'code'>): string {
  // A shared generic photograph covers unknown codes without inventing site metadata.
  return imagesByCode.get(building.code) ?? commercial
}

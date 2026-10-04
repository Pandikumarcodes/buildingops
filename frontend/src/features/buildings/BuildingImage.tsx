import { useState } from 'react'
import type { Building } from '../../types/api'
import { buildingImage, fallbackBuildingImage } from './buildingImages'

export function BuildingImage({ building }: { building: Building }) {
  const [state, setState] = useState<'primary' | 'fallback' | 'unavailable'>('primary')
  return <div className="building-card__image">
    {state === 'unavailable' ? <span>Building image unavailable</span> : <img
      src={state === 'primary' ? buildingImage(building) : fallbackBuildingImage}
      alt={`Illustrative commercial building for ${building.name}`}
      onError={() => setState((previous) => previous === 'primary' ? 'fallback' : 'unavailable')}
    />}
    <span className="building-card__image-label">Illustrative image</span>
  </div>
}

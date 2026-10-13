import { maxLevel } from '@game/shared'
import type { Building, Point } from '@game/shared'
import { BUILDING_NAMES } from '../names'

// A small label over the building under the pointer: its name, level and whether it is being built.
export function MapTip({ building, at, now }: { building: Building | undefined; at: Point; now: number }) {
  if (!building) return null
  const top = maxLevel(building.kind)
  const busy = building.doneAt > now
  return (
    <div className="map-tip frame" style={{ left: at.x, top: at.y }} role="tooltip">
      <b>{BUILDING_NAMES[building.kind]}</b>
      {top > 1 && <small>Sv. {building.level ?? 1}</small>}
      {busy && <small className="up">inşaatta</small>}
      <em>tıkla</em>
    </div>
  )
}

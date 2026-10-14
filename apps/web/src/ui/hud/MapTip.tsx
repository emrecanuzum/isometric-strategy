import { maxLevel } from '@game/shared'
import type { Building, Point, World } from '@game/shared'
import { INN_KIND_NAMES, innInfo } from '../../game/innInfo'
import { isCaravanserai } from '../../game/innSprites'
import { BUILDING_NAMES } from '../names'

type Shown = Pick<Building, 'kind' | 'level' | 'doneAt'>

// A small label over the building under the pointer: its name, level and whether it is being built. Another
// kingdom's building also names its owner, in the kingdom's colour, and cannot be clicked.
export function MapTip({ building, at, now, owner }: { building: Shown | undefined; at: Point; now: number; owner?: { name: string; color: string } }) {
  if (!building) return null
  const top = maxLevel(building.kind)
  const busy = building.doneAt > now
  return (
    <div className="map-tip frame" style={{ left: at.x, top: at.y }} role="tooltip">
      {owner && <span className="map-tip-owner" style={{ color: owner.color }}>{owner.name}</span>}
      <b>{BUILDING_NAMES[building.kind]}</b>
      {top > 1 && <small>Sv. {building.level ?? 1}</small>}
      {busy && <small className="up">inşaatta</small>}
      {!owner && <em>tıkla</em>}
    </div>
  )
}

// The label over an inn under the pointer: its name and trade.
export function InnTip({ world, index, at }: { world: World; index: number; at: Point }) {
  const inn = world.inns[index]
  const info = innInfo(world, index, isCaravanserai(world, inn))
  return (
    <div className="map-tip frame" style={{ left: at.x, top: at.y }} role="tooltip">
      <b>{info.name}</b>
      <small>{INN_KIND_NAMES[info.kind]}</small>
      <em>söylentiler</em>
    </div>
  )
}

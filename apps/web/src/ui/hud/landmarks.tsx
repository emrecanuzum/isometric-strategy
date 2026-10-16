import { balance, citadelOf, guildOf, maxLevel, memorialHappiness, palaceLevel, scoreOf } from '@game/shared'
import type { Building } from '@game/shared'
import { Section, Stat } from './primitives'
import type { HudData } from './tabs'

// The menus of the great works of a 5th-level palace (CLAUDE.md §9.8): the citadel, the dynasty's memorial and the
// guild hall. Each says what it does now and what every level does.

const num = (v: number) => v.toFixed(1).replace('.', ',')
const pct = (v: number) => `%${Math.round(v * 100)}`
const mins = (seconds: number) => `${Math.round(seconds / 60)} dk`

// One line per level, the current one marked.
function Levels({ kind, level, line }: { kind: Building['kind']; level: number; line: (level: number) => string }) {
  return (
    <Section title="Seviyelere göre" icon="crown" aside={`${level} / ${maxLevel(kind)}`}>
      <ul className="pop-lines">
        {Array.from({ length: maxLevel(kind) }, (_, i) => (
          <li key={i}>
            <span className={i + 1 === level ? 'up' : undefined}>
              {i + 1}. seviye{i + 1 === level ? ' (şimdi)' : ''}
            </span>
            <b>{line(i + 1)}</b>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const L = balance.institutions.landmarks
const at = (values: readonly number[], level: number) => values[Math.min(values.length, level) - 1]

export function CitadelPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const c = citadelOf(kingdom, now)
  const shield = balance.military.siege.shieldSeconds
  return (
    <>
      <Section title="Kuşatmada" icon="shield">
        <Stat label="Savunanların zarına" value={`+${num(c.dice)}`} note="sur sınırının ötesinde; mancınıklar etkilemez" />
        <Stat label="Garnizonun moraline" value={`+${c.morale}`} note="halkın mutluluğu üstüne, en fazla 100" />
        <Stat label="Düşen sarayın kalkanı" value={mins(shield + c.shieldSeconds)} note={`olağanı ${mins(shield)}`} />
        <p className="hint">
          Hisar yalnızca sarayın kuşatıldığı muharebede savaşır: meydan muharebesine ve kasaba kuşatmasına katılmaz. Surların zar bonusu en fazla +
          {balance.military.battle.maxWallBonus} olur; hisarınki bunun üstüne eklenir.
        </p>
      </Section>
      <Levels
        kind="citadel"
        level={building.level ?? 1}
        line={(lv) => `zar +${num(at(L.citadel.keepDiceByLevel, lv))} · moral +${at(L.citadel.moraleByLevel, lv)} · kalkan +${mins(at(L.citadel.shieldSecondsByLevel, lv))}`}
      />
    </>
  )
}

export function MemorialPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const level = building.doneAt <= now ? (building.level ?? 1) : (building.level ?? 1) - 1
  const per = balance.society.score.memorialPerLevel
  return (
    <>
      <Section title="Hanedanın şanı" icon="banner">
        <Stat label="Halkın mutluluğuna" value={`+${memorialHappiness(kingdom, now)}`} note="mutluluk hedefine eklenir" />
        <Stat label="Lordluğun puanına (Gelişim)" value={`+${level * per}`} note={`toplam puanın ${scoreOf(kingdom, now).total}`} />
        <p className="hint">
          Anıt kurum binalarının ({balance.society.score.institutionPerLevel}) yerine seviye başına {per} puan sayılır; {palaceLevel(kingdom, now)}. seviye
          sarayın kendisi {palaceLevel(kingdom, now) * balance.society.score.palacePerLevel} puandır.
        </p>
      </Section>
      <Levels kind="memorial" level={building.level ?? 1} line={(lv) => `mutluluk +${at(L.memorial.happinessByLevel, lv)} · puan +${lv * per}`} />
    </>
  )
}

export function GuildHallPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const g = guildOf(kingdom, now)
  return (
    <>
      <Section title="Lonca" icon="trade">
        <Stat label="Tüccarın ve deniz ticaretinin satışı" value={`+${pct(g.trade)}`} note="sefer başına altına eklenir" />
        <Stat label="Pazar binasının fiyatı" value={`−${pct(g.discount)}`} note="altınla mal alırken" />
        <p className="hint">
          Lonca ustaları tüccarına daha iyi alıcı bulur ve pazardaki satıcılarla pazarlık eder. Lobi fiyatlarına ve taç siparişlerine dokunmaz.
        </p>
      </Section>
      <Levels kind="guildHall" level={building.level ?? 1} line={(lv) => `satış +${pct(at(L.guildHall.tradeByLevel, lv))} · pazar −${pct(at(L.guildHall.marketDiscountByLevel, lv))}`} />
    </>
  )
}

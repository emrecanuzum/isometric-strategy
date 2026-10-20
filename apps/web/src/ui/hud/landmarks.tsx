import { balance, citadelOf, guildOf, maxLevel, memorialHappiness, palaceLevel, scoreOf } from '@game/shared'
import type { Building } from '@game/shared'
import { L } from '../../lib/i18n'
import { Section, Stat } from './primitives'
import type { HudData } from './tabs'

// The menus of the great works of a 5th-level palace (CLAUDE.md §9.8): the citadel, the dynasty's memorial and the
// guild hall. Each says what it does now and what every level does.

const num = (v: number) => v.toFixed(1).replace('.', L(',', '.'))
const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
const mins = (seconds: number) => L(`${Math.round(seconds / 60)} dk`, `${Math.round(seconds / 60)} min`)

// One line per level, the current one marked.
function Levels({ kind, level, line }: { kind: Building['kind']; level: number; line: (level: number) => string }) {
  return (
    <Section title={L('Seviyelere göre', 'By level')} icon="crown" aside={`${level} / ${maxLevel(kind)}`}>
      <ul className="pop-lines">
        {Array.from({ length: maxLevel(kind) }, (_, i) => (
          <li key={i}>
            <span className={i + 1 === level ? 'up' : undefined}>
              {L(`${i + 1}. seviye`, `Level ${i + 1}`)}
              {i + 1 === level ? L(' (şimdi)', ' (now)') : ''}
            </span>
            <b>{line(i + 1)}</b>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const LM = balance.institutions.landmarks
const at = (values: readonly number[], level: number) => values[Math.min(values.length, level) - 1]

export function CitadelPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const c = citadelOf(kingdom, now)
  const shield = balance.military.siege.shieldSeconds
  return (
    <>
      <Section title={L('Kuşatmada', 'In a siege')} icon="shield">
        <Stat label={L('Savunanların zarına', "To the defenders' dice")} value={`+${num(c.dice)}`} note={L('sur sınırının ötesinde; mancınıklar etkilemez', "on top of the walls' cap; catapults cannot cancel it")} />
        <Stat label={L('Garnizonun moraline', 'To the garrison\'s morale')} value={`+${c.morale}`} note={L('halkın mutluluğu üstüne, en fazla 100', 'on top of the people\'s happiness, at most 100')} />
        <Stat label={L('Düşen sarayın kalkanı', 'Shield of a fallen palace')} value={mins(shield + c.shieldSeconds)} note={L(`olağanı ${mins(shield)}`, `normally ${mins(shield)}`)} />
        <p className="hint">
          {L(
            `Hisar yalnızca sarayın kuşatıldığı muharebede savaşır: meydan muharebesine ve kasaba kuşatmasına katılmaz. Surların zar bonusu en fazla +${balance.military.battle.maxWallBonus} olur; hisarınki bunun üstüne eklenir.`,
            `The citadel fights only when the palace is besieged: it takes no part in field battles or town sieges. The walls' dice bonus is at most +${balance.military.battle.maxWallBonus}; the citadel's comes on top of it.`,
          )}
        </p>
      </Section>
      <Levels
        kind="citadel"
        level={building.level ?? 1}
        line={(lv) =>
          L(
            `zar +${num(at(LM.citadel.keepDiceByLevel, lv))} · moral +${at(LM.citadel.moraleByLevel, lv)} · kalkan +${mins(at(LM.citadel.shieldSecondsByLevel, lv))}`,
            `dice +${num(at(LM.citadel.keepDiceByLevel, lv))} · morale +${at(LM.citadel.moraleByLevel, lv)} · shield +${mins(at(LM.citadel.shieldSecondsByLevel, lv))}`,
          )
        }
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
      <Section title={L('Hanedanın şanı', 'The dynasty\'s glory')} icon="banner">
        <Stat label={L('Halkın mutluluğuna', 'To the people\'s happiness')} value={`+${memorialHappiness(kingdom, now)}`} note={L('mutluluk hedefine eklenir', 'added to the happiness target')} />
        <Stat label={L('Lordluğun puanına (Gelişim)', 'To the lordship\'s score (Development)')} value={`+${level * per}`} note={L(`toplam puanın ${scoreOf(kingdom, now).total}`, `your total score ${scoreOf(kingdom, now).total}`)} />
        <p className="hint">
          {L(
            `Anıt kurum binalarının (${balance.society.score.institutionPerLevel}) yerine seviye başına ${per} puan sayılır; ${palaceLevel(kingdom, now)}. seviye sarayın kendisi ${palaceLevel(kingdom, now) * balance.society.score.palacePerLevel} puandır.`,
            `The monument counts ${per} points per level instead of an institution's ${balance.society.score.institutionPerLevel}; a level ${palaceLevel(kingdom, now)} palace itself is worth ${palaceLevel(kingdom, now) * balance.society.score.palacePerLevel} points.`,
          )}
        </p>
      </Section>
      <Levels
        kind="memorial"
        level={building.level ?? 1}
        line={(lv) => L(`mutluluk +${at(LM.memorial.happinessByLevel, lv)} · puan +${lv * per}`, `happiness +${at(LM.memorial.happinessByLevel, lv)} · score +${lv * per}`)}
      />
    </>
  )
}

export function GuildHallPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const g = guildOf(kingdom, now)
  return (
    <>
      <Section title={L('Lonca', 'Guild')} icon="trade">
        <Stat label={L('Tüccarın ve deniz ticaretinin satışı', 'Merchant and sea trade sales')} value={`+${pct(g.trade)}`} note={L('sefer başına altına eklenir', 'added to the gold per trip')} />
        <Stat label={L('Pazar binasının fiyatı', 'Price at the market')} value={`−${pct(g.discount)}`} note={L('altınla mal alırken', 'when buying goods with gold')} />
        <p className="hint">
          {L(
            'Lonca ustaları tüccarına daha iyi alıcı bulur ve pazardaki satıcılarla pazarlık eder. Lobi fiyatlarına ve taç siparişlerine dokunmaz.',
            'The guild masters find your merchant better buyers and haggle with the market sellers. Lobby prices and crown orders are untouched.',
          )}
        </p>
      </Section>
      <Levels
        kind="guildHall"
        level={building.level ?? 1}
        line={(lv) =>
          L(
            `satış +${pct(at(LM.guildHall.tradeByLevel, lv))} · pazar −${pct(at(LM.guildHall.marketDiscountByLevel, lv))}`,
            `sales +${pct(at(LM.guildHall.tradeByLevel, lv))} · market −${pct(at(LM.guildHall.marketDiscountByLevel, lv))}`,
          )
        }
      />
    </>
  )
}

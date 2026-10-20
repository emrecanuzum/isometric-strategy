import { BattleScene } from './BattleScene'
import { startBattleMusic } from '../../audio/sfx'
import { duckMusic } from '../../net/settings'
import { UNITS, atPalace, cargoRoom, cargoTotal, leadDice, leadError, leadsArmy, allShips, countShips, armoryOf, armyAt, nearCity, townSiegeRounds, townRoundsDone, townRoundMs, balance, countOf, familiarityAt, familiarityBonus, garrisonOf, moraleAt, nearInn, recruitment, territoryRect, territoryStage, trainError, unitSpec } from '@game/shared'
import type { Army, Kingdom, LeadError, Point, Town, Unit, Units, World } from '@game/shared'
import { useEffect, useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import type { Battle } from '../../net/online'
import { Icon } from '../icons'
import { L } from '../../lib/i18n'
import { RESOURCE_NAMES, UNIT_ICONS, UNIT_NAMES, UNIT_NOTES, WEAPON_NAMES } from '../names'
import { Dot } from './diplomacy'
import type { HudData } from './tabs'
import type { Online } from './online'
import { kingdomName } from './online'
import { Meter, Placeholder, Section, Stat, fmt } from './primitives'
import { NavyTab } from './navy'
import { Subtabs, showPart, usePart } from './Subtabs'

// The army tab (CLAUDE.md §9.7): training at the barracks, the garrison, the armies in the field with their morale and
// knowledge of the ground, and the battles; and the battle view that plays a battle out round by round.

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 3600 ? L(`${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`, `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`) : s >= 60 ? L(`${Math.floor(s / 60)} dk ${s % 60} sn`, `${Math.floor(s / 60)} min ${s % 60} s`) : L(`${s} sn`, `${s} s`)
}

// Where an army rests: its own lands, by an inn or a free city, or the open field.
export const restOf = (world: World, kingdom: Kingdom, now: number) => (p: Point) => {
  const t = territoryRect(kingdom.site, territoryStage(kingdom, now))
  if (p.x >= t.x && p.y >= t.y && p.x < t.x + t.size && p.y < t.y + t.size) return 'home' as const
  return nearInn(world.inns, p) || nearCity(world.cities, p) ? ('inn' as const) : ('field' as const)
}

const REST_NAMES = {
  home: L('kendi topraklarında, moral topluyor', 'on its own lands, recovering morale'),
  inn: L('hanın yanında, hızla moral topluyor', 'by an inn, recovering morale fast'),
  field: L('açık arazide', 'in the open field'),
}

export function armyStatus(army: Army, now: number, rest: ReturnType<typeof restOf>, shieldOf: (kingdom: number) => number = () => 0) {
  const arrive = Date.parse(army.arrive_at)
  if (army.status === 'battle') return L('Savaşta', 'In battle')
  // At the gates of a palace still shielded from the last siege: the siege begins when the shield ends.
  if (army.goal.kind === 'siege' && now >= arrive && shieldOf(army.goal.kingdom) > now) return L(`Kapıda bekliyor · kuşatmaya ${clock(shieldOf(army.goal.kingdom) - now)}`, `Waiting at the gate · siege in ${clock(shieldOf(army.goal.kingdom) - now)}`)
  if (now < arrive && army.path.length > 1) {
    const where = army.goal.kind === 'home' ? ('retreat' in army.goal && army.goal.retreat ? L('Geri çekiliyor', 'Retreating') : L('Eve dönüyor', 'Returning home')) : army.goal.kind === 'siege' ? L('Kuşatmaya gidiyor', 'Marching to a siege') : army.goal.kind === 'chase' ? L('Yağmacıların peşinde', 'Chasing bandits') : army.goal.kind === 'cave' ? L('Yağmacı mağarasına yürüyor', 'Marching on a bandit cave') : L('Yürüyor', 'Marching')
    return L(`${where} · varış ${clock(arrive - now)}`, `${where} · arrives in ${clock(arrive - now)}`)
  }
  return L(`Bekliyor · ${REST_NAMES[rest(army.path[army.path.length - 1])]}`, `Waiting · ${REST_NAMES[rest(army.path[army.path.length - 1])]}`)
}

// The fighting that concerns the player right now (CLAUDE.md §8): sieges of towns they lay or suffer, battles they
// fight in, and their armies on the way to a siege. Shown on the map's right edge and at the top of the army tab, since
// war is what matters most.
export interface WarNote {
  key: string
  text: string
  // The span it runs over, for a progress bar.
  from?: number
  until?: number
  // What to watch: a battle, or a town's siege.
  watch?: { battle: number } | { town: number }
}

export function warNotes(online: Online, now: number): WarNote[] {
  const notes: WarNote[] = []
  const me = online.me
  for (const t of online.towns) {
    const s = t.siege
    if (!s || s.endsAt <= now || (s.kingdom !== me && t.owner !== me)) continue
    notes.push({
      key: `town${t.id}`,
      text: s.kingdom === me ? L(`${t.name} kuşatılıyor · ${clock(s.endsAt - now)} kaldı`, `Besieging ${t.name} · ${clock(s.endsAt - now)} left`) : L(`${kingdomName(online, s.kingdom)}, ${t.name} kasabanı kuşatıyor · ${clock(s.endsAt - now)} kaldı`, `${kingdomName(online, s.kingdom)} is besieging your town of ${t.name} · ${clock(s.endsAt - now)} left`),
      from: s.startedAt,
      until: s.endsAt,
      watch: { town: t.id },
    })
  }
  // Rebels at the gates of the player's own towns (CLAUDE.md §8.4), until they are beaten.
  for (const t of online.towns) {
    if (t.owner !== me || !t.rebels || t.rebels.battle) continue
    notes.push({ key: `rebels${t.id}`, text: L(`${t.rebels.count} asi ${t.name} kasabanı kuşatıyor · ordunla gidip bastır`, `${t.rebels.count} rebel${t.rebels.count === 1 ? '' : 's'} besieging your town of ${t.name} · go and put them down with your army`) })
  }
  for (const b of online.battles) {
    const end = Date.parse(b.ends_at)
    if ((b.resolved && end <= now) || ![...b.attackers, ...b.defenders].some((f) => f.kingdom === me)) continue
    const start = Date.parse(b.started_at)
    const what = battleTitle(b, online)
    notes.push({ key: `battle${b.id}`, text: start > now ? L(`${what} ${clock(start - now)} sonra başlıyor`, `${what} begins in ${clock(start - now)}`) : L(`${what} sürüyor · ${clock(end - now)} kaldı`, `${what} under way · ${clock(end - now)} left`), from: start, until: end, watch: { battle: b.id } })
  }
  for (const a of online.armies) {
    if (a.kingdom_id !== me || a.status === 'battle') continue
    const arrive = Date.parse(a.arrive_at)
    if (arrive <= now) continue
    const goal = a.goal
    const where = goal.kind === 'town' ? online.towns.find((t) => t.id === goal.town)?.name : goal.kind === 'siege' ? L(`${kingdomName(online, goal.kingdom)} sarayı`, `${kingdomName(online, goal.kingdom)}'s palace`) : null
    if (where) notes.push({ key: `march${a.id}`, text: L(`Ordun ${where} kuşatmasına gidiyor · varış ${clock(arrive - now)}`, `Your army is marching to besiege ${where} · arrives in ${clock(arrive - now)}`), from: Date.parse(a.depart_at), until: arrive })
    // After a band of bandits (CLAUDE.md §7.9).
    if (goal.kind === 'chase') notes.push({ key: `chase${a.id}`, text: L(`Ordun yağmacıların peşinde · önlerini kesmesine ${clock(arrive - now)}`, `Your army is after the bandits · cuts them off in ${clock(arrive - now)}`), from: Date.parse(a.depart_at), until: arrive })
    // On a bandit clan's cave (CLAUDE.md §7.9.1).
    if (goal.kind === 'cave') notes.push({ key: `cave${a.id}`, text: L(`Ordun yağmacı mağarasını kuşatmaya gidiyor · varış ${clock(arrive - now)}`, `Your army is marching to besiege a bandit cave · arrives in ${clock(arrive - now)}`), from: Date.parse(a.depart_at), until: arrive })
  }
  return notes
}

// A battle by name: a palace's siege, a town's rebels put down, or a battle in the field.
export function battleTitle(b: Battle, online: Online) {
  if (b.kind === 'revolt') return L(`${online.towns.find((t) => t.id === b.plan.town)?.name ?? 'Kasaba'} ayaklanması`, `Revolt in ${online.towns.find((t) => t.id === b.plan.town)?.name ?? 'the town'}`)
  if (b.kind === 'outlaw') return L(`${b.plan.outlaw?.name ?? 'Yağmacılar'} ile çarpışma`, `Clash with ${b.plan.outlaw?.name ?? 'the bandits'}`)
  if (b.kind === 'cave') return L(`${b.plan.outlaw?.name ?? 'Yağmacı klanı'} mağarasının kuşatması`, `Siege of the ${b.plan.outlaw?.name ?? 'bandit clan'}'s cave`)
  // A pretender's camp attacked, or his men at the palace (CLAUDE.md §9.1.1).
  const claimant = [...b.attackers, ...b.defenders].find((f) => f.pretender)?.pretender
  if (b.kind === 'pretender') return L(`${claimant ?? 'Taht davacısı'} karargâhı`, `${claimant ?? 'The pretender'}'s camp`)
  if (b.kind === 'usurp') return L(`${claimant ?? 'Taht davacısı'} sarayı kuşatıyor`, `${claimant ?? 'The pretender'} besieges the palace`)
  return b.kind === 'siege' && b.besieged !== null ? L(`${kingdomName(online, b.besieged)} kuşatması`, `Siege of ${kingdomName(online, b.besieged)}`) : L('Meydan muharebesi', 'Pitched battle')
}

// A side's fighter by name: a kingdom, its garrison, or a town's rebels.
const fighterName = (online: Online, f: Battle['attackers'][number]) => (f.rebels ? (f.pretender ? L(`${f.pretender} asileri`, `${f.pretender}'s rebels`) : L('Asiler', 'Rebels')) : f.outlaws ? L('Yağmacılar', 'Bandits') : f.army === null ? L(`${kingdomName(online, f.kingdom)} garnizonu`, `${kingdomName(online, f.kingdom)} garrison`) : kingdomName(online, f.kingdom))

// What is going on: the war notes with how far each has run.
function WarNow({ online, now }: { online: Online; now: number }) {
  const watch = (w: NonNullable<WarNote['watch']>) => ('battle' in w ? online.watch(w.battle) : online.watchTown(w.town))
  const notes = warNotes(online, now)
  if (notes.length === 0) return null
  return (
    <Section title={L('Süren savaş', 'War under way')} icon="swords" aside={`${notes.length}`}>
      <ul className="places">
        {notes.map((n) => (
          <li key={n.key}>
            <Icon name="swords" size={24} />
            <span>
              <b>{n.text}</b>
              {n.from !== undefined && n.until !== undefined && n.until > n.from && (
                <Meter value={Math.max(0, Math.min(1, (now - n.from) / (n.until - n.from)))} label={L('İlerleme', 'Progress')} segments={12} />
              )}
            </span>
            {n.watch && (
              <button className="btn small" onClick={() => watch(n.watch!)}>
                {L('İzle', 'Watch')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function ArmyTab(data: HudData) {
  const { kingdom, now, world, online } = data
  const [part, setPart] = useArmyPart()
  if (!online) return null
  const barracks = kingdom.buildings.find((b) => b.kind === 'barracks' && b.doneAt <= now)
  const rest = restOf(world, kingdom, now)
  // Numbered by when they were raised.
  const mine = online.armies.filter((a) => a.kingdom_id === online.me).sort((a, b) => a.id - b.id)
  const ships = countShips(allShips(kingdom))
  return (
    <>
      <WarNow online={online} now={now} />
      <Subtabs
        label={L('Ordu', 'Army')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'land', name: L('Ordular', 'Armies'), icon: 'swords', count: mine.length },
          { id: 'barracks', name: L('Kışla', 'Barracks'), icon: 'shield', count: (kingdom.training ?? []).reduce((n, t) => n + t.count, 0) },
          { id: 'battles', name: L('Savaşlar', 'Battles'), icon: 'banner', count: online.battles.filter((b) => !b.resolved || Date.parse(b.ends_at) > now).length },
          { id: 'sea', name: L('Donanma', 'Navy'), icon: 'ship', count: ships, dot: !!kingdom.blockade },
        ]}
      />
      {part === 'sea' && <NavyTab {...data} />}
      {/* The armies first: most orders are given here. */}
      {part === 'land' && (
        <>
          <Section title={L('Ordularım', 'My armies')} icon="swords" aside={`${mine.length} / ${balance.military.maxArmies}`}>
            {mine.length === 0 && <p className="hint">{L('Sahada ordun yok. Garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison.')}</p>}
            <ul className="armies">
              {mine.map((army, i) => (
                <ArmyCard key={army.id} index={i + 1} army={army} others={mine.filter((a) => a.id !== army.id)} data={data} rest={rest} />
              ))}
            </ul>
          </Section>
          <Garrison data={data} armies={mine.length} />
        </>
      )}
      {part === 'barracks' && <Training data={data} has={!!barracks} />}
      {part === 'battles' && <Battles online={online} now={now} />}
    </>
  )
}

// The army tab's parts (armies and garrison, the barracks, the battles, the navy), the last one looked at remembered in
// this browser.
type ArmyPart = 'land' | 'barracks' | 'battles' | 'sea'
const ARMY_PARTS: ArmyPart[] = ['land', 'barracks', 'battles', 'sea']
export const showArmyPart = (part: ArmyPart) => showPart('army', part)
const useArmyPart = () => usePart('army', ARMY_PARTS, 'land')

// Soldiers by kind, as a row of small counts.
export function UnitRow({ units }: { units: Units | null | undefined }) {
  const shown = UNITS.filter((u) => (units?.[u] ?? 0) > 0)
  if (shown.length === 0) return null
  return (
    <span className="unit-row">
      {shown.map((u) => (
        <span key={u} className="chip" title={UNIT_NAMES[u]}>
          <Icon name={UNIT_ICONS[u]} size={16} /> {units![u]}
        </span>
      ))}
    </span>
  )
}

const WHY: Record<string, string> = {
  building: L('Kışla yok', 'No barracks'),
  locked: L('2. seviye kışla gerekir', 'Needs a level 2 barracks'),
  people: L('Gönüllü yok', 'No volunteers'),
  cost: L('Kaynak ya da silah yetmiyor', 'Not enough resources or weapons'),
  research: L('Üniversitede araştırılmalı', 'Must be researched at the university'),
}

function Training({ data, has }: { data: HudData; has: boolean }) {
  const { kingdom, now, online } = data
  const [unit, setUnit] = useState<Unit>('spear')
  const [count, setCount] = useState(1)
  if (!has) {
    return (
      <Section title={L('Kışla', 'Barracks')} icon="people">
        <Placeholder icon="lock" title={L('Kışlan yok', 'You have no barracks')}>
          {L('Sarayı 2. seviyeye yükselt, sonra İnşa sekmesinden kışla kur. Kışla mızrakçı ve okçu yetiştirir; 2. seviyede süvari ve mancınık da.', 'Upgrade your palace to level 2, then build barracks from the Build tab. Barracks train spearmen and archers; at level 2, cavalry and catapults too.')}
        </Placeholder>
      </Section>
    )
  }
  const { willing, cost, weapons, cap, pool } = recruitment(kingdom, now, unit)
  const n = Math.max(1, Math.min(count, Math.max(1, willing)))
  const why = trainError(kingdom, n, now, unit)
  // The most that can be trained at once: as many as are willing and the stores pay for (one click instead of many).
  let most = 0
  for (let lo = 1, hi = willing; lo <= hi; ) {
    const mid = (lo + hi) >> 1
    if (trainError(kingdom, mid, now, unit)) hi = mid - 1
    else (most = mid), (lo = mid + 1)
  }
  const queue = (kingdom.training ?? []).filter((t) => t.doneAt > now)
  const armory = armoryOf(kingdom)
  return (
    <Section title={L('Kışla', 'Barracks')} icon="people" aside={L(`asker havuzu ${pool} / ${cap}`, `manpower ${pool} / ${cap}`)}>
      <p className="hint">
        {L(`Asker havuzu her tur dolar; halk mutlu oldukça (%${Math.round(kingdom.happiness ?? 60)}) daha büyük olur ve askerlik ucuzlar.`, `Manpower refills every round; the happier the people (${Math.round(kingdom.happiness ?? 60)}%), the bigger it grows and the cheaper soldiers come.`)}
      </p>
      <div className="unit-pick choices" role="radiogroup" aria-label={L('Birlik türü', 'Unit type')}>
        {UNITS.map((u) => (
          <button key={u} className="btn small" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} title={UNIT_NOTES[u]}>
            <Icon name={UNIT_ICONS[u]} size={16} /> {UNIT_NAMES[u]}
          </button>
        ))}
      </div>
      <p className="hint">{UNIT_NOTES[unit]}.</p>
      <Stat
        label={L('Birim başı', 'Per unit')}
        value={[
          ...Object.entries(cost).map(([r, v]) => `${v} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`),
          ...Object.entries(weapons).map(([w, v]) => L(`${v} ${WEAPON_NAMES[w as keyof typeof WEAPON_NAMES].toLowerCase()} (${Math.floor(armory[w as keyof typeof armory])} var)`, `${v} ${w === 'bow' ? (v === 1 ? 'bow and arrows' : 'sets of bow and arrows') : `${WEAPON_NAMES[w as keyof typeof WEAPON_NAMES].toLowerCase()}${v === 1 ? '' : 's'}`} (${Math.floor(armory[w as keyof typeof armory])} in stock)`)),
        ].join(' · ')}
        note={L(`${unitSpec(unit).trainSeconds} sn`, `${unitSpec(unit).trainSeconds} s`)}
      />
      <div className="stepper">
        <button className="btn icon-only" disabled={n <= 1} data-why={L('En az 1 asker eğitilir', 'At least 1 soldier is trained')} onClick={() => setCount(n - 1)} aria-label={L('Bir asker azalt', 'One soldier fewer')}>
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{n}</b> {UNIT_NAMES[unit].toLowerCase()}
        </span>
        <button className="btn icon-only" disabled={n >= willing} data-why={willing < 1 ? L('Asker olmaya gönüllü kimse yok', 'Nobody is willing to be a soldier') : L(`Gönüllülerin hepsi bu kadar (${willing})`, `That is all the volunteers (${willing})`)} onClick={() => setCount(n + 1)} aria-label={L('Bir asker ekle', 'One soldier more')}>
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={most <= 1 || n === most} data-why={most <= 1 ? L('Gönüllüler ya da depolar yalnızca bir askere yetiyor', 'The volunteers or the stores stretch to one soldier only') : L('Zaten en çok seçili', 'The most is already chosen')} onClick={() => setCount(most)} title={L('Gönüllülerin ve depoların yettiği kadar', 'As many as the volunteers and stores allow')}>
          {L('En çok', 'Most')}{most > 1 ? ` (${most})` : ''}
        </button>
        <button className="btn small" disabled={!!why} data-why={why ? WHY[why] : undefined} onClick={() => online?.act({ type: 'train', count: n, unit })} title={why ? WHY[why] : undefined}>
          {L('Eğit', 'Train')} {why ? `(${WHY[why]})` : ''}
        </button>
      </div>
      {queue.length > 0 && (
        <ul className="queue-list">
          {queue.map((t, i) => (
            <li key={i} className="queue-item">
              <Icon name={UNIT_ICONS[t.unit ?? 'spear']} size={16} /> {t.count} {UNIT_NAMES[t.unit ?? 'spear'].toLowerCase()} <small>{clock(t.doneAt - now)}</small>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Garrison({ data, armies }: { data: HudData; armies: number }) {
  const { kingdom, online } = data
  const garrison = garrisonOf(kingdom)
  const total = countOf(garrison)
  const [picked, setPicked] = useState<Units | null>(null)
  const [sureDisband, setSureDisband] = useState(false)
  // Everyone at the palace unless the player picks otherwise.
  const units = picked ?? garrison
  const n = countOf(units)
  const full = armies >= balance.military.maxArmies
  const step = (u: Unit, d: number) => setPicked({ ...units, [u]: Math.max(0, Math.min(garrison[u] ?? 0, (units[u] ?? 0) + d)) })
  return (
    <Section title={L('Garnizon', 'Garrison')} icon="crown" aside={L(`${total} asker sarayda`, `${total} soldier${total === 1 ? '' : 's'} at the palace`)}>
      {(kingdom.armyLockUntil ?? 0) > data.now && (
        <p className="hint down">
          <Icon name="warn" size={16} /> {L(`Garnizon bir felaketle uğraşıyor: ${Math.ceil(((kingdom.armyLockUntil ?? 0) - data.now) / 60_000)} dakika ordu çıkarılamaz.`, `The garrison is busy with a disaster: no army can be raised for ${Math.ceil(((kingdom.armyLockUntil ?? 0) - data.now) / 60_000)} min.`)}
        </p>
      )}
      {total === 0 ? (
        <p className="hint">{L('Sarayda bekleyen asker yok.', 'No soldiers waiting at the palace.')}</p>
      ) : (
        <>
          {UNITS.filter((u) => (garrison[u] ?? 0) > 0).map((u) => (
            <div key={u} className="stepper">
              <span className="unit-label">
                <Icon name={UNIT_ICONS[u]} size={16} /> {UNIT_NAMES[u]}
              </span>
              <button className="btn icon-only" disabled={(units[u] ?? 0) <= 0} data-why={L('Bu birlikten seçili asker yok', 'No soldiers of this unit chosen')} onClick={() => step(u, -1)} aria-label={L('Azalt', 'Fewer')}>
                <Icon name="minus" size={16} />
              </button>
              <span className="stepper-value">
                <b>{units[u] ?? 0}</b> / {garrison[u]}
              </span>
              <button className="btn icon-only" disabled={(units[u] ?? 0) >= (garrison[u] ?? 0)} data-why={L('Garnizondaki bu birliğin hepsi seçili', 'All of this unit in the garrison is chosen')} onClick={() => step(u, 1)} aria-label={L('Artır', 'More')}>
                <Icon name="plus" size={16} />
              </button>
            </div>
          ))}
          <div className="row">
            <button
              className="btn small"
              disabled={full || n < 1}
              data-why={full ? L(`Sahada en fazla ${balance.military.maxArmies} ordun olabilir`, `You can have at most ${balance.military.maxArmies} armies in the field`) : L('Önce asker seç', 'Choose soldiers first')}
              onClick={() => (online?.act({ type: 'raise', units }), setPicked(null))}
              title={full ? L('Sahada en fazla 2 ordun olabilir', 'You can have at most 2 armies in the field') : undefined}
            >
              {L(`${n} askerle ordu çıkar`, `Raise an army of ${n}`)}
            </button>
            <button
              className={sureDisband ? 'btn small danger' : 'btn small'}
              disabled={n < 1}
              data-why={L('Önce asker seç', 'Choose soldiers first')}
              onClick={() => (sureDisband ? (online?.act({ type: 'disband', units }), setPicked(null), setSureDisband(false)) : setSureDisband(true))}
              onBlur={() => setSureDisband(false)}
              title={L('Askerler köylüye döner; eğitim maliyeti geri gelmez', 'The soldiers go back to being villagers; the training cost is not refunded')}
            >
              {sureDisband ? L(`Emin misin? ${n} askeri terhis et`, `Are you sure? Disband ${n} soldier${n === 1 ? '' : 's'}`) : L(`${n} askeri terhis et`, `Disband ${n} soldier${n === 1 ? '' : 's'}`)}
            </button>
          </div>
        </>
      )}
    </Section>
  )
}

// Why the lord cannot take command of an army (dynasty.ts leadError).
const KING_REASONS: Record<LeadError, string> = {
  council: L('Naipler konseyi yönetirken kral orduya geçemez', 'The king cannot join an army while a council of regents rules'),
  queen: L('Önce sarayda bir kraliçe olmalı', 'There must first be a queen at the palace'),
  son: L('Önce bir oğlun olmalı (tahtın varisi)', 'You must first have a son (an heir to the throne)'),
  leading: L('Kral zaten başka bir orduya komuta ediyor', 'The king already commands another army'),
  battle: L('Ordu savaşta', 'The army is in battle'),
  palace: L('Ordu sarayın önünde durmalı', 'The army must stand before the palace'),
}

function ArmyCard({ index, army, others, data, rest }: { index: number; army: Army; others: Army[]; data: HudData; rest: ReturnType<typeof restOf> }) {
  const { now, online, onShow, kingdom } = data
  if (!online) return null
  // The lord at its head (CLAUDE.md §8.2.1): taken over and left in front of the palace.
  const kingLeads = leadsArmy(kingdom, army.led_by, now)
  const home = atPalace(army, kingdom.buildings, now)
  const kingWhy = kingLeads ? null : leadError(kingdom, now, { atPalace: home, battle: army.status === 'battle', leadingAnother: others.some((o) => leadsArmy(kingdom, o.led_by, now)) })
  const king = kingdom.dynasty?.king
  const morale = moraleAt(army, now, rest)
  const familiarity = familiarityAt(army, now)
  const here = armyAt(army, now)
  const soldiers = army.soldiers ?? 0
  const near = others.find((o) => {
    const p = armyAt(o, now)
    return Math.hypot(p.x - here.x, p.y - here.y) <= balance.military.mergeTiles && o.status !== 'battle'
  })
  const pending = online.orders.filter((o) => o.army_id === army.id)
  const busy = army.status === 'battle'
  const selected = online.army === army.id
  // A town this army is besieging, or marching to.
  const siege = online.towns.find((t) => t.siege?.army === army.id && t.siege.endsAt > now)
  const goal = army.goal
  const toTown = goal.kind === 'town' ? online.towns.find((t) => t.id === goal.town) : undefined
  return (
    <li className={selected ? 'army-card selected' : 'army-card'}>
      <div className="army-body">
        <div className="army-head">
          <b>
            {L(`${index}. Ordu · ${soldiers} savaşçı`, `Army ${index} · ${soldiers} soldier${soldiers === 1 ? '' : 's'}`)}
          </b>
          <small>{siege ? L(`${siege.name} kuşatılıyor · ${clock(siege.siege!.endsAt - now)} kaldı`, `Besieging ${siege.name} · ${clock(siege.siege!.endsAt - now)} left`) : toTown && Date.parse(army.arrive_at) > now ? L(`${toTown.name} ${toTown.owner === online.me ? 'asilerine yürüyor' : 'kuşatmasına gidiyor'} · varış ${clock(Date.parse(army.arrive_at) - now)}`, `${toTown.owner === online.me ? `Marching on the rebels of ${toTown.name}` : `Marching to besiege ${toTown.name}`} · arrives in ${clock(Date.parse(army.arrive_at) - now)}`) : armyStatus(army, now, rest, (id) => online.kingdoms.find((k) => k.id === id)?.shieldUntil ?? 0)}</small>
        </div>
        <UnitRow units={army.units ?? { spear: soldiers }} />
        {cargoTotal(army.cargo) > 0 && (
          <small className="order-note">
            <Icon name="chest" size={16} /> {L('Yük', 'Cargo')}: {Object.entries(army.cargo ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([g, n]) => `${fmt(n ?? 0)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')} · {L(`saraya varınca ambara girer (en fazla ${fmt(cargoRoom(soldiers, army.cargo) + cargoTotal(army.cargo))} taşır)`, `goes into the storehouse when it reaches the palace (carries up to ${fmt(cargoRoom(soldiers, army.cargo) + cargoTotal(army.cargo))})`)}
          </small>
        )}
        <div className="army-stats">
          <div>
            <span>
              {L('Moral', 'Morale')} <b>{L(`%${Math.round(morale)}`, `${Math.round(morale)}%`)}</b>
            </span>
            <Meter value={morale / 100} tone={morale >= 60 ? 'up' : morale >= 30 ? 'gold' : 'down'} label={L('Moral', 'Morale')} segments={10} />
          </div>
          <div>
            <span>
              {L('Saha bilgisi', 'Terrain knowledge')} <b>+{familiarityBonus(familiarity).toFixed(1).replace('.', L(',', '.'))} {L('zar', 'dice')}</b>
            </span>
            <Meter value={familiarity / 100} tone="water" label={L('Saha bilgisi', 'Terrain knowledge')} segments={10} />
          </div>
        </div>
        {kingLeads && (
          <small className="order-note up">
            <Icon name="crown" size={16} /> {L('Kral komutada · emirler anında', 'The king commands · orders take effect at once')}
            {king ? L(` · ${king.name}, savaş yeteneği ${king.skills.military}: zara ${leadDice(kingdom) >= 0 ? '+' : '−'}${Math.abs(leadDice(kingdom)).toFixed(1).replace('.', ',')}`, ` · ${king.name}, military skill ${king.skills.military}: ${leadDice(kingdom) >= 0 ? '+' : '−'}${Math.abs(leadDice(kingdom)).toFixed(1)} to the dice`) : ''}
          </small>
        )}
        {army.contact_until && Date.parse(army.contact_until) > now && (
          <small className="order-note up">
            <Icon name="scroll" size={16} /> {L(`Komutanla iletişim açık: ${clock(Date.parse(army.contact_until) - now)} boyunca emirler hemen uygulanır`, `In touch with the commander: orders take effect at once for ${clock(Date.parse(army.contact_until) - now)}`)}
          </small>
        )}
        {pending.map((o) => (
          <small key={o.id} className="order-note">
            <Icon name="scroll" size={16} /> {L(`Elçi yolda: emir ${clock(Date.parse(o.effective_at) - now)} sonra ulaşacak`, `Envoy on the way: the order arrives in ${clock(Date.parse(o.effective_at) - now)}`)}
          </small>
        ))}
        <div className="army-actions">
          <button className="btn small" onClick={() => (online.setArmy(army.id), onShow(here))}>
            <Icon name="pin" size={16} /> {L('Göster', 'Show')}
          </button>
          <button className="btn small" disabled={busy} data-why={L('Ordu savaşta; emir alamaz', 'The army is in battle; it cannot take orders')} onClick={() => online.target(army.id)}>
            {L('Hareket', 'Move')}
          </button>
          <button
            className="btn small"
            aria-pressed={online.following === army.id}
            onClick={() => {
              online.setArmy(army.id)
              online.follow(online.following === army.id ? null : army.id)
            }}
            title={L('Kamera orduyu takip etsin (haritayı sürükleyince bırakır)', 'The camera follows the army (dragging the map lets go)')}
          >
            <Icon name="eye" size={16} /> {online.following === army.id ? L('Takibi bırak', 'Stop following') : L('Takip et', 'Follow')}
          </button>
          <button className="btn small" disabled={busy} data-why={L('Ordu savaşta; emir alamaz', 'The army is in battle; it cannot take orders')} onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'home' } })}>
            <Icon name="home" size={16} /> {L('Eve dön', 'Return home')}
          </button>
          <button
            className="btn small"
            disabled={busy || soldiers < 2 || others.length + 1 >= balance.military.maxArmies}
            data-why={busy ? L('Ordu savaşta; bölünemez', 'The army is in battle; it cannot split') : soldiers < 2 ? L('Bölmek için en az 2 asker gerekir', 'Splitting needs at least 2 soldiers') : L(`Sahada en fazla ${balance.military.maxArmies} ordun olabilir`, `You can have at most ${balance.military.maxArmies} armies in the field`)}
            onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'split', soldiers: Math.floor(soldiers / 2) } })}
            title={L('Ordunun yarısını ayrı bir orduya ayırır (en fazla 2 ordu)', 'Splits half the army off into a separate army (2 armies at most)')}
          >
            {L('İkiye böl', 'Split in two')}
          </button>
          {kingLeads ? (
            <button
              className="btn small"
              disabled={busy || !home}
              data-why={busy ? L('Ordu savaşta', 'The army is in battle') : L('Kral yalnızca sarayın önünde komutayı bırakır', 'The king gives up command only before the palace')}
              onClick={() => online.act({ type: 'king', army: army.id, action: 'leave' })}
              title={home ? L('Kral komutayı bırakıp sarayına döner', 'The king gives up command and returns to his palace') : L('Kral yalnızca sarayın önünde komutayı bırakır', 'The king gives up command only before the palace')}
            >
              <Icon name="home" size={16} /> {L('Kral saraya dönsün', 'Send the king back to the palace')}
            </button>
          ) : (
            <button
              className="btn small"
              disabled={!!kingWhy}
              data-why={kingWhy ? KING_REASONS[kingWhy] : undefined}
              onClick={() => online.act({ type: 'king', army: army.id, action: 'lead' })}
              title={kingWhy ? KING_REASONS[kingWhy] : L('Emirler elçi beklemeden uygulanır; kralın savaş yeteneği zarlara tam sayılır, ama ordu yenilirse kral düşebilir', "Orders take effect without waiting for an envoy; the king's military skill counts in full on the dice, but if the army is beaten the king may fall")}
            >
              <Icon name="crown" size={16} /> {L('Kral komutayı alsın', 'Let the king take command')}
            </button>
          )}
          {near && (
            <button className="btn small" disabled={busy} data-why={L('Ordu savaşta; birleşemez', 'The army is in battle; it cannot merge')} onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'merge', with: near.id } })}>
              {L('Birleştir', 'Merge')}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function Battles({ online, now }: { online: Online; now: number }) {
  const going = online.battles.filter((b) => !b.resolved || Date.parse(b.ends_at) > now)
  const done = online.battles.filter((b) => b.resolved && Date.parse(b.ends_at) <= now).slice(0, 5)
  const involved = (b: Battle) => [...b.attackers, ...b.defenders].some((f) => f.kingdom === online.me)
  const sideOf = (b: Battle) => (b.attackers.some((f) => f.kingdom === online.me) ? 'attackers' : b.defenders.some((f) => f.kingdom === online.me) ? 'defenders' : null)
  const title = (b: Battle) => (b.kind === 'field' ? `${kingdomName(online, b.attackers[0]?.kingdom)} — ${kingdomName(online, b.defenders[0]?.kingdom)}` : battleTitle(b, online))
  return (
    <Section title={L('Savaşlar', 'Battles')} icon="swords" aside={going.length ? L(`${going.length} sürüyor`, `${going.length} under way`) : undefined}>
      {going.length + done.length === 0 && <p className="hint">{L('Henüz muharebe olmadı.', 'No battles yet.')}</p>}
      <ul className="places">
        {[...going, ...done].map((b) => (
          <li key={b.id}>
            <Icon name={b.kind === 'siege' ? 'crown' : 'swords'} size={24} />
            <span>
              <b>{title(b)}</b>
              <small>
                {Date.parse(b.started_at) > now
                  ? L(`${clock(Date.parse(b.started_at) - now)} sonra başlıyor`, `Begins in ${clock(Date.parse(b.started_at) - now)}`)
                  : Date.parse(b.ends_at) > now
                    ? L(`Sürüyor · ${clock(Date.parse(b.ends_at) - now)} kaldı`, `Under way · ${clock(Date.parse(b.ends_at) - now)} left`)
                    : L(`Bitti · ${sideOf(b) ? (sideOf(b) === b.plan.winner ? 'kazandın' : 'yenildin') : `${b.plan.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`}`, `Over · ${sideOf(b) ? (sideOf(b) === b.plan.winner ? 'you won' : 'you lost') : `the ${b.plan.winner === 'attackers' ? 'attackers' : 'defenders'} won`}`)}
                {involved(b) && Date.parse(b.ends_at) > now ? L(' · sen de varsın', ' · you are in it') : ''}
              </small>
            </span>
            <button className="btn small" onClick={() => online.watch(b.id)}>
              {L('İzle', 'Watch')}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---- The battle view ----------------------------------------------------------------------------------------------

const face = (roll: number) => <span className="die-face">{roll}</span>

export function BattleView({ battle, online, now, onClose }: { battle: Battle; online: Online; now: number; onClose: () => void }) {
  const roundMs = balance.military.battle.roundSeconds * 1000
  const started = Date.parse(battle.started_at)
  const rounds = battle.plan.rounds
  // Rounds fought so far (all of them once it is over).
  const shown = Math.max(0, Math.min(rounds.length, Math.floor((now - started) / roundMs) + 1))
  const over = now >= Date.parse(battle.ends_at)
  const last = shown > 0 ? rounds[shown - 1] : null
  const side = (who: 'attackers' | 'defenders') => {
    const fighters = battle[who]
    const start = { soldiers: fighters.reduce((s, f) => s + f.soldiers, 0), morale: fighters.reduce((s, f) => s + f.morale * f.soldiers, 0) / Math.max(1, fighters.reduce((s, f) => s + f.soldiers, 0)) }
    const now = last ? last[who] : start
    const bonus = who === 'attackers' ? battle.plan.attackerBonus : battle.plan.defenderBonus
    const counter = who === 'attackers' ? battle.plan.attackerCounter : battle.plan.defenderCounter
    const faith = (who === 'attackers' ? battle.plan.attackerFaith : battle.plan.defenderFaith) ?? 0
    const towers = (who === 'attackers' ? battle.plan.defense?.attackerTowers : battle.plan.defense?.towers) ?? 0
    // A besieged palace's citadel (CLAUDE.md §9.8).
    const keep = who === 'defenders' ? (battle.plan.defense?.keep ?? 0) : 0
    const units = fighters.reduce<Units>((all, f) => {
      for (const [u, n] of Object.entries(f.units ?? { spear: f.soldiers })) all[u as Unit] = (all[u as Unit] ?? 0) + (n ?? 0)
      return all
    }, {})
    const names = [...new Set(fighters.map((f) => fighterName(online, f)))]
    const colors = [...new Set(fighters.map((f) => online.kingdoms.find((k) => k.id === f.kingdom)?.color))]
    const king = fighters.some((f) => f.king)
    // Townsfolk and outlaws fight as a rabble (a pretender's men as soldiers), in plain colours.
    const rabble = fighters.length > 0 && fighters.every((f) => (f.rebels && !f.pretender) || f.outlaws)
    const plain = fighters.some((f) => f.outlaws) ? '#7a5a3a' : fighters.some((f) => f.pretender) ? '#5a4a6a' : fighters.some((f) => f.rebels) ? '#6a6258' : '#a8a4ac'
    return { start, now, bonus, counter, faith, towers, keep, units, names, colors, king, rabble, plain }
  }
  const a = side('attackers')
  const d = side('defenders')
  const defense = battle.plan.defense
  const winner = battle.plan.winner === 'attackers' ? a : d
  const sceneSide = (s: typeof a) => ({
    soldiers: s.now.soldiers,
    start: s.start.soldiers,
    color: KINGDOM_COLORS[s.colors[0] as KingdomColor]?.swatch ?? s.plain,
    archers: (s.units.archer ?? 0) > 0,
    catapults: (s.units.catapult ?? 0) > 0,
    king: s.king,
    units: s.units,
    rabble: s.rabble,
  })
  const setting = battle.kind === 'siege' || battle.kind === 'usurp' ? 'castle' : battle.kind === 'revolt' ? 'town' : battle.kind === 'pretender' ? 'camp' : 'field'
  // A tense march under the battle while it is fought (the tavern tune steps aside).
  useEffect(() => {
    if (over) return
    duckMusic(true)
    const stop = startBattleMusic()
    return () => {
      stop()
      duckMusic(false)
    }
  }, [over])
  return (
    <div className="modal" role="dialog" aria-labelledby="battle-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog frame battle-view">
        <header className="sheet-head">
          <Icon name="swords" size={32} />
          <div>
            <h2 id="battle-title">{battleTitle(battle, online)}</h2>
            <small>
              {now < started ? L(`${clock(started - now)} sonra başlıyor`, `Begins in ${clock(started - now)}`) : over ? L(`Bitti · ${winner.names.join(', ')} kazandı`, `Over · ${winner.names.join(', ')} won`) : L(`Tur ${shown} / ${rounds.length} sürüyor`, `Round ${shown} / ${rounds.length} under way`)}
            </small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat', 'Close')}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <BattleScene
          attackers={sceneSide(a)}
          defenders={sceneSide(d)}
          setting={setting}
          round={shown}
          over={over}
          winner={battle.plan.winner}
          seed={battle.id}
        />
        <div className="battle-sides">
          {[
            { title: L('Saldıranlar', 'Attackers'), s: a, roll: last?.attackers },
            { title: L('Savunanlar', 'Defenders'), s: d, roll: last?.defenders },
          ].map(({ title, s, roll }) => (
            <div key={title} className="battle-side">
              <small>{title}</small>
              <b>
                {s.colors.map((c) => (
                  <Dot key={c ?? 'x'} color={c} />
                ))}
                {s.names.join(', ')}
              </b>
              <Stat label={L('Asker', 'Soldiers')} value={`${fmt(s.now.soldiers)} / ${fmt(s.start.soldiers)}`} />
              <span className="sign">
                <span>{L('Moral', 'Morale')}</span>
                <Meter value={s.now.morale / 100} tone={s.now.morale >= 50 ? 'up' : s.now.morale >= 25 ? 'gold' : 'down'} label={L('Moral', 'Morale')} segments={10} />
                <small>{L(`%${Math.round(s.now.morale)}`, `${Math.round(s.now.morale)}%`)}</small>
              </span>
              <UnitRow units={s.units} />
              <Stat label={L('Zar bonusu', 'Dice bonus')} value={`${s.bonus >= 0 ? '+' : '−'}${Math.abs(s.bonus).toFixed(1).replace('.', ',')}`} note={
                  [
                    s.counter ? L(`birlik üstünlüğü ${s.counter >= 0 ? '+' : '−'}${Math.abs(s.counter).toFixed(1).replace('.', ',')}`, `unit advantage ${s.counter >= 0 ? '+' : '−'}${Math.abs(s.counter).toFixed(1)}`) : '',
                    s.faith ? L(`${s.king ? 'iman ve kral' : 'iman'} ${s.faith >= 0 ? '+' : '−'}${Math.abs(s.faith).toFixed(1).replace('.', ',')}`, `${s.king ? 'faith and king' : 'faith'} ${s.faith >= 0 ? '+' : '−'}${Math.abs(s.faith).toFixed(1)}`) : '',
                    s.king ? L('kral komutada', 'king in command') : '',
                    s.towers ? L(`${s.towers} kule`, `${s.towers} tower${s.towers === 1 ? '' : 's'}`) : '',
                    s.keep ? L(`hisar +${s.keep.toFixed(1).replace('.', ',')}`, `citadel +${s.keep.toFixed(1)}`) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              {roll && (
                <div className="dice" aria-label={L(`Son zar ${roll.roll}`, `Last roll ${roll.roll}`)}>
                  <Icon name="dice" size={24} />
                  {face(roll.roll)}
                  <small>
                    {L(`+ ${roll.bonus.toFixed(1).replace('.', ',')} bonus → rakipten ${roll.kills} asker${roll.towerKills ? ` (${roll.towerKills} kuleden)` : ''}, −${Math.round(roll.moraleHit)} moral`, `+ ${roll.bonus.toFixed(1)} bonus → ${roll.kills} of the enemy down${roll.towerKills ? ` (${roll.towerKills} by towers)` : ''}, −${Math.round(roll.moraleHit)} morale`)}
                  </small>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="hint">
          {L(`Her tur iki taraf da d${balance.military.battle.dice} atar. Zara saha bilgisi eklenir`, `Each round both sides roll a d${balance.military.battle.dice}. Terrain knowledge is added to the roll`)}
          {defense && (defense.towers || defense.walls)
            ? L(
                `; kuşatılan saray ${defense.towers} kule ve ${defense.walls} sur ile savunuyor${battle.plan.walls !== undefined && battle.plan.walls < defense.walls ? ` (mancınıklar ${defense.walls - battle.plan.walls} suru etkisiz kıldı)` : ''}${defense.keep ? `, hisarı zara +${defense.keep.toFixed(1).replace('.', ',')} ekliyor` : ''}`,
                `; the besieged palace defends with ${defense.towers} tower${defense.towers === 1 ? '' : 's'} and ${defense.walls} wall${defense.walls === 1 ? '' : 's'}${battle.plan.walls !== undefined && battle.plan.walls < defense.walls ? ` (catapults put ${defense.walls - battle.plan.walls} wall${defense.walls - battle.plan.walls === 1 ? '' : 's'} out of action)` : ''}${defense.keep ? `, its citadel adds +${defense.keep.toFixed(1)} to the roll` : ''}`,
              )
            : ''}
          {L(
            '; tapınağın imanı ve yakındaki gözcü kuleleri de zara eklenir, kuleler her tur birkaç düşman vurur (askersiz bile birkaç tur direnir); birlik türlerinin üstünlüğü (mızrak > süvari > okçu > mızrak) de eklenir. Morali biten ya da askeri kalmayan taraf yenilir.',
            '; the faith of the temple and nearby watchtowers are added too, and the towers strike a few enemies every round (holding out a few rounds even without soldiers); the advantage of unit types (spear > cavalry > archer > spear) is added as well. The side that runs out of morale or soldiers is beaten.',
          )}
        </p>
        {shown > 0 && (
          <ol className="battle-log">
            {rounds.slice(0, shown).map((r, i) => (
              <li key={i}>
                <b>{i + 1}.</b> {face(r.attackers.roll)} {L(`${r.attackers.kills} öldürdü`, `${r.attackers.kills} killed`)} · {face(r.defenders.roll)} {L(`${r.defenders.kills} öldürdü`, `${r.defenders.kills} killed`)}
                <small>
                  {fmt(r.attackers.soldiers)} / {fmt(r.defenders.soldiers)} {L('asker', 'soldiers')}
                </small>
              </li>
            ))}
          </ol>
        )}
        {over && battle.report?.loot && (
          <p className="alert">
            {L('Yağma', 'Plunder')}: {Object.entries(battle.report.loot)
              .map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`)
              .join(', ')}
          </p>
        )}
      </section>
    </div>
  )
}

// A town's siege watched like a battle (CLAUDE.md §8.4): the besiegers before the town's walls (a palisade, or the
// houses of a town without one), round by round, with what each side has lost.
export function TownSiegeView({ town, army, walled, online, now, onClose }: { town: Town; army: Army | null; walled: boolean; online: Online; now: number; onClose: () => void }) {
  const s = town.siege
  // Kept as it was when the siege ended, so the view does not empty out at its close.
  const [held] = useState(() => s)
  const siege = s ?? held
  const over = !s || now >= (siege?.endsAt ?? 0)
  useEffect(() => {
    if (over) return
    duckMusic(true)
    const stop = startBattleMusic()
    return () => {
      stop()
      duckMusic(false)
    }
  }, [over])
  if (!siege) return null
  // Another lord's besiegers are known only by their losses (their strength is for spies to tell).
  const known = army?.soldiers !== null && army?.soldiers !== undefined
  const soldiers = known ? army!.soldiers! + (siege.lost ?? 0) : 0
  const rounds = townSiegeRounds(town, siege, known ? soldiers : Number.MAX_SAFE_INTEGER, walled)
  const done = townRoundsDone(siege, now, rounds.length)
  const last = done > 0 ? rounds[done - 1] : null
  const garrison = town.owner === null ? town.garrison : 0
  const lostSoFar = last?.lost ?? 0
  const left = known ? (last?.attackers ?? soldiers) : null
  // For the picture only: about as many figures as the army shows on the map.
  const drawn = known ? soldiers : Math.max(lostSoFar + 2, (army?.figures ?? 3) * 2 + lostSoFar)
  const defenders = last?.defenders ?? garrison
  const besieger = online.kingdoms.find((k) => k.id === siege.kingdom)
  const holder = town.owner !== null ? online.kingdoms.find((k) => k.id === town.owner) : null
  const swatch = (c: string | null | undefined, fallback: string) => KINGDOM_COLORS[c as KingdomColor]?.swatch ?? fallback
  const units = army?.units ?? null
  const next = siege.startedAt + (done + 1) * townRoundMs()
  return (
    <div className="modal" role="dialog" aria-labelledby="siege-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog frame battle-view">
        <header className="sheet-head">
          <Icon name="swords" size={32} />
          <div>
            <h2 id="siege-title">{L(`${town.name} kuşatması`, `Siege of ${town.name}`)}</h2>
            <small>
              {over ? L('Bitti', 'Over') : L(`Tur ${Math.min(rounds.length, done + 1)} / ${rounds.length} · sonraki tur ${clock(Math.max(0, Math.min(next, siege.endsAt) - now))} sonra · ${clock(siege.endsAt - now)} kaldı`, `Round ${Math.min(rounds.length, done + 1)} / ${rounds.length} · next round in ${clock(Math.max(0, Math.min(next, siege.endsAt) - now))} · ${clock(siege.endsAt - now)} left`)}
            </small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat', 'Close')}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <BattleScene
          attackers={{ soldiers: left ?? drawn - lostSoFar, start: drawn, color: swatch(besieger?.color, '#a8a4ac'), archers: (units?.archer ?? 0) > 0, catapults: (units?.catapult ?? 0) > 0, king: !!army?.royal, units: units ?? undefined }}
          defenders={{ soldiers: Math.max(defenders, town.owner !== null ? 3 : 0), start: Math.max(garrison, town.owner !== null ? 3 : 0), color: swatch(holder?.color, '#b08a3c'), archers: true, catapults: false, rabble: town.owner !== null }}
          setting={walled ? 'palisade' : 'town'}
          seed={town.id}
          round={done}
          over={over}
          winner={left === null || left > 0 ? 'attackers' : 'defenders'}
        />
        <div className="battle-sides">
          <div className="battle-side">
            <small>{L('Kuşatan', 'Besieger')}</small>
            <b>
              <Dot color={besieger?.color} />
              {kingdomName(online, siege.kingdom)}
            </b>
            <Stat label={L('Asker', 'Soldiers')} value={left !== null ? `${fmt(left)} / ${fmt(soldiers)}` : L(`bilinmiyor · ${fmt(lostSoFar)} kayıp`, `unknown · ${fmt(lostSoFar)} lost`)} />
            {units && <UnitRow units={units} />}
          </div>
          <div className="battle-side">
            <small>{L('Savunan', 'Defender')}</small>
            <b>
              {holder ? <Dot color={holder.color} /> : null}
              {holder ? `${holder.name} · ${town.name}` : L(`${town.name} garnizonu`, `${town.name} garrison`)}
            </b>
            <Stat label={L('Asker', 'Soldiers')} value={town.owner === null ? `${fmt(defenders)} / ${fmt(garrison)}` : L('Kasaba halkı', 'Townsfolk')} />
            <Stat label={L('Sur', 'Wall')} value={walled ? L('Kazık çit', 'Palisade') : L('Yok', 'None')} />
          </div>
        </div>
        <p className="hint">
          {L(`Kuşatma ${Math.round(balance.towns.siegeRoundSeconds / 60)} dakikalık turlarla sürer. Her tur savunanlar kuşatanlardan birkaç asker düşürür`, `The siege runs in rounds of ${Math.round(balance.towns.siegeRoundSeconds / 60)} minutes. Each round the defenders bring down a few of the besiegers`)}
          {town.owner === null ? L(', garnizon da kendi askerlerinden kaybeder', ', and the garrison loses some of its own') : L(' (sahipli kasabanın halkı da direnir)', ' (the people of a held town resist too)')}
          {L('; kazık çit kayıpları artırır. Kuşatma bittiğinde ayakta asker kalırsa kasaba kuşatanın olur.', '; a palisade makes the losses heavier. If soldiers are still standing when the siege ends, the town is the besieger\'s.')}
        </p>
        {done > 0 && (
          <ol className="battle-log">
            {rounds.slice(0, done).map((r, i) => (
              <li key={i}>
                <b>{i + 1}.</b> {L('kuşatan', 'besieger')} −{r.lost - (i > 0 ? rounds[i - 1].lost : 0)}
                {town.owner === null ? L(` · garnizon −${r.killed - (i > 0 ? rounds[i - 1].killed : 0)}`, ` · garrison −${r.killed - (i > 0 ? rounds[i - 1].killed : 0)}`) : ''}
                <small>
                  {known ? fmt(r.attackers) : '?'} / {town.owner === null ? fmt(r.defenders) : '—'} {L('asker', 'soldiers')}
                </small>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

import { BattleScene } from './BattleScene'
import { startBattleMusic } from '../../audio/sfx'
import { duckMusic } from '../../net/settings'
import { UNITS, armoryOf, armyAt, balance, countOf, familiarityAt, familiarityBonus, garrisonOf, moraleAt, nearInn, recruitment, territoryRect, territoryStage, trainError, unitSpec } from '@game/shared'
import type { Army, Kingdom, Point, Unit, Units, World } from '@game/shared'
import { useEffect, useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import type { Battle } from '../../net/online'
import { Icon } from '../icons'
import { RESOURCE_NAMES, UNIT_ICONS, UNIT_NAMES, UNIT_NOTES, WEAPON_NAMES } from '../names'
import { Dot } from './diplomacy'
import type { HudData } from './tabs'
import type { Online } from './online'
import { kingdomName } from './online'
import { Meter, Placeholder, Section, Stat, fmt } from './primitives'

// The army tab (CLAUDE.md §9.7): training at the barracks, the garrison, the armies in the field with their morale and
// knowledge of the ground, and the battles; and the battle view that plays a battle out round by round.

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk` : s >= 60 ? `${Math.floor(s / 60)} dk ${s % 60} sn` : `${s} sn`
}

// Where an army rests: its own lands, by an inn, or the open field.
export const restOf = (world: World, kingdom: Kingdom, now: number) => (p: Point) => {
  const t = territoryRect(kingdom.site, territoryStage(kingdom, now))
  if (p.x >= t.x && p.y >= t.y && p.x < t.x + t.size && p.y < t.y + t.size) return 'home' as const
  return nearInn(world.inns, p) ? ('inn' as const) : ('field' as const)
}

const REST_NAMES = { home: 'kendi topraklarında, moral topluyor', inn: 'hanın yanında, hızla moral topluyor', field: 'açık arazide' }

export function armyStatus(army: Army, now: number, rest: ReturnType<typeof restOf>, shieldOf: (kingdom: number) => number = () => 0) {
  const arrive = Date.parse(army.arrive_at)
  if (army.status === 'battle') return 'Savaşta'
  // At the gates of a palace still shielded from the last siege: the siege begins when the shield ends.
  if (army.goal.kind === 'siege' && now >= arrive && shieldOf(army.goal.kingdom) > now) return `Kapıda bekliyor · kuşatmaya ${clock(shieldOf(army.goal.kingdom) - now)}`
  if (now < arrive && army.path.length > 1) {
    const where = army.goal.kind === 'home' ? ('retreat' in army.goal && army.goal.retreat ? 'Geri çekiliyor' : 'Eve dönüyor') : army.goal.kind === 'siege' ? 'Kuşatmaya gidiyor' : 'Yürüyor'
    return `${where} · varış ${clock(arrive - now)}`
  }
  return `Bekliyor · ${REST_NAMES[rest(army.path[army.path.length - 1])]}`
}

export function ArmyTab(data: HudData) {
  const { kingdom, now, world, online } = data
  if (!online) return null
  const barracks = kingdom.buildings.find((b) => b.kind === 'barracks' && b.doneAt <= now)
  const rest = restOf(world, kingdom, now)
  // Numbered by when they were raised.
  const mine = online.armies.filter((a) => a.kingdom_id === online.me).sort((a, b) => a.id - b.id)
  return (
    <>
      {/* The armies first: most orders are given here. */}
      <Section title="Ordularım" icon="swords" aside={`${mine.length} / ${balance.military.maxArmies}`}>
        {mine.length === 0 && <p className="hint">Sahada ordun yok. Garnizondan bir ordu çıkar.</p>}
        <ul className="armies">
          {mine.map((army, i) => (
            <ArmyCard key={army.id} index={i + 1} army={army} others={mine.filter((a) => a.id !== army.id)} data={data} rest={rest} />
          ))}
        </ul>
      </Section>
      <Garrison data={data} armies={mine.length} />
      <Training data={data} has={!!barracks} />
      <Battles online={online} now={now} />
    </>
  )
}

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
  building: 'Kışla yok',
  locked: '2. seviye kışla gerekir',
  people: 'Gönüllü yok',
  cost: 'Kaynak ya da silah yetmiyor',
  research: 'Üniversitede araştırılmalı',
}

function Training({ data, has }: { data: HudData; has: boolean }) {
  const { kingdom, now, online } = data
  const [unit, setUnit] = useState<Unit>('spear')
  const [count, setCount] = useState(1)
  if (!has) {
    return (
      <Section title="Kışla" icon="people">
        <Placeholder icon="lock" title="Kışlan yok">
          Sarayı 2. seviyeye yükselt, sonra İnşa sekmesinden kışla kur. Kışla mızrakçı ve okçu yetiştirir; 2. seviyede süvari ve mancınık da.
        </Placeholder>
      </Section>
    )
  }
  const { willing, cost, weapons, cap, pool } = recruitment(kingdom, now, unit)
  const n = Math.max(1, Math.min(count, Math.max(1, willing)))
  const why = trainError(kingdom, n, now, unit)
  const queue = (kingdom.training ?? []).filter((t) => t.doneAt > now)
  const armory = armoryOf(kingdom)
  return (
    <Section title="Kışla" icon="people" aside={`asker havuzu ${pool} / ${cap}`}>
      <p className="hint">
        Asker havuzu her tur dolar; halk mutlu oldukça (%{Math.round(kingdom.happiness ?? 60)}) daha büyük olur ve askerlik ucuzlar.
      </p>
      <div className="unit-pick" role="radiogroup" aria-label="Birlik türü">
        {UNITS.map((u) => (
          <button key={u} className="btn small" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} title={UNIT_NOTES[u]}>
            <Icon name={UNIT_ICONS[u]} size={16} /> {UNIT_NAMES[u]}
          </button>
        ))}
      </div>
      <p className="hint">{UNIT_NOTES[unit]}.</p>
      <Stat
        label="Birim başı"
        value={[
          ...Object.entries(cost).map(([r, v]) => `${v} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`),
          ...Object.entries(weapons).map(([w, v]) => `${v} ${WEAPON_NAMES[w as keyof typeof WEAPON_NAMES].toLowerCase()} (${Math.floor(armory[w as keyof typeof armory])} var)`),
        ].join(' · ')}
        note={`${unitSpec(unit).trainSeconds} sn`}
      />
      <div className="stepper">
        <button className="btn icon-only" disabled={n <= 1} onClick={() => setCount(n - 1)} aria-label="Bir asker azalt">
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{n}</b> {UNIT_NAMES[unit].toLowerCase()}
        </span>
        <button className="btn icon-only" disabled={n >= willing} onClick={() => setCount(n + 1)} aria-label="Bir asker ekle">
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={!!why} onClick={() => online?.act({ type: 'train', count: n, unit })} title={why ? WHY[why] : undefined}>
          Eğit {why ? `(${WHY[why]})` : ''}
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
    <Section title="Garnizon" icon="crown" aside={`${total} asker sarayda`}>
      {total === 0 ? (
        <p className="hint">Sarayda bekleyen asker yok.</p>
      ) : (
        <>
          {UNITS.filter((u) => (garrison[u] ?? 0) > 0).map((u) => (
            <div key={u} className="stepper">
              <span className="unit-label">
                <Icon name={UNIT_ICONS[u]} size={16} /> {UNIT_NAMES[u]}
              </span>
              <button className="btn icon-only" disabled={(units[u] ?? 0) <= 0} onClick={() => step(u, -1)} aria-label="Azalt">
                <Icon name="minus" size={16} />
              </button>
              <span className="stepper-value">
                <b>{units[u] ?? 0}</b> / {garrison[u]}
              </span>
              <button className="btn icon-only" disabled={(units[u] ?? 0) >= (garrison[u] ?? 0)} onClick={() => step(u, 1)} aria-label="Artır">
                <Icon name="plus" size={16} />
              </button>
            </div>
          ))}
          <div className="row">
            <button
              className="btn small"
              disabled={full || n < 1}
              onClick={() => (online?.act({ type: 'raise', units }), setPicked(null))}
              title={full ? 'Sahada en fazla 2 ordun olabilir' : undefined}
            >
              {n} askerle ordu çıkar
            </button>
            <button
              className={sureDisband ? 'btn small danger' : 'btn small'}
              disabled={n < 1}
              onClick={() => (sureDisband ? (online?.act({ type: 'disband', units }), setPicked(null), setSureDisband(false)) : setSureDisband(true))}
              onBlur={() => setSureDisband(false)}
              title="Askerler köylüye döner; eğitim maliyeti geri gelmez"
            >
              {sureDisband ? `Emin misin? ${n} askeri terhis et` : `${n} askeri terhis et`}
            </button>
          </div>
        </>
      )}
    </Section>
  )
}

function ArmyCard({ index, army, others, data, rest }: { index: number; army: Army; others: Army[]; data: HudData; rest: ReturnType<typeof restOf> }) {
  const { now, online, onShow } = data
  if (!online) return null
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
  return (
    <li className={selected ? 'army-card selected' : 'army-card'}>
      <div className="army-body">
        <div className="army-head">
          <b>
            {index}. Ordu · {soldiers} savaşçı
          </b>
          <small>{armyStatus(army, now, rest, (id) => online.kingdoms.find((k) => k.id === id)?.shieldUntil ?? 0)}</small>
        </div>
        <UnitRow units={army.units ?? { spear: soldiers }} />
        <div className="army-stats">
          <div>
            <span>
              Moral <b>%{Math.round(morale)}</b>
            </span>
            <Meter value={morale / 100} tone={morale >= 60 ? 'up' : morale >= 30 ? 'gold' : 'down'} label="Moral" segments={10} />
          </div>
          <div>
            <span>
              Saha bilgisi <b>+{familiarityBonus(familiarity).toFixed(1).replace('.', ',')} zar</b>
            </span>
            <Meter value={familiarity / 100} tone="water" label="Saha bilgisi" segments={10} />
          </div>
        </div>
        {army.contact_until && Date.parse(army.contact_until) > now && (
          <small className="order-note up">
            <Icon name="scroll" size={16} /> Komutanla iletişim açık: {clock(Date.parse(army.contact_until) - now)} boyunca emirler hemen uygulanır
          </small>
        )}
        {pending.map((o) => (
          <small key={o.id} className="order-note">
            <Icon name="scroll" size={16} /> Elçi yolda: emir {clock(Date.parse(o.effective_at) - now)} sonra ulaşacak
          </small>
        ))}
        <div className="army-actions">
          <button className="btn small" onClick={() => (online.setArmy(army.id), onShow(here))}>
            <Icon name="pin" size={16} /> Göster
          </button>
          <button className="btn small" disabled={busy} onClick={() => online.target(army.id)}>
            Hareket
          </button>
          <button
            className="btn small"
            aria-pressed={online.following === army.id}
            onClick={() => {
              online.setArmy(army.id)
              online.follow(online.following === army.id ? null : army.id)
            }}
            title="Kamera orduyu takip etsin (haritayı sürükleyince bırakır)"
          >
            <Icon name="eye" size={16} /> {online.following === army.id ? 'Takibi bırak' : 'Takip et'}
          </button>
          <button className="btn small" disabled={busy} onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'home' } })}>
            <Icon name="home" size={16} /> Eve dön
          </button>
          <button
            className="btn small"
            disabled={busy || soldiers < 2 || others.length + 1 >= balance.military.maxArmies}
            onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'split', soldiers: Math.floor(soldiers / 2) } })}
            title="Ordunun yarısını ayrı bir orduya ayırır (en fazla 2 ordu)"
          >
            İkiye böl
          </button>
          {near && (
            <button className="btn small" disabled={busy} onClick={() => online.act({ type: 'army', army: army.id, order: { kind: 'merge', with: near.id } })}>
              Birleştir
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
  const title = (b: Battle) =>
    b.kind === 'siege' && b.besieged !== null
      ? `${kingdomName(online, b.besieged)} kuşatması`
      : `${kingdomName(online, b.attackers[0]?.kingdom)} — ${kingdomName(online, b.defenders[0]?.kingdom)}`
  return (
    <Section title="Savaşlar" icon="swords" aside={going.length ? `${going.length} sürüyor` : undefined}>
      {going.length + done.length === 0 && <p className="hint">Henüz muharebe olmadı.</p>}
      <ul className="places">
        {[...going, ...done].map((b) => (
          <li key={b.id}>
            <Icon name={b.kind === 'siege' ? 'crown' : 'swords'} size={24} />
            <span>
              <b>{title(b)}</b>
              <small>
                {Date.parse(b.started_at) > now
                  ? `${clock(Date.parse(b.started_at) - now)} sonra başlıyor`
                  : Date.parse(b.ends_at) > now
                    ? `Sürüyor · ${clock(Date.parse(b.ends_at) - now)} kaldı`
                    : `Bitti · ${b.plan.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`}
                {involved(b) ? ' · sen de varsın' : ''}
              </small>
            </span>
            <button className="btn small" onClick={() => online.watch(b.id)}>
              İzle
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
    const units = fighters.reduce<Units>((all, f) => {
      for (const [u, n] of Object.entries(f.units ?? { spear: f.soldiers })) all[u as Unit] = (all[u as Unit] ?? 0) + (n ?? 0)
      return all
    }, {})
    const names = [...new Set(fighters.map((f) => (f.army === null ? `${kingdomName(online, f.kingdom)} garnizonu` : kingdomName(online, f.kingdom))))]
    const colors = [...new Set(fighters.map((f) => online.kingdoms.find((k) => k.id === f.kingdom)?.color))]
    return { start, now, bonus, counter, faith, towers, units, names, colors }
  }
  const a = side('attackers')
  const d = side('defenders')
  const defense = battle.plan.defense
  const winner = battle.plan.winner === 'attackers' ? a : d
  const sceneSide = (s: typeof a) => ({
    soldiers: s.now.soldiers,
    start: s.start.soldiers,
    color: KINGDOM_COLORS[s.colors[0] as KingdomColor]?.swatch ?? '#a8a4ac',
    archers: (s.units.archer ?? 0) > 0,
    catapults: (s.units.catapult ?? 0) > 0,
  })
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
            <h2 id="battle-title">{battle.kind === 'siege' ? `${kingdomName(online, battle.besieged ?? 0)} kuşatması` : 'Meydan muharebesi'}</h2>
            <small>
              {now < started ? `${clock(started - now)} sonra başlıyor` : over ? `Bitti · ${winner.names.join(', ')} kazandı` : `Tur ${shown} / ${rounds.length} sürüyor`}
            </small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        <BattleScene
          attackers={sceneSide(a)}
          defenders={sceneSide(d)}
          siege={battle.kind === 'siege'}
          round={shown}
          over={over}
          winner={battle.plan.winner}
        />
        <div className="battle-sides">
          {[
            { title: 'Saldıranlar', s: a, roll: last?.attackers },
            { title: 'Savunanlar', s: d, roll: last?.defenders },
          ].map(({ title, s, roll }) => (
            <div key={title} className="battle-side">
              <small>{title}</small>
              <b>
                {s.colors.map((c) => (
                  <Dot key={c ?? 'x'} color={c} />
                ))}
                {s.names.join(', ')}
              </b>
              <Stat label="Asker" value={`${fmt(s.now.soldiers)} / ${fmt(s.start.soldiers)}`} />
              <span className="sign">
                <span>Moral</span>
                <Meter value={s.now.morale / 100} tone={s.now.morale >= 50 ? 'up' : s.now.morale >= 25 ? 'gold' : 'down'} label="Moral" segments={10} />
                <small>%{Math.round(s.now.morale)}</small>
              </span>
              <UnitRow units={s.units} />
              <Stat label="Zar bonusu" value={`${s.bonus >= 0 ? '+' : '−'}${Math.abs(s.bonus).toFixed(1).replace('.', ',')}`} note={
                  [
                    s.counter ? `birlik üstünlüğü ${s.counter >= 0 ? '+' : '−'}${Math.abs(s.counter).toFixed(1).replace('.', ',')}` : '',
                    s.faith ? `iman +${s.faith.toFixed(1).replace('.', ',')}` : '',
                    s.towers ? `${s.towers} kule` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              {roll && (
                <div className="dice" aria-label={`Son zar ${roll.roll}`}>
                  <Icon name="dice" size={24} />
                  {face(roll.roll)}
                  <small>
                    + {roll.bonus.toFixed(1).replace('.', ',')} bonus → rakipten {roll.kills} asker{roll.towerKills ? ` (${roll.towerKills} kuleden)` : ''}, −{Math.round(roll.moraleHit)} moral
                  </small>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="hint">
          Her tur iki taraf da d{balance.military.battle.dice} atar. Zara saha bilgisi eklenir
          {defense && (defense.towers || defense.walls)
            ? `; kuşatılan saray ${defense.towers} kule ve ${defense.walls} sur ile savunuyor${battle.plan.walls !== undefined && battle.plan.walls < defense.walls ? ` (mancınıklar ${defense.walls - battle.plan.walls} suru etkisiz kıldı)` : ''}`
            : ''}
          ; tapınağın imanı ve yakındaki gözcü kuleleri de zara eklenir, kuleler her tur birkaç düşman vurur (askersiz bile birkaç tur direnir); birlik türlerinin üstünlüğü (mızrak &gt; süvari &gt; okçu &gt; mızrak) de eklenir. Morali
          biten ya da askeri kalmayan taraf yenilir.
        </p>
        {shown > 0 && (
          <ol className="battle-log">
            {rounds.slice(0, shown).map((r, i) => (
              <li key={i}>
                <b>{i + 1}.</b> {face(r.attackers.roll)} {r.attackers.kills} öldürdü · {face(r.defenders.roll)} {r.defenders.kills} öldürdü
                <small>
                  {fmt(r.attackers.soldiers)} / {fmt(r.defenders.soldiers)} asker
                </small>
              </li>
            ))}
          </ol>
        )}
        {over && battle.report?.loot && (
          <p className="alert">
            Yağma: {Object.entries(battle.report.loot)
              .map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`)
              .join(', ')}
          </p>
        )}
      </section>
    </div>
  )
}

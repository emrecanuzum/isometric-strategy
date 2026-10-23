import {
  OPERATIONS,
  palaceLevel,
  questError,
  operationNetworkCost,
  UNITS,
  allied,
  raidChance,
  relationsOf,
  towersNear,
  reputation,
  alliesOf,
  atWar,
  balance,
  enemiesOf,
  hasClaim,
  operationSpec,
  peaceTermsError,
  relationAt,
  relationBetween,
  spyCapacity,
  tributeBetween,
  warScore,
  warThreshold,
} from '@game/shared'
import type { BattleRecord, Envoy, Kingdom, Operation, Pact, PeaceTerms, SpyTopic } from '@game/shared'
import { useState } from 'react'
import { Subtabs, usePart } from './Subtabs'
import type { Part } from './Subtabs'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { INN_KIND_NAMES, innInfo } from '../../game/innInfo'
import { innLook, isCaravanserai } from '../../game/innSprites'
import { cityInfo } from '../../game/cities'
import type { Estimate } from '../../net/online'
import { Icon } from '../icons'
import { L } from '../../lib/i18n'
import { RESOURCE_NAMES, UNIT_NAMES } from '../names'
import { waitWhy } from '../why'
import type { HudData } from './tabs'
import type { KingdomInfo, Online } from './online'
import { kingdomName, lastSeen, relationTermsIn } from './online'
import { CrownBanner, CrownsPanel } from './cities'
import { Meter, Placeholder, Section, SpriteView, Stat, fmt } from './primitives'
import { PixelSelect } from './PixelSelect'
import { NameNote } from '../NameNote'

// The diplomacy tab (CLAUDE.md §9.7): the kingdoms of the lobby and the player's standing with each, a kingdom
// looked at closely (EU4-like: its relations, alliances and wars, and what the spies can tell), and the spies.

const d = balance.diplomacy
export const swatchOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'
const signedInt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`
const relationTone = (v: number) => (v >= d.alliance.minRelation ? 'up' : v <= d.war.maxRelation ? 'down' : 'gold')

export const ENVOY_NAMES: Record<Envoy['kind'], string> = {
  improve: L('İlişki geliştirme', 'Improve relations'),
  gift: L('Hediye', 'Gift'),
  tribute: L('Haraç isteği', 'Tribute demand'),
  alliance: L('İttifak teklifi', 'Alliance offer'),
  peace: L('Barış teklifi', 'Peace offer'),
  insult: L('Hakaret', 'Insult'),
  marriage: L('Evlilik teklifi', 'Marriage proposal'),
}
export const TOPIC_NAMES: Record<SpyTopic, string> = { stores: L('Hammadde', 'Stores'), army: L('Ordu', 'Army'), diplomacy: L('Diplomasi', 'Diplomacy') }
export const OPERATION_NAMES: Record<Operation, string> = {
  burn: L('Depoları yak', 'Burn the stores'),
  delay: L('İnşaatları geciktir', 'Delay construction'),
  kidnap: L('Kraliçeyi kaçır', 'Kidnap the queen'),
  revolt: L('İsyan kışkırt', 'Incite a revolt'),
  townRevolt: L('Kasabada isyan kışkırt', 'Incite a town revolt'),
}
const OPERATION_NOTES: Record<Operation, string> = {
  burn: L('Yemek ve yapı malzemesinin dörtte biri yanar', 'A quarter of their food and building materials burns'),
  delay: L('Süren inşaatlar uzar', 'Their ongoing construction takes longer'),
  kidnap: L('Kraliçe senin elinde kalır; halkı yasa boğulur, fidye ister', 'The queen stays in your hands, her people sink into mourning, and you can ask a ransom'),
  revolt: L('On dakika üretimi yarıya iner, halk huzursuzlanır', 'For ten minutes their production is halved and the people grow restless'),
  townRevolt: L(
    `Seçtiğin kasabasının sadakati ${-balance.espionage.operations.townRevolt.loyalty} düşer; çok düşerse kasaba ayaklanır, sonunda kopar`,
    `The chosen town's loyalty drops by ${-balance.espionage.operations.townRevolt.loyalty}; if it falls far enough the town revolts and finally breaks away`,
  ),
}
export const CLAIM_NAMES: Record<string, string> = {
  spy: L('casus yakalandı', 'spy caught'),
  tribute: L('haraç reddedildi', 'tribute refused'),
  renege: L('haraç kesildi', 'tribute stopped'),
  alliance: L('ittifak bozuldu', 'alliance broken'),
  kidnap: L('kraliçe kaçırıldı', 'queen kidnapped'),
  sabotage: L('sabotaj', 'sabotage'),
  insult: L('hakarete uğradı', 'insulted'),
  raid: L('ticaret yolu yağmalandı', 'trade route raided'),
}
export const TERMS_NAMES: Record<PeaceTerms['kind'], string> = {
  white: L('Beyaz barış', 'White peace'),
  gold: L('Altın iste', 'Demand gold'),
  tribute: L('Haraç iste', 'Demand tribute'),
  offer: L('Altın öde', 'Pay gold'),
}
export const describeTerms = (t: PeaceTerms | null | undefined) =>
  !t || t.kind === 'white'
    ? L('beyaz barış (kimse bir şey ödemez)', 'white peace (nobody pays anything)')
    : t.kind === 'gold'
      ? L(`onlara ${t.gold} altın ödemen karşılığında`, `in return for you paying them ${t.gold} gold`)
      : t.kind === 'tribute'
        ? L(`onlara saatte ${t.gold} altın haraç vermen karşılığında`, `in return for you paying them ${t.gold} gold tribute an hour`)
        : L(`sana ${t.gold} altın vermeleri karşılığında`, `in return for them giving you ${t.gold} gold`)

export function Dot({ color }: { color: string | null | undefined }) {
  return <i className="kingdom-dot" style={{ background: swatchOf(color) }} aria-hidden />
}

function RelationBar({ value }: { value: number }) {
  return (
    <span className="relation">
      <Meter value={(value + 100) / 200} tone={relationTone(value)} label={L('İlişki', 'Relations')} segments={10} />
      <b className={relationTone(value) === 'gold' ? undefined : relationTone(value)}>{signedInt(value)}</b>
    </span>
  )
}

const stateChips = (online: Online, id: number) => {
  const chips: { label: string; tone?: 'up' | 'down' }[] = []
  if (allied(online.pacts, online.me, id)) chips.push({ label: L('Müttefik', 'Ally'), tone: 'up' })
  if (atWar(online.pacts, online.me, id)) chips.push({ label: L('Savaşta', 'At war'), tone: 'down' })
  if (tributeBetween(online.pacts, online.me, id)) chips.push({ label: L('Haraç veriyor', 'Pays tribute') })
  if (tributeBetween(online.pacts, id, online.me)) chips.push({ label: L('Haraç alıyor', 'Takes tribute') })
  return chips
}

// The diplomacy tab's two parts, the lords and the spies, the last one looked at remembered in this browser.
type DiplomacyPart = 'kingdoms' | 'crowns' | 'spies'
const DIPLOMACY_PARTS: DiplomacyPart[] = ['kingdoms', 'crowns', 'spies']

export function DiplomacyTab(data: HudData) {
  const { online } = data
  const [view, setView] = usePart('diplomacy', DIPLOMACY_PARTS, 'kingdoms')
  if (!online) return null
  const focus = online.kingdoms.find((k) => k.id === online.focus && k.id !== online.me)
  if (focus) return <KingdomDetail data={data} online={online} target={focus} />
  const incoming = online.envoys.filter((e) => e.to_id === online.me && e.status === 'pending').length
  const active = online.missions.filter((m) => m.owner_id === online.me && !m.ended_at).length
  // A crown's task done and waiting for its reward.
  const crownReady = !!data.kingdom && data.world.cities.some((_, i) => !questError(data.kingdom!, i, 'claim', data.now, data.world.cities.length, palaceLevel(data.kingdom!, data.now)))
  return (
    <>
      <Subtabs
        label={L('Diplomasi', 'Diplomacy')}
        part={view}
        onPart={setView}
        parts={[
          { id: 'kingdoms', name: L('Lordlar', 'Lords'), icon: 'banner', dot: incoming > 0 },
          { id: 'crowns', name: L('Krallık', 'Kingdom'), icon: 'crown', dot: crownReady },
          { id: 'spies', name: L('Casusluk', 'Espionage'), icon: 'eye', count: active },
        ]}
      />
      {view === 'kingdoms' && <KingdomList data={data} online={online} />}
      {view === 'crowns' && data.kingdom && <CrownsPanel world={data.world} kingdom={data.kingdom} online={online} market={online.market} now={data.now} />}
      {view === 'spies' && <SpyPanel data={data} online={online} />}
    </>
  )
}

function KingdomList({ data, online }: { data: HudData; online: Online }) {
  const { now, world, kingdom, onShow } = data
  const others = online.kingdoms.filter((k) => k.id !== online.me)
  const allies = others.filter((k) => allied(online.pacts, online.me, k.id))
  const rest = others.filter((k) => !allied(online.pacts, online.me, k.id))
  const incoming = online.envoys.filter((e) => e.to_id === online.me && e.status === 'pending')
  const row = (k: KingdomInfo) => (
    <li key={k.id}>
      <button className="card kingdom-row" onClick={() => online.setFocus(k.id)}>
        <Dot color={k.color} />
        <span>
          <b>
            <CrownBanner world={data.world} liege={k.liege} /> {k.name}
          </b>
          <small>
            {k.username ?? '—'} · {L(`${k.palace}. seviye saray`, `level ${k.palace} palace`)}
            {k.queen ? L(' · kraliçe', ' · queen') : ''}
            {k.id !== online.me && <> · {lastSeen(k.seenAt, data.now)}</>}
          </small>
          <span className="chips">
            {stateChips(online, k.id).map((c) => (
              <span key={c.label} className={`chip ${c.tone ?? ''}`}>
                {c.label}
              </span>
            ))}
          </span>
        </span>
        <RelationBar value={relationBetween(online.relations, online.me, k.id, now, relationTermsIn(online, online.me, k.id))} />
      </button>
    </li>
  )
  const inns = world.inns
    .map((p, index) => ({ p, index, distance: Math.round(Math.hypot(p.x - kingdom.site.x, p.y - kingdom.site.y)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
  return (
    <>
      {incoming.length > 0 && <Proposals online={online} envoys={incoming} />}
      <Section title={L('Müttefikler', 'Allies')} icon="shield" aside={`${allies.length}`}>
        {allies.length === 0 ? (
          <p className="hint">{L(`Müttefikin yok. İttifak için ilişkin en az +${d.alliance.minRelation} olmalı.`, `You have no allies. An alliance needs relations of at least +${d.alliance.minRelation}.`)}</p>
        ) : (
          <ul className="places">{allies.map(row)}</ul>
        )}
      </Section>
      <Section title={L('Lordlar', 'Lords')} icon="banner" aside={`${rest.length}`}>
        {others.length === 0 ? (
          <Placeholder icon="banner" title={L('Lobide başka lord yok', 'No other lord in the lobby')}>
            {L('Biri katılınca burada görünecek.', 'They will show up here once someone joins.')}
          </Placeholder>
        ) : (
          <ul className="places">{rest.map(row)}</ul>
        )}
      </Section>
      <Section title={L('Tarafsız hanlar', 'Neutral inns')} icon="inn" aside={L('ordular burada moral toplar', 'armies regain morale here')}>
        <ul className="places">
          {inns.map(({ p, index, distance }) => {
            const info = innInfo(world, index, isCaravanserai(world, p))
            return (
            <li key={`${p.x},${p.y}`}>
              <SpriteView sprite={innLook(world, p).sprite} scale={0.25} />
              <span>
                <b>{info.name}</b>
                <small>
                  {INN_KIND_NAMES[info.kind]} · {L(`${distance} karo uzakta`, `${distance} tiles away`)}
                </small>
              </span>
              <button className="btn icon-only" onClick={() => onShow({ x: p.x + 1, y: p.y + 1 })} aria-label={L('Haritada göster', 'Show on map')}>
                <Icon name="pin" size={16} />
              </button>
            </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

export function Proposals({ online, envoys }: { online: Online; envoys: Envoy[] }) {
  return (
    <Section title={L('Bekleyen teklifler', 'Pending proposals')} icon="scroll" aside={`${envoys.length}`}>
      <ul className="places">
        {envoys.map((e) => (
          <li key={e.id}>
            <Icon name="scroll" size={24} />
            <span>
              <b>
                {kingdomName(online, e.from_id)}: {ENVOY_NAMES[e.kind]}
              </b>
              <small>
                {e.kind === 'tribute'
                  ? L(
                      `Her turda ${e.gold} altın istiyor. Reddetmek ilişkiyi ${-d.tribute.reject} düşürür ve onlara savaş gerekçesi verir.`,
                      `Demands ${e.gold} gold every round. Refusing lowers relations by ${-d.tribute.reject} and gives them a casus belli.`,
                    )
                  : e.kind === 'alliance'
                    ? L('Müttefik olmak istiyor.', 'Wants to become your ally.')
                    : e.terms?.kind === 'marriage'
                      ? L(
                          `${e.terms.name} adlı prensesini hanedanına gelin vermek istiyor. Kabul edersen ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} artar.`,
                          `Offers Princess ${e.terms.name} as a bride for your house. Accept and your relations rise by +${balance.dynasty.intrigue.marriage.lord.relation}.`,
                        )
                      : L(`Barış: ${describeTerms(e.terms as PeaceTerms | null)}.`, `Peace: ${describeTerms(e.terms as PeaceTerms | null)}.`)}
              </small>
            </span>
            <button className="btn small" onClick={() => online.act({ type: 'respond', envoy: e.id, accept: true })}>
              {L('Kabul', 'Accept')}
            </button>
            <button className="btn small danger" onClick={() => online.act({ type: 'respond', envoy: e.id, accept: false })}>
              {L('Ret', 'Refuse')}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Range({ label, value, unit }: { label: string; value: Estimate | null | undefined; unit?: string }) {
  // Turkish puts the percent sign first: %90–95.
  return <Stat label={label} value={value ? (unit === '%' ? L(`%${fmt(value.lo)}–${fmt(value.hi)}`, `${fmt(value.lo)}–${fmt(value.hi)}%`) : `${fmt(value.lo)}–${fmt(value.hi)}${unit ?? ''}`) : '?'} />
}

type LordPart = 'relation' | 'envoy' | 'pacts' | 'hostile' | 'spies'
const LORD_PARTS: LordPart[] = ['relation', 'envoy', 'pacts', 'hostile', 'spies']

function KingdomDetail({ data, online, target }: { data: HudData; online: Online; target: KingdomInfo }) {
  const { now, kingdom } = data
  const [gift, setGift] = useState(50)
  // A tribute is gold an hour, between tribute.minGold and maxGold in steps; outside that the envoy is refused.
  const [tribute, setTribute] = useState(() => Math.min(60, balance.diplomacy.tribute.maxGold))
  const [confirmWar, setConfirmWar] = useState(false)
  const [terms, setTerms] = useState<PeaceTerms['kind']>('white')
  const [termsGold, setTermsGold] = useState(100)
  const [outcome, setOutcome] = useState<string | null>(null)
  // What is done to a lord, in parts (the last one looked at remembered, like the other menus).
  const [part, setPart] = usePart<LordPart>('lord', LORD_PARTS, 'relation')
  // The town to stir up (townRevolt): one of the target's.
  const theirTowns = (data.towns ?? []).filter((t) => t.owner === target.id)
  const [townPick, setTownPick] = useState<number | null>(null)
  const picked = theirTowns.find((t) => t.id === townPick) ?? theirTowns[0] ?? null
  const me = online.me
  const bond = relationTermsIn(online, me, target.id)
  const relation = relationBetween(online.relations, me, target.id, now, bond)
  // Enemies elsewhere make the player's courtesies count for less.
  const standing = reputation(relationsOf(online.relations, me, online.kingdoms.map((k) => k.id), now, (o) => relationTermsIn(online, me, o)))
  const war = atWar(online.pacts, me, target.id)
  const ally = allied(online.pacts, me, target.id)
  const theyPay = tributeBetween(online.pacts, me, target.id)
  const wePay = tributeBetween(online.pacts, target.id, me)
  const alliance = online.pacts.find((p) => p.kind === 'alliance' && ((p.from_id === me && p.to_id === target.id) || (p.from_id === target.id && p.to_id === me)))
  const pair = online.relations.find((r) => r.a === Math.min(me, target.id) && r.b === Math.max(me, target.id))
  const cooling = pair?.improved_at ? Date.parse(pair.improved_at) + d.improve.cooldownSeconds * 1000 - now : 0
  const travelling = online.envoys.filter((e) => e.from_id === me && e.to_id === target.id && (e.status === 'traveling' || e.status === 'pending'))
  const sending = (kind: Envoy['kind']) => travelling.some((e) => e.kind === kind)
  const intel = online.intel[target.id]
  const spiesHome = kingdom.spies ?? 0
  const theirAllies = alliesOf(online.pacts, target.id)
  const theirWars = enemiesOf(online.pacts, target.id)
  const theirTributes = online.pacts.filter((p: Pact) => p.kind === 'tribute' && (p.from_id === target.id || p.to_id === target.id))
  const theirRelations = online.relations
    .filter((r) => (r.a === target.id || r.b === target.id) && r.a !== me && r.b !== me)
    .map((r) => ({ other: r.a === target.id ? r.b : r.a, value: relationAt(r.value, Date.parse(r.at), now, relationTermsIn(online, r.a, r.b)) }))
    .filter((r) => Math.abs(r.value) >= 1)
    .sort((a, b) => b.value - a.value)
  const envoy = (kind: Envoy['kind'], extra: { gold?: number; terms?: PeaceTerms } = {}) => online.act({ type: 'envoy', to: target.id, kind, ...extra })
  const claim = hasClaim(online.claims, me, target.id, now)
  const theirClaim = hasClaim(online.claims, target.id, me, now)
  const myClaims = online.claims.filter((c) => c.holder_id === me && c.target_id === target.id && Date.parse(c.expires_at) > now)
  const threshold = warThreshold(claim)
  const warPact = online.pacts.find((p) => p.kind === 'war' && ((p.from_id === me && p.to_id === target.id) || (p.from_id === target.id && p.to_id === me)))
  const score = warPact ? warScore(online.battles as unknown as BattleRecord[], warPact, me, target.id) : 0
  const peaceTerms: PeaceTerms = terms === 'white' ? { kind: 'white' } : { kind: terms, gold: termsGold }
  const termsWhy = peaceTermsError(peaceTerms, score)
  const best = intel ? Math.max(...Object.values(intel.strength)) : 0
  const spiesThere = online.missions.filter((m) => m.owner_id === me && m.target_id === target.id && !m.ended_at).length
  const parts: Part<LordPart>[] = [
    { id: 'relation', name: L('İlişki', 'Relations'), icon: 'banner' },
    { id: 'envoy', name: L('Elçi', 'Envoy'), icon: 'scroll', count: travelling.length || undefined },
    { id: 'pacts', name: L('Anlaşmalar', 'Treaties'), icon: 'crown', dot: war },
    { id: 'hostile', name: L('Düşmanlık', 'Hostility'), icon: 'swords' },
    { id: 'spies', name: L('Casusluk', 'Espionage'), icon: 'eye', count: spiesThere || undefined },
  ]
  return (
    <>
      <button className="btn small back" onClick={() => online.setFocus(null)}>
        ← {L('Lordlar', 'Lords')}
      </button>
      <div className="feature kingdom-head">
        <Dot color={target.color} />
        <div>
          <b>
            <CrownBanner world={data.world} liege={target.liege} /> {target.name}
          </b>
          <NameNote name={target.name} />
          <p className="hint">
            {target.username ?? '—'} · {L(`${target.palace}. seviye saray`, `level ${target.palace} palace`)}
            {target.queen ? L(' · kraliçesi var', ' · has a queen') : ''} · {lastSeen(target.seenAt, now)}
          </p>
          <p className="hint">
            {target.liege != null && data.world.cities[target.liege]
              ? L(`${cityInfo(data.world, target.liege).name} lordu`, `A lord of the ${cityInfo(data.world, target.liege).name}`)
              : L('Henüz bir taca biat etmedi', 'Has not yet sworn fealty to a crown')}
            {bond.max < 100 &&
              L(
                ` · rakip taçların lordlarısınız: ilişki ${bond.rest} başlar, en fazla +${bond.max} olur${d.alliance.minRelation > bond.max ? ', ittifak kurulamaz' : ''}`,
                ` · you serve rival crowns: relations start at ${bond.rest} and reach at most +${bond.max}${d.alliance.minRelation > bond.max ? '; no alliance is possible' : ''}`,
              )}
          </p>
        </div>
        <button className="btn icon-only" onClick={() => data.onShow(target.site)} aria-label={L('Haritada göster', 'Show on map')}>
          <Icon name="pin" size={16} />
        </button>
      </div>
      <Subtabs label={L(`${target.name} ile`, `With ${target.name}`)} parts={parts} part={part} onPart={setPart} />
      {part === 'relation' && (
        <>
        <Section title={L('Seninle ilişkisi', 'Relations with you')} icon="banner">
          <RelationBar value={relation} />
          {(target.shieldUntil ?? 0) > now && (
            <p className="hint">
              <Icon name="shield" size={16} />{' '}
              {L(
                `Yakın zamanda kuşatıldı: sonraki kuşatmaya ${Math.ceil(((target.shieldUntil ?? 0) - now) / 60000)} dk var.`,
                `Besieged recently: ${Math.ceil(((target.shieldUntil ?? 0) - now) / 60000)} min until the next siege.`,
              )}
            </p>
          )}
          {warPact && (
            <div className="sign">
              <span>{L('Savaş puanı', 'War score')}</span>
              <Meter value={(score + 100) / 200} tone={score > 0 ? 'up' : score < 0 ? 'down' : 'gold'} label={L('Savaş puanı', 'War score')} segments={10} />
              <b className={score > 0 ? 'up' : score < 0 ? 'down' : undefined}>{signedInt(score)}</b>
            </div>
          )}
          {myClaims.map((c) => (
            <p key={c.expires_at + c.reason} className="hint">
              <Icon name="swords" size={16} />{' '}
              {L(
                `Savaş gerekçen var: ${CLAIM_NAMES[c.reason] ?? c.reason} (${Math.ceil((Date.parse(c.expires_at) - now) / 60000)} dk)`,
                `You have a casus belli: ${CLAIM_NAMES[c.reason] ?? c.reason} (${Math.ceil((Date.parse(c.expires_at) - now) / 60000)} min)`,
              )}
            </p>
          ))}
          {theirClaim && <p className="hint">{L('Onların da sana karşı bir savaş gerekçesi var.', 'They also hold a casus belli against you.')}</p>}
          <span className="chips">
            {stateChips(online, target.id).map((c) => (
              <span key={c.label} className={`chip ${c.tone ?? ''}`}>
                {c.label}
              </span>
            ))}
          </span>
          <p className="hint">
            {L(
              `İttifak için en az +${d.alliance.minRelation} gerekir. Savaş ilanı için ilişki en fazla ${d.war.maxRelation} olmalı; savaş gerekçen varsa ${d.casusBelli.maxRelation} yeter. Gerekçesiz savaş açan, diğer bütün lordlarla ${d.casusBelli.infamy} ilişki kaybeder.`,
              `An alliance needs at least +${d.alliance.minRelation}. Declaring war needs relations of at most ${d.war.maxRelation}; with a casus belli ${d.casusBelli.maxRelation} is enough. Whoever starts a war without one loses ${d.casusBelli.infamy} relations with every other lord.`,
            )}
          </p>
        </Section>
        </>
      )}
      {part === 'hostile' && (
        <>
        <Hostility data={data} online={online} target={target} />
        </>
      )}
      {part === 'envoy' && (
        <>
        <Section title={L('Elçi gönder', 'Send an envoy')} icon="scroll" aside={L(`${d.envoySeconds} sn yol`, `${d.envoySeconds} s on the road`)}>
          {war && <p className="hint">{L('Savaştayken elçiler yalnızca barış götürür.', 'In wartime envoys carry only peace offers.')}</p>}
          {standing < 0.995 && (
            <p className="hint">
              <Icon name="warn" size={16} />{' '}
              {L(
                `İtibarın %${Math.round(standing * 100)}: başka lordlarla aran kötü olduğu için ilişki geliştirme ve hediyeler daha az etkili.`,
                `Your reputation is ${Math.round(standing * 100)}%: because you are on bad terms with other lords, improving relations and gifts work less well.`,
              )}
            </p>
          )}
          {relation < 0 && (
            <p className="hint">
              {L(
                'Sana kötü gözle baktıkları için buradaki casus ağın daha yavaş kurulur ve casusların daha çabuk yakalanır.',
                'Because they look on you with suspicion, your spy network here grows more slowly and your spies are caught sooner.',
              )}
            </p>
          )}
          <div className="actions">
            {!war && (
            <button
              className="btn small"
              disabled={sending('improve') || cooling > 0 || kingdom.stock.gold < d.improve.cost.gold}
              data-why={
                sending('improve')
                  ? L('Elçin zaten yolda', 'Your envoy is already on the road')
                  : cooling > 0
                    ? waitWhy(cooling, L('Elçin yeni döndü; ', 'Your envoy has just come back; '))
                    : L(`Yeterli altın yok (eksik: ${Math.ceil(d.improve.cost.gold - kingdom.stock.gold)})`, `Not enough gold (short: ${Math.ceil(d.improve.cost.gold - kingdom.stock.gold)})`)
              }
              onClick={() => envoy('improve')}
              title={cooling > 0 ? L(`${Math.ceil(cooling / 1000)} sn sonra yeniden`, `Again in ${Math.ceil(cooling / 1000)} s`) : undefined}
            >
              {L(`İlişki geliştir · ${d.improve.cost.gold} altın (+${Math.round(d.improve.gain * standing)})`, `Improve relations · ${d.improve.cost.gold} gold (+${Math.round(d.improve.gain * standing)})`)}
            </button>
            )}
            {!war && (
            <span className="stepper">
              <button className="btn icon-only" disabled={gift <= d.gift.minGold} data-why={L(`Hediye en az ${d.gift.minGold} altın`, `A gift must be at least ${d.gift.minGold} gold`)} onClick={() => setGift(Math.max(d.gift.minGold, gift - 10))} aria-label={L('Azalt', 'Decrease')}>
                <Icon name="minus" size={16} />
              </button>
              <span className="stepper-value">
                <b>{gift}</b> {L('altın', 'gold')}
              </span>
              <button className="btn icon-only" onClick={() => setGift(gift + 10)} aria-label={L('Artır', 'Increase')}>
                <Icon name="plus" size={16} />
              </button>
              <button className="btn small" disabled={kingdom.stock.gold < gift || sending('gift')} data-why={sending('gift') ? L('Hediye elçin zaten yolda', 'Your gift envoy is already on the road') : L(`Yeterli altın yok (eksik: ${Math.ceil(gift - kingdom.stock.gold)})`, `Not enough gold (short: ${Math.ceil(gift - kingdom.stock.gold)})`)} onClick={() => envoy('gift', { gold: gift })}>
                {L('Hediye', 'Gift')} (+{Math.min(d.gift.maxGain, Math.round(gift * d.gift.relationPerGold))})
              </button>
            </span>
            )}
            {!war && !ally && !theyPay && (
              <span className="stepper">
                <button className="btn icon-only" disabled={tribute <= d.tribute.minGold} data-why={L(`Haraç en az saatte ${d.tribute.minGold} altın`, `Tribute must be at least ${d.tribute.minGold} gold an hour`)} onClick={() => setTribute(Math.max(d.tribute.minGold, tribute - d.tribute.step))} aria-label={L('Azalt', 'Decrease')}>
                  <Icon name="minus" size={16} />
                </button>
                <span className="stepper-value">
                  <b>{tribute}</b> {L('altın/saat', 'gold/hour')}
                </span>
                <button className="btn icon-only" disabled={tribute >= d.tribute.maxGold} data-why={L(`Haraç en fazla saatte ${d.tribute.maxGold} altın`, `Tribute can be at most ${d.tribute.maxGold} gold an hour`)} onClick={() => setTribute(Math.min(d.tribute.maxGold, tribute + d.tribute.step))} aria-label={L('Artır', 'Increase')}>
                  <Icon name="plus" size={16} />
                </button>
                <button className="btn small" disabled={sending('tribute')} data-why={L('Haraç elçin zaten yolda', 'Your tribute envoy is already on the road')} onClick={() => envoy('tribute', { gold: tribute })}>
                  {L('Haraç iste', 'Demand tribute')}
                </button>
              </span>
            )}
            {!ally && !war && (
              <button className="btn small" disabled={relation < d.alliance.minRelation || sending('alliance')} data-why={
                  sending('alliance')
                    ? L('İttifak elçin zaten yolda', 'Your alliance envoy is already on the road')
                    : L(`İttifak için ilişki en az +${d.alliance.minRelation} olmalı (şu an ${Math.round(relation)})`, `An alliance needs relations of at least +${d.alliance.minRelation} (now ${Math.round(relation)})`)
                }
                onClick={() => envoy('alliance')}
              >
                {L('İttifak teklif et', 'Offer an alliance')} {relation < d.alliance.minRelation ? L(`(+${d.alliance.minRelation} gerekir)`, `(needs +${d.alliance.minRelation})`) : ''}
              </button>
            )}
            {war && (
              <div className="peace">
                <div className="segmented choices" role="radiogroup" aria-label={L('Barış şartları', 'Peace terms')}>
                  {(Object.keys(TERMS_NAMES) as PeaceTerms['kind'][]).map((k) => (
                    <button key={k} className="btn small" role="radio" aria-checked={terms === k} onClick={() => (setTerms(k), k === 'tribute' && setTermsGold((g) => Math.max(balance.diplomacy.tribute.minGold, Math.min(g, balance.diplomacy.tribute.maxGold))))}>
                      {TERMS_NAMES[k]}
                    </button>
                  ))}
                </div>
                {terms !== 'white' && (
                  <span className="stepper">
                    <button className="btn icon-only" disabled={termsGold <= (terms === 'tribute' ? balance.diplomacy.tribute.minGold : 10)} data-why={L('Daha az istenemez', 'Cannot ask for less')} onClick={() => setTermsGold(Math.max(terms === 'tribute' ? balance.diplomacy.tribute.minGold : 1, termsGold - (terms === 'tribute' ? balance.diplomacy.tribute.step : 50)))} aria-label={L('Azalt', 'Decrease')}>
                      <Icon name="minus" size={16} />
                    </button>
                    <span className="stepper-value">
                      <b>{termsGold}</b> {terms === 'tribute' ? L('altın/saat', 'gold/hour') : L('altın', 'gold')}
                    </span>
                    <button
                      className="btn icon-only"
                      disabled={terms === 'tribute' && termsGold >= balance.diplomacy.tribute.maxGold}
                      data-why={L(`Haraç en fazla saatte ${balance.diplomacy.tribute.maxGold} altın`, `Tribute can be at most ${balance.diplomacy.tribute.maxGold} gold an hour`)}
                      onClick={() => setTermsGold(terms === 'tribute' ? Math.min(balance.diplomacy.tribute.maxGold, termsGold + balance.diplomacy.tribute.step) : termsGold + 50)}
                      aria-label={L('Artır', 'Increase')}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </span>
                )}
                <p className="hint">
                  {terms === 'gold'
                    ? L(`Her ${balance.diplomacy.peace.goldPerScore} altın 1 savaş puanı ister.`, `Every ${balance.diplomacy.peace.goldPerScore} gold costs 1 war score.`)
                    : terms === 'tribute'
                      ? L(
                          `Haraç için en az ${balance.diplomacy.peace.tributeMinScore} savaş puanı gerekir; saatte en fazla ${balance.diplomacy.tribute.maxGold} altın istenebilir.`,
                          `Tribute needs a war score of at least ${balance.diplomacy.peace.tributeMinScore}; at most ${balance.diplomacy.tribute.maxGold} gold an hour can be asked.`,
                        )
                      : terms === 'offer'
                        ? L('Altını sen ödersin; kabul etmeleri kolaylaşır.', 'You pay the gold; that makes them likelier to accept.')
                        : L('Kimse bir şey ödemez.', 'Nobody pays anything.')}{' '}
                  {L(
                    `Savaş puanın ${balance.diplomacy.peace.enforceScore} olursa teklifin kabul edilmek zorundadır.`,
                    `At a war score of ${balance.diplomacy.peace.enforceScore} your offer must be accepted.`,
                  )}
                </p>
                <button className="btn small" disabled={sending('peace') || !!termsWhy} data-why={
                    sending('peace')
                      ? L('Barış elçin zaten yolda', 'Your peace envoy is already on the road')
                      : termsWhy === 'score'
                        ? L('Savaş puanın bu şartlar için yetmiyor', 'Your war score is not enough for these terms')
                        : L('Bir miktar seç', 'Choose an amount')
                  }
                  onClick={() => envoy('peace', { terms: peaceTerms })}
                >
                  {L('Barış teklif et', 'Offer peace')} {termsWhy === 'score' ? L('(savaş puanı yetmiyor)', '(war score too low)') : ''}
                </button>
              </div>
            )}
          </div>
          {travelling.length > 0 && (
            <ul className="places">
              {travelling.map((e) => (
                <li key={e.id}>
                  <Icon name="time" size={16} />
                  <span>
                    <small>
                      {ENVOY_NAMES[e.kind]} ·{' '}
                      {e.status === 'traveling'
                        ? L(`yolda, ${Math.max(0, Math.ceil((Date.parse(e.arrive_at) - now) / 1000))} sn`, `on the road, ${Math.max(0, Math.ceil((Date.parse(e.arrive_at) - now) / 1000))} s`)
                        : L('cevap bekliyor', 'awaiting an answer')}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        </>
      )}
      {part === 'pacts' && (
        <>
        <Section title={L('Anlaşmalar', 'Treaties')} icon="crown">
          <div className="actions">
            {theyPay && (
              <button className="btn small" onClick={() => online.act({ type: 'endTribute', pact: theyPay.id })}>
                {L(`Haracı bağışla (+${d.tribute.release})`, `Waive the tribute (+${d.tribute.release})`)}
              </button>
            )}
            {wePay && (
              <button className="btn small danger" onClick={() => online.act({ type: 'endTribute', pact: wePay.id })}>
                {L(`Haracı kes (${d.tribute.renege} ilişki)`, `Stop paying tribute (${d.tribute.renege} relations)`)}
              </button>
            )}
            {alliance && (
              <button className="btn small danger" onClick={() => online.act({ type: 'breakAlliance', pact: alliance.id })}>
                {L(`İttifakı boz (${d.alliance.break} ilişki)`, `Break the alliance (${d.alliance.break} relations)`)}
              </button>
            )}
            {!war && !ally && (
              <button
                className={confirmWar ? 'btn small danger' : 'btn small'}
                disabled={relation > threshold}
                data-why={L(`Savaş ilanı için ilişki en fazla ${threshold} olmalı (şu an ${Math.round(relation)})`, `Declaring war needs relations of at most ${threshold} (now ${Math.round(relation)})`)}
                onClick={() => (confirmWar ? (setConfirmWar(false), online.act({ type: 'declareWar', to: target.id })) : setConfirmWar(true))}
              >
                <Icon name="swords" size={16} />{' '}
                {confirmWar
                  ? claim
                    ? L('Emin misin? Savaş ilan et', 'Are you sure? Declare war')
                    : L(`Emin misin? Gerekçesiz savaş (herkesle ${d.casusBelli.infamy})`, `Are you sure? War without cause (${d.casusBelli.infamy} with everyone)`)
                  : relation > threshold
                    ? L(`Savaş ilanı (${threshold} gerekir)`, `Declare war (needs ${threshold})`)
                    : L('Savaş ilan et', 'Declare war')}
              </button>
            )}
            {!theyPay && !wePay && !alliance && (war || ally) ? null : null}
          </div>
          {!theyPay && !wePay && !alliance && !war && <p className="hint">{L('Aranızda anlaşma yok.', 'There are no treaties between you.')}</p>}
          {war && (
            <p className="hint">
              {L(
                `Savaştasınız (savaş puanı ${score > 0 ? '+' : ''}${Math.round(score)}). Barışı Elçi bölümünden teklif edebilirsin.`,
                `You are at war (war score ${score > 0 ? '+' : ''}${Math.round(score)}). You can offer peace from the Envoy section.`,
              )}
            </p>
          )}
        </Section>
        </>
      )}
      {part === 'relation' && (
        <>
        <Section title={L('Dış ilişkileri', 'Foreign relations')} icon="banner" aside={L('herkese açık', 'public')}>
          <Stat label={L('Müttefikleri', 'Allies')} value={theirAllies.length ? theirAllies.map((id) => kingdomName(online, id)).join(', ') : L('yok', 'none')} />
          <Stat label={L('Savaşta olduğu', 'At war with')} value={theirWars.length ? theirWars.map((id) => kingdomName(online, id)).join(', ') : L('yok', 'none')} />
          {theirTributes.map((p) => (
            <Stat key={p.id} label={L('Haraç', 'Tribute')} value={L(`${kingdomName(online, p.to_id)} → ${kingdomName(online, p.from_id)} · ${p.gold}/tur`, `${kingdomName(online, p.to_id)} → ${kingdomName(online, p.from_id)} · ${p.gold}/round`)} />
          ))}
          {theirRelations.length > 0 && (
            <ul className="places compact">
              {theirRelations.map((r) => (
                <li key={r.other}>
                  <Dot color={online.kingdoms.find((k) => k.id === r.other)?.color} />
                  <span>
                    <small>{kingdomName(online, r.other)}</small>
                  </span>
                  <RelationBar value={r.value} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        </>
      )}
      {part === 'spies' && (
        <>
        <Section title={L('İstihbarat', 'Intelligence')} icon="eye" aside={intel ? L('casus ağından', 'from the spy network') : undefined}>
          {intel === undefined ? (
            <button className="btn small" onClick={() => online.loadIntel(target.id)}>
              {L('Casus raporunu getir', 'Fetch the spy report')}
            </button>
          ) : intel === null ? (
            <p className="hint">{L('Rapor alınamadı.', 'The report could not be fetched.')}</p>
          ) : (
            <>
              {(Object.keys(TOPIC_NAMES) as SpyTopic[]).map((t) => (
                <span key={t} className="sign">
                  <span>{TOPIC_NAMES[t]}</span>
                  <Meter value={intel.strength[t] / 100} tone="water" label={L(`${TOPIC_NAMES[t]} ağı`, `${TOPIC_NAMES[t]} network`)} segments={10} />
                  <small>{L(`%${intel.strength[t]}`, `${intel.strength[t]}%`)}</small>
                </span>
              ))}
              {intel.strength.stores >= balance.espionage.minStrength && (
                <>
                  {(['gold', 'food', 'materials', 'arms'] as const).map((r) => (
                    <Range key={r} label={RESOURCE_NAMES[r]} value={intel.stores[r]} />
                  ))}
                </>
              )}
              {intel.strength.army >= balance.espionage.minStrength && (
                <>
                  {intel.army.units &&
                    UNITS.map((u) => (
                      <Range key={u} label={`${UNIT_NAMES[u]}`} value={intel.army.units![u]} />
                    ))}
                  <Range label={L('Garnizon', 'Garrison')} value={intel.army.garrison} />
                  <Range label={L('Sahadaki asker', 'Soldiers in the field')} value={intel.army.field} />
                  <Range label={L('Savaş gücü', 'Military might')} value={intel.army.might} />
                  <Range label={L('Halkın mutluluğu', "The people's happiness")} value={intel.army.happiness} unit="%" />
                </>
              )}
              {intel.diplomacy && (
                <>
                  {intel.diplomacy.envoys.map((e, i) => (
                    <Stat key={i} label={L('Elçisi', 'Their envoy')} value={`${e.to} · ${ENVOY_NAMES[e.kind as Envoy['kind']] ?? e.kind}`} />
                  ))}
                  <Stat
                    label={L('Casusları', 'Their spies')}
                    value={
                      intel.diplomacy.spies
                        ? intel.diplomacy.spies.map((s) => `${s.target} (${TOPIC_NAMES[s.topic as SpyTopic]})`).join(', ') || L('yok', 'none')
                        : L(`${intel.diplomacy.spyCount} casus (ağ %50 olunca hedefleri görünür)`, `${intel.diplomacy.spyCount} spy${intel.diplomacy.spyCount === 1 ? '' : 's'} (their targets show at 50% network)`)
                    }
                  />
                </>
              )}
              {Object.values(intel.strength).every((s) => s < balance.espionage.minStrength) && <p className="hint">{L('Ağın henüz zayıf; casusların orada kaldıkça rapor netleşir.', 'Your network is still weak; the report sharpens the longer your spies stay.')}</p>}
              <button className="btn small" onClick={() => online.loadIntel(target.id)}>
                {L('Raporu yenile', 'Refresh the report')}
              </button>
            </>
          )}
          <ul className="spy-topics">
            {(Object.keys(TOPIC_NAMES) as SpyTopic[]).map((t) => {
              // The player's spy already at work on this topic (one per kingdom and topic).
              const there = online.missions.filter((m) => m.owner_id === me && m.target_id === target.id && m.topic === t && !m.ended_at).length
              return (
                <li key={t}>
                  <span>
                    <b>{TOPIC_NAMES[t]}</b>
                    <small>{there > 0 ? L(`ağ %${intel ? Math.round(intel.strength[t] ?? 0) : '?'}`, `network ${intel ? Math.round(intel.strength[t] ?? 0) : '?'}%`) : L('casusun yok', 'no spy of yours')}</small>
                  </span>
                  {there > 0 ? (
                    <span className="chip up">{L('Casusun orada', 'Your spy is there')}</span>
                  ) : (
                    <button className="btn small" disabled={spiesHome < 1} data-why={L('Evde casusun yok; casus evi zamanla yetiştirir', 'No spy at home; the spy house trains them over time')} onClick={() => online.act({ type: 'spy', target: target.id, topic: t })}>
                      <Icon name="eye" size={16} /> {L('Casus gönder', 'Send a spy')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="hint">{L('Bir lordun her konusuna bir casus gönderilebilir.', 'You can send one spy to each of a lord\'s topics.')}</p>
          {spiesHome < 1 && <p className="hint">{L('Evde casusun yok. Casus evi zamanla casus yetiştirir.', 'No spy at home. The spy house trains spies over time.')}</p>}
        </Section>
        <Section title={L('Casus operasyonları', 'Spy operations')} icon="eye" aside={intel ? L(`en güçlü ağın %${Math.round(best)}`, `strongest network ${Math.round(best)}%`) : L('önce raporu getir', 'fetch the report first')}>
          {outcome && <p className="alert">{outcome}</p>}
          <p className="hint">
            {L(
              'Operasyonlar oradaki en güçlü ağından yapılır ve başarılı da olsa başarısız da olsa o ağdan istediği kadar puan harcar; ağ kalan güçten yeniden büyür. Başarısız olan operasyon ayrıca casusunu kaybettirir ve kimin yaptığını ortaya çıkarır.',
              'Operations run from your strongest network there and, success or failure, spend as many points of it as they need; the network grows back from what is left. A failed operation also costs you the spy and reveals who was behind it.',
            )}
          </p>
          <ul className="places">
            {OPERATIONS.map((op) => {
              const spec = operationSpec(op)
              const noPrison = op === 'kidnap' && !kingdom.buildings.some((b) => b.kind === 'prison' && b.doneAt <= now)
              const noTown = op === 'townRevolt' && !picked
              const blocked = !intel || best < spec.minStrength || (op === 'kidnap' && !target.queen) || noPrison || noTown || kingdom.stock.gold < (spec.cost.gold ?? 0)
              return (
                <li key={op}>
                  <Icon name={op === 'kidnap' ? 'crown' : op === 'revolt' || op === 'townRevolt' ? 'unhappy' : 'warn'} size={24} />
                  <span>
                    <b>{OPERATION_NAMES[op]}</b>
                    <small>
                      {OPERATION_NOTES[op]} ·{' '}
                      {L(
                        `ağ %${spec.minStrength} ister, ağdan ${Math.round(operationNetworkCost(op))} puan harcar · ${spec.cost.gold} altın`,
                        `needs ${spec.minStrength}% network, spends ${Math.round(operationNetworkCost(op))} points of it · ${spec.cost.gold} gold`,
                      )}
                      {op === 'kidnap' && !target.queen ? L(' · kraliçeleri yok', ' · they have no queen') : ''}
                      {noPrison ? L(' · önce hapishane kur', ' · build a prison first') : ''}
                      {noTown ? L(' · elinde kasaba yok', ' · they hold no town') : ''}
                    </small>
                    {op === 'townRevolt' && theirTowns.length > 1 && (
                      <PixelSelect small value={picked?.id} onChange={setTownPick} options={theirTowns.map((t) => ({ value: t.id, label: t.name }))} aria-label={L('Kışkırtılacak kasaba', 'Town to stir up')} />
                    )}
                    {op === 'townRevolt' && theirTowns.length === 1 && <small>{L('Kasaba', 'Town')}: {picked!.name}</small>}
                    <small className={intel?.chances && best >= spec.minStrength ? (intel.chances[op] >= 50 ? 'up' : 'down') : undefined}>
                      {!intel
                        ? L('Başarı şansı: önce raporu getir', 'Chance of success: fetch the report first')
                        : !intel.chances
                          ? L('Başarı şansı: raporu yenile', 'Chance of success: refresh the report')
                          : best < spec.minStrength
                            ? L(`Başarı şansı: ağ %${spec.minStrength} olunca`, `Chance of success: once the network reaches ${spec.minStrength}%`)
                            : L(`Başarı şansı ~%${intel.chances[op]}`, `Chance of success ~${intel.chances[op]}%`)}
                    </small>
                  </span>
                  <button
                    className="btn small"
                    disabled={blocked}
                    data-why={
                      !intel
                        ? L('Önce casus raporunu getir', 'Fetch the spy report first')
                        : best < spec.minStrength
                          ? L(`Ağ en az %${spec.minStrength} olmalı (en güçlü ağın %${Math.round(best)})`, `The network must be at least ${spec.minStrength}% (your strongest is ${Math.round(best)}%)`)
                          : op === 'kidnap' && !target.queen
                            ? L('Kraliçeleri yok', 'They have no queen')
                            : noPrison
                              ? L('Önce hapishane kur (2. seviye saray)', 'Build a prison first (level 2 palace)')
                              : noTown
                                ? L('Elinde kasaba yok', 'They hold no town')
                                : L(`Yeterli altın yok (eksik: ${Math.ceil((spec.cost.gold ?? 0) - kingdom.stock.gold)})`, `Not enough gold (short: ${Math.ceil((spec.cost.gold ?? 0) - kingdom.stock.gold)})`)
                    }
                    onClick={() =>
                      online.act<{ success: boolean }>({ type: 'operation', target: target.id, op, ...(op === 'townRevolt' && picked && { town: picked.id }) }).then((r) => {
                        if (r) setOutcome(r.success ? L(`${OPERATION_NAMES[op]}: başarılı.`, `${OPERATION_NAMES[op]}: success.`) : L(`${OPERATION_NAMES[op]}: başarısız, casusun yakalandı.`, `${OPERATION_NAMES[op]}: failed, your spy was caught.`))
                        online.loadIntel(target.id)
                      })
                    }
                  >
                    {L('Dene', 'Attempt')}
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
        </>
      )}
    </>
  )
}

// The spies: at home and away, their missions with how strong each network has grown (as the last report measured it),
// and the latest news of spies. `detail`: the report opens the lord's page (the diplomacy tab), not only the figures.
export function SpyPanel({ data, online, detail = true }: { data: HudData; online: Online; detail?: boolean }) {
  const { kingdom, now } = data
  const capacity = spyCapacity(kingdom, now)
  const active = online.missions.filter((m) => !m.ended_at && (!m.caught_at || Date.parse(m.caught_at) > now))
  const ended = online.missions.filter((m) => m.ended_at).slice(0, 6)
  // The envoy's news of spies (caught, ours or theirs; operations foiled), newest first.
  const news = data.journal.entries.filter((e) => e.icon === 'eye').slice(0, 5)
  if (capacity === 0 && active.length === 0) {
    return (
      <Section title={L('Casusluk', 'Espionage')} icon="eye">
        <Placeholder icon="lock" title={L('Casus evin yok', 'You have no spy house')}>
          {L(
            'Sarayı 2. seviyeye yükselt ve casus evi kur. Casus evi zamanla casus yetiştirir; casusları bir lorda bir konuda gönderirsin (hammadde, ordu, diplomasi). Evde kalan casuslar karşı casusluk yapar.',
            'Raise the palace to level 2 and build a spy house. It trains spies over time; you send them to a lord on one topic (stores, army, diplomacy). Spies kept at home work as counter-espionage.',
          )}
        </Placeholder>
      </Section>
    )
  }
  const next = kingdom.nextSpyAt && (kingdom.spies ?? 0) + (kingdom.spiesAway ?? 0) < capacity ? kingdom.nextSpyAt - now : null
  return (
    <>
      <Section title={L('Casuslar', 'Spies')} icon="eye" aside={L(`kapasite ${capacity}`, `capacity ${capacity}`)}>
        <Stat label={L('Evde (karşı casusluk)', 'At home (counter-espionage)')} value={kingdom.spies ?? 0} />
        <Stat label={L('Görevde', 'On missions')} value={kingdom.spiesAway ?? 0} />
        <SpyHouseEffects kingdom={kingdom} />
        {next !== null && next > 0 && (
          <Stat label={L('Sıradaki casus', 'Next spy')} value={L(`${Math.ceil(next / 1000)} sn`, `${Math.ceil(next / 1000)} s`)} note={L(`${balance.espionage.spyCost.gold} altın`, `${balance.espionage.spyCost.gold} gold`)} />
        )}
        <p className="hint">
          {L(
            `Bir lorda casus göndermek için ${detail ? '' : 'Diplomasi sekmesindeki '}Lordlar listesinden lordu seç.`,
            `To send a spy to a lord, pick the lord from the Lords list${detail ? '' : ' on the Diplomacy tab'}.`,
          )}
        </p>
      </Section>
      <Section title={L('Görevler', 'Missions')} icon="scroll" aside={`${active.length}`}>
        {active.length === 0 && <p className="hint">{L('Görevde casus yok.', 'No spies on missions.')}</p>}
        <ul className="places">
          {active.map((m) => (
            <li key={m.id}>
              <Icon name="eye" size={24} />
              <span>
                <b>
                  {kingdomName(online, m.target_id)} · {TOPIC_NAMES[m.topic]}
                </b>
                <small>{L(`${Math.floor((now - Date.parse(m.started_at)) / 60000)} dakikadır orada`, `there for ${Math.floor((now - Date.parse(m.started_at)) / 60000)} min`)}</small>
                {online.intel[m.target_id] ? (
                  <>
                    <small>
                      {L(
                        `Ağ %${Math.round(online.intel[m.target_id]!.strength[m.topic])} (son rapora göre)`,
                        `Network ${Math.round(online.intel[m.target_id]!.strength[m.topic])}% (per the last report)`,
                      )}
                    </small>
                    <Meter value={online.intel[m.target_id]!.strength[m.topic] / 100} tone="water" label={L(`${TOPIC_NAMES[m.topic]} ağı`, `${TOPIC_NAMES[m.topic]} network`)} segments={10} />
                  </>
                ) : (
                  <small>{L('Ağın gücü için raporu getir.', "Fetch the report for the network's strength.")}</small>
                )}
              </span>
              <button className="btn small" onClick={() => (detail && online.setFocus(m.target_id), online.loadIntel(m.target_id))}>
                {detail ? L('Rapor', 'Report') : L('Ölç', 'Measure')}
              </button>
              <button className="btn small" onClick={() => online.act({ type: 'recall', mission: m.id })}>
                {L('Geri çağır', 'Recall')}
              </button>
            </li>
          ))}
        </ul>
        {ended.length > 0 && (
          <ul className="places compact">
            {ended.map((m) => (
              <li key={m.id}>
                <span>
                  <small>
                    {kingdomName(online, m.target_id)} · {TOPIC_NAMES[m.topic]} · {m.end_reason === 'caught' ? L('yakalandı', 'caught') : L('geri çağrıldı', 'recalled')}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {news.length > 0 && (
        <Section title={L('Casus haberleri', 'Spy news')} icon="scroll" aside={L('günlükten', 'from the journal')}>
          <ul className="places compact">
            {news.map((e) => (
              <li key={e.id}>
                <span>
                  <b>{e.title}</b>
                  {e.text && <small>{e.text}</small>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

// Ways to sour a relation on purpose: an envoy with insults, and soldiers sent to rob the other's merchant.
function Hostility({ data, online, target }: { data: HudData; online: Online; target: KingdomInfo }) {
  const { now, kingdom } = data
  const [outcome, setOutcome] = useState<string | null>(null)
  const me = online.me
  const r = d.raid
  const towers = towersNear(target.buildings ?? [], now)
  const chance = raidChance(towers)
  const raidReady = (kingdom.lastRaidAt ?? 0) + r.cooldownSeconds * 1000
  const insulting = online.envoys.some((e) => e.from_id === me && e.to_id === target.id && e.kind === 'insult' && e.status === 'traveling')
  const ally = allied(online.pacts, me, target.id)
  const raid = async () => {
    const res = await online.act<{ success: boolean; lost: number; loot: { good: string; units: number } | null }>({ type: 'raid', target: target.id })
    if (!res) return
    setOutcome(
      res.success
        ? (res.loot?.units ?? 0) > 0
          ? L(
              `Yağma başarılı: ${res.loot!.units} ${RESOURCE_NAMES[res.loot!.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} getirildi, ${res.lost} asker kaybedildi. Ticaret noktaları harap.`,
              `Raid successful: ${res.loot!.units} ${RESOURCE_NAMES[res.loot!.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} brought back, ${res.lost} soldier${res.lost === 1 ? '' : 's'} lost. Their trading post lies in ruins.`,
            )
          : L(
              `Yağma başarılı ama tüccarın taşıyacak malı yoktu (depoları boştu); ${res.lost} asker kaybedildi. Ticaret noktaları yine de harap.`,
              `Raid successful, but the merchant had nothing to carry (their stores were empty); ${res.lost} soldier${res.lost === 1 ? '' : 's'} lost. Their trading post lies in ruins all the same.`,
            )
        : L(`Yağmacılar püskürtüldü: ${res.lost} asker kaybedildi.`, `The raiders were driven off: ${res.lost} soldier${res.lost === 1 ? '' : 's'} lost.`),
    )
  }
  return (
    <Section title={L('Düşmanlık', 'Hostility')} icon="swords">
      <div className="actions">
        <button className="btn small danger" disabled={insulting} data-why={L('Hakaret elçin zaten yolda', 'Your envoy with the insult is already on the road')} onClick={() => online.act({ type: 'envoy', to: target.id, kind: 'insult' })}>
          {L(`Hakaret et (${d.insult.relation} ilişki)`, `Insult (${d.insult.relation} relations)`)}
        </button>
        <button
          className="btn small danger"
          disabled={ally || (kingdom.soldiers ?? 0) < r.soldiers || raidReady > now || !(target.buildings ?? []).some((b) => b.kind === 'tradePost')}
          data-why={
            ally
              ? L('Müttefikin yağmalanamaz', 'You cannot raid an ally')
              : (kingdom.soldiers ?? 0) < r.soldiers
                ? L(`Garnizonda en az ${r.soldiers} asker olmalı (${kingdom.soldiers ?? 0} var)`, `The garrison needs at least ${r.soldiers} soldiers (you have ${kingdom.soldiers ?? 0})`)
                : raidReady > now
                  ? waitWhy(raidReady - now)
                  : L('Ticaret noktaları yok', 'They have no trading post')
          }
          onClick={raid}
        >
          {L(`Ticaret yolunu yağmala · ${r.soldiers} asker · şans %${Math.round(chance * 100)}`, `Raid the trade route · ${r.soldiers} soldiers · ${Math.round(chance * 100)}% chance`)}
        </button>
      </div>
      <p className="hint">
        {L(
          `Hakaret: elçin gider, ilişkiniz ${d.insult.relation} düşer ve onlar sana karşı savaş gerekçesi kazanır. Yağma: garnizondan ${r.soldiers} asker tüccarlarını basar; başarırsa sattıkları maldan yüklü bir pay getirir ve ticaret noktaları onarılana kadar satış yapamaz. Ticaret noktasının yakınındaki gözcü kuleleri (${towers}) şansı düşürür. Her durumda asker kaybedersin, ilişki ${r.relation} düşer ve onlar savaş gerekçesi kazanır.`,
          `Insult: your envoy goes, your relations fall by ${Math.abs(d.insult.relation)} and they gain a casus belli against you. Raid: ${r.soldiers} soldiers from the garrison fall on their merchants; if it works they bring back a hefty share of the goods sold, and the trading post cannot sell until repaired. Watchtowers near the trading post (${towers}) lower the chance. Either way you lose soldiers, relations fall by ${Math.abs(r.relation)} and they gain a casus belli.`,
        )}
      </p>
      {outcome && <p className="alert">{outcome}</p>}
    </Section>
  )
}

// What the spy house's level does (CLAUDE.md §9.7): our networks abroad grow faster, and others' grow more slowly here
// and their spies are caught sooner. The next level's figures beside the present ones.
function SpyHouseEffects({ kingdom }: { kingdom: Kingdom }) {
  const house = kingdom.buildings.find((b) => b.kind === 'spyHouse')
  if (!house) return null
  const e = balance.espionage
  const level = house.level ?? 1
  const top = level < e.capacityByLevel.length
  const dec = (v: number) => L(v.toFixed(2).replace('.', ','), v.toFixed(2))
  const speed = (l: number) => 1 + (l - 1) * e.networkSpeedPerLevel
  const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
  return (
    <>
      <Stat
        label={L('Ağ kurma hızın', 'Network building speed')}
        value={`×${dec(speed(level))}`}
        note={top ? L(`${level + 1}. sv: ×${dec(speed(level + 1))}`, `Lv. ${level + 1}: ×${dec(speed(level + 1))}`) : L('en yüksek seviye', 'highest level')}
      />
      <Stat
        label={L('Casus evinin karşı casusluğu', "The spy house's counter-espionage")}
        value={`+${dec(level * e.counterPerLevel)}`}
        note={top ? L(`${level + 1}. sv: +${dec((level + 1) * e.counterPerLevel)}`, `Lv. ${level + 1}: +${dec((level + 1) * e.counterPerLevel)}`) : L('en yüksek seviye', 'highest level')}
      />
      <p className="hint">
        {L(
          `Karşı casusluk, başkalarının sende ağ kurmasını yavaşlatır (her 1 puan kurulma süresine ${pct(1)} ekler), casuslarını daha çabuk yakalatır ve operasyonlarının şansını puan başına ${pct(e.operations.counterPenalty)} düşürür. Evde bekleyen her casus ${String(e.counterPerSpy).replace('.', ',')} puan katar.`,
          `Counter-espionage slows others building networks in your lands (each point adds ${pct(1)} to the time it takes), gets their spies caught sooner and lowers their operations' chances by ${pct(e.operations.counterPenalty)} a point. Each spy waiting at home adds ${e.counterPerSpy} points.`,
        )}
      </p>
    </>
  )
}

import {
  OPERATIONS,
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
import type { BattleRecord, Envoy, Operation, Pact, PeaceTerms, SpyTopic } from '@game/shared'
import { useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { INN_KIND_NAMES, innInfo } from '../../game/innInfo'
import { innLook, isCaravanserai } from '../../game/innSprites'
import type { Estimate } from '../../net/online'
import { Icon } from '../icons'
import { RESOURCE_NAMES, UNIT_NAMES } from '../names'
import type { HudData } from './tabs'
import type { KingdomInfo, Online } from './online'
import { kingdomName, lastSeen } from './online'
import { Meter, Placeholder, Section, SpriteView, Stat, fmt } from './primitives'

// The diplomacy tab (CLAUDE.md §9.7): the kingdoms of the lobby and the player's standing with each, a kingdom
// looked at closely (EU4-like: its relations, alliances and wars, and what the spies can tell), and the spies.

const d = balance.diplomacy
export const swatchOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'
const signedInt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`
const relationTone = (v: number) => (v >= d.alliance.minRelation ? 'up' : v <= d.war.maxRelation ? 'down' : 'gold')

export const ENVOY_NAMES: Record<Envoy['kind'], string> = {
  improve: 'İlişki geliştirme',
  gift: 'Hediye',
  tribute: 'Haraç isteği',
  alliance: 'İttifak teklifi',
  peace: 'Barış teklifi',
  insult: 'Hakaret',
}
export const TOPIC_NAMES: Record<SpyTopic, string> = { stores: 'Hammadde', army: 'Ordu', diplomacy: 'Diplomasi' }
export const OPERATION_NAMES: Record<Operation, string> = {
  burn: 'Depoları yak',
  delay: 'İnşaatları geciktir',
  kidnap: 'Kraliçeyi kaçır',
  revolt: 'İsyan kışkırt',
}
const OPERATION_NOTES: Record<Operation, string> = {
  burn: 'Yemek ve yapı malzemesinin dörtte biri yanar',
  delay: 'Süren inşaatlar uzar',
  kidnap: 'Kraliçe senin elinde kalır; halkı yasa boğulur, fidye ister',
  revolt: 'On dakika üretimi yarıya iner, halk huzursuzlanır',
}
export const CLAIM_NAMES: Record<string, string> = {
  spy: 'casus yakalandı',
  tribute: 'haraç reddedildi',
  renege: 'haraç kesildi',
  alliance: 'ittifak bozuldu',
  kidnap: 'kraliçe kaçırıldı',
  sabotage: 'sabotaj',
  insult: 'hakarete uğradı',
  raid: 'ticaret yolu yağmalandı',
}
export const TERMS_NAMES: Record<PeaceTerms['kind'], string> = {
  white: 'Beyaz barış',
  gold: 'Altın iste',
  tribute: 'Haraç iste',
  offer: 'Altın öde',
}
export const describeTerms = (t: PeaceTerms | null | undefined) =>
  !t || t.kind === 'white'
    ? 'beyaz barış (kimse bir şey ödemez)'
    : t.kind === 'gold'
      ? `onlara ${t.gold} altın ödemen karşılığında`
      : t.kind === 'tribute'
        ? `onlara her turda ${t.gold} altın haraç vermen karşılığında`
        : `sana ${t.gold} altın vermeleri karşılığında`

export function Dot({ color }: { color: string | null | undefined }) {
  return <i className="kingdom-dot" style={{ background: swatchOf(color) }} aria-hidden />
}

function RelationBar({ value }: { value: number }) {
  return (
    <span className="relation">
      <Meter value={(value + 100) / 200} tone={relationTone(value)} label="İlişki" segments={10} />
      <b className={relationTone(value) === 'gold' ? undefined : relationTone(value)}>{signedInt(value)}</b>
    </span>
  )
}

const stateChips = (online: Online, id: number) => {
  const chips: { label: string; tone?: 'up' | 'down' }[] = []
  if (allied(online.pacts, online.me, id)) chips.push({ label: 'Müttefik', tone: 'up' })
  if (atWar(online.pacts, online.me, id)) chips.push({ label: 'Savaşta', tone: 'down' })
  if (tributeBetween(online.pacts, online.me, id)) chips.push({ label: 'Haraç veriyor' })
  if (tributeBetween(online.pacts, id, online.me)) chips.push({ label: 'Haraç alıyor' })
  return chips
}

export function DiplomacyTab(data: HudData) {
  const { online } = data
  const [view, setView] = useState<'kingdoms' | 'spies'>('kingdoms')
  if (!online) return null
  const focus = online.kingdoms.find((k) => k.id === online.focus && k.id !== online.me)
  if (focus) return <KingdomDetail data={data} online={online} target={focus} />
  return (
    <>
      <div className="segmented" role="tablist">
        <button className="btn small" role="tab" aria-selected={view === 'kingdoms'} onClick={() => setView('kingdoms')}>
          <Icon name="banner" size={16} /> Krallıklar
        </button>
        <button className="btn small" role="tab" aria-selected={view === 'spies'} onClick={() => setView('spies')}>
          <Icon name="eye" size={16} /> Casusluk
        </button>
      </div>
      {view === 'kingdoms' ? <KingdomList data={data} online={online} /> : <Spies data={data} online={online} />}
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
          <b>{k.name}</b>
          <small>
            {k.username ?? '—'} · {k.palace}. seviye saray{k.queen ? ' · kraliçe' : ''}
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
        <RelationBar value={relationBetween(online.relations, online.me, k.id, now)} />
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
      <Section title="Müttefikler" icon="shield" aside={`${allies.length}`}>
        {allies.length === 0 ? (
          <p className="hint">Müttefikin yok. İttifak için ilişkin en az +{d.alliance.minRelation} olmalı.</p>
        ) : (
          <ul className="places">{allies.map(row)}</ul>
        )}
      </Section>
      <Section title="Krallıklar" icon="banner" aside={`${rest.length}`}>
        {others.length === 0 ? (
          <Placeholder icon="banner" title="Lobide başka krallık yok">
            Biri katılınca burada görünecek.
          </Placeholder>
        ) : (
          <ul className="places">{rest.map(row)}</ul>
        )}
      </Section>
      <Section title="Tarafsız hanlar" icon="inn" aside="ordular burada moral toplar">
        <ul className="places">
          {inns.map(({ p, index, distance }) => {
            const info = innInfo(world, index, isCaravanserai(world, p))
            return (
            <li key={`${p.x},${p.y}`}>
              <SpriteView sprite={innLook(world, p).sprite} scale={0.25} />
              <span>
                <b>{info.name}</b>
                <small>
                  {INN_KIND_NAMES[info.kind]} · {distance} karo uzakta
                </small>
              </span>
              <button className="btn icon-only" onClick={() => onShow({ x: p.x + 1, y: p.y + 1 })} aria-label="Haritada göster">
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
    <Section title="Bekleyen teklifler" icon="scroll" aside={`${envoys.length}`}>
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
                  ? `Her turda ${e.gold} altın istiyor. Reddetmek ilişkiyi ${-d.tribute.reject} düşürür ve onlara savaş gerekçesi verir.`
                  : e.kind === 'alliance'
                    ? 'Müttefik olmak istiyor.'
                    : `Barış: ${describeTerms(e.terms)}.`}
              </small>
            </span>
            <button className="btn small" onClick={() => online.act({ type: 'respond', envoy: e.id, accept: true })}>
              Kabul
            </button>
            <button className="btn small danger" onClick={() => online.act({ type: 'respond', envoy: e.id, accept: false })}>
              Ret
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Range({ label, value, unit }: { label: string; value: Estimate | null | undefined; unit?: string }) {
  return <Stat label={label} value={value ? `${fmt(value.lo)}–${fmt(value.hi)}${unit ?? ''}` : '?'} />
}

function KingdomDetail({ data, online, target }: { data: HudData; online: Online; target: KingdomInfo }) {
  const { now, kingdom } = data
  const [gift, setGift] = useState(50)
  const [tribute, setTribute] = useState(5)
  const [confirmWar, setConfirmWar] = useState(false)
  const [terms, setTerms] = useState<PeaceTerms['kind']>('white')
  const [termsGold, setTermsGold] = useState(100)
  const [outcome, setOutcome] = useState<string | null>(null)
  const me = online.me
  const relation = relationBetween(online.relations, me, target.id, now)
  // Enemies elsewhere make the player's courtesies count for less.
  const standing = reputation(relationsOf(online.relations, me, online.kingdoms.map((k) => k.id), now))
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
    .map((r) => ({ other: r.a === target.id ? r.b : r.a, value: relationAt(r.value, Date.parse(r.at), now) }))
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
  return (
    <>
      <button className="btn small back" onClick={() => online.setFocus(null)}>
        ← Krallıklar
      </button>
      <div className="feature kingdom-head">
        <Dot color={target.color} />
        <div>
          <b>{target.name}</b>
          <p className="hint">
            {target.username ?? '—'} · {target.palace}. seviye saray{target.queen ? ' · kraliçesi var' : ''} · {lastSeen(target.seenAt, now)}
          </p>
        </div>
        <button className="btn icon-only" onClick={() => data.onShow(target.site)} aria-label="Haritada göster">
          <Icon name="pin" size={16} />
        </button>
      </div>
      <Section title="Seninle ilişkisi" icon="banner">
        <RelationBar value={relation} />
        {(target.shieldUntil ?? 0) > now && (
          <p className="hint">
            <Icon name="shield" size={16} /> Yakın zamanda kuşatıldı: sonraki kuşatmaya {Math.ceil(((target.shieldUntil ?? 0) - now) / 60000)} dk var.
          </p>
        )}
        {warPact && (
          <div className="sign">
            <span>Savaş puanı</span>
            <Meter value={(score + 100) / 200} tone={score > 0 ? 'up' : score < 0 ? 'down' : 'gold'} label="Savaş puanı" segments={10} />
            <b className={score > 0 ? 'up' : score < 0 ? 'down' : undefined}>{signedInt(score)}</b>
          </div>
        )}
        {myClaims.map((c) => (
          <p key={c.expires_at + c.reason} className="hint">
            <Icon name="swords" size={16} /> Savaş gerekçen var: {CLAIM_NAMES[c.reason] ?? c.reason} ({Math.ceil((Date.parse(c.expires_at) - now) / 60000)} dk)
          </p>
        ))}
        {theirClaim && <p className="hint">Onların da sana karşı bir savaş gerekçesi var.</p>}
        <span className="chips">
          {stateChips(online, target.id).map((c) => (
            <span key={c.label} className={`chip ${c.tone ?? ''}`}>
              {c.label}
            </span>
          ))}
        </span>
        <p className="hint">
          İttifak için en az +{d.alliance.minRelation} gerekir. Savaş ilanı için ilişki en fazla {d.war.maxRelation} olmalı; savaş gerekçen varsa{' '}
          {d.casusBelli.maxRelation} yeter. Gerekçesiz savaş açan, diğer bütün krallıklarla {d.casusBelli.infamy} ilişki kaybeder.
        </p>
      </Section>
      <Hostility data={data} online={online} target={target} />
      <Section title="Elçi gönder" icon="scroll" aside={`${d.envoySeconds} sn yol`}>
        {war && <p className="hint">Savaştayken elçiler yalnızca barış götürür.</p>}
        {standing < 0.995 && (
          <p className="hint">
            <Icon name="warn" size={16} /> İtibarın %{Math.round(standing * 100)}: başka krallıklarla aran kötü olduğu için ilişki geliştirme ve hediyeler daha az
            etkili.
          </p>
        )}
        {relation < 0 && (
          <p className="hint">Sana kötü gözle baktıkları için buradaki casus ağın daha yavaş kurulur ve casusların daha çabuk yakalanır.</p>
        )}
        <div className="actions">
          {!war && (
          <button
            className="btn small"
            disabled={sending('improve') || cooling > 0 || kingdom.stock.gold < d.improve.cost.gold}
            onClick={() => envoy('improve')}
            title={cooling > 0 ? `${Math.ceil(cooling / 1000)} sn sonra yeniden` : undefined}
          >
            İlişki geliştir · {d.improve.cost.gold} altın (+{Math.round(d.improve.gain * standing)})
          </button>
          )}
          {!war && (
          <span className="stepper">
            <button className="btn icon-only" disabled={gift <= d.gift.minGold} onClick={() => setGift(Math.max(d.gift.minGold, gift - 10))} aria-label="Azalt">
              <Icon name="minus" size={16} />
            </button>
            <span className="stepper-value">
              <b>{gift}</b> altın
            </span>
            <button className="btn icon-only" onClick={() => setGift(gift + 10)} aria-label="Artır">
              <Icon name="plus" size={16} />
            </button>
            <button className="btn small" disabled={kingdom.stock.gold < gift || sending('gift')} onClick={() => envoy('gift', { gold: gift })}>
              Hediye (+{Math.min(d.gift.maxGain, Math.round(gift * d.gift.relationPerGold))})
            </button>
          </span>
          )}
          {!war && !ally && !theyPay && (
            <span className="stepper">
              <button className="btn icon-only" disabled={tribute <= d.tribute.minGold} onClick={() => setTribute(tribute - 1)} aria-label="Azalt">
                <Icon name="minus" size={16} />
              </button>
              <span className="stepper-value">
                <b>{tribute}</b> altın/tur
              </span>
              <button className="btn icon-only" disabled={tribute >= d.tribute.maxGold} onClick={() => setTribute(tribute + 1)} aria-label="Artır">
                <Icon name="plus" size={16} />
              </button>
              <button className="btn small" disabled={sending('tribute')} onClick={() => envoy('tribute', { gold: tribute })}>
                Haraç iste
              </button>
            </span>
          )}
          {!ally && !war && (
            <button className="btn small" disabled={relation < d.alliance.minRelation || sending('alliance')} onClick={() => envoy('alliance')}>
              İttifak teklif et {relation < d.alliance.minRelation ? `(+${d.alliance.minRelation} gerekir)` : ''}
            </button>
          )}
          {war && (
            <div className="peace">
              <div className="segmented" role="radiogroup" aria-label="Barış şartları">
                {(Object.keys(TERMS_NAMES) as PeaceTerms['kind'][]).map((k) => (
                  <button key={k} className="btn small" role="radio" aria-checked={terms === k} onClick={() => setTerms(k)}>
                    {TERMS_NAMES[k]}
                  </button>
                ))}
              </div>
              {terms !== 'white' && (
                <span className="stepper">
                  <button className="btn icon-only" disabled={termsGold <= (terms === 'tribute' ? 1 : 10)} onClick={() => setTermsGold(Math.max(1, termsGold - (terms === 'tribute' ? 1 : 50)))} aria-label="Azalt">
                    <Icon name="minus" size={16} />
                  </button>
                  <span className="stepper-value">
                    <b>{termsGold}</b> {terms === 'tribute' ? 'altın/tur' : 'altın'}
                  </span>
                  <button className="btn icon-only" onClick={() => setTermsGold(termsGold + (terms === 'tribute' ? 1 : 50))} aria-label="Artır">
                    <Icon name="plus" size={16} />
                  </button>
                </span>
              )}
              <p className="hint">
                {terms === 'gold'
                  ? `Her ${balance.diplomacy.peace.goldPerScore} altın 1 savaş puanı ister.`
                  : terms === 'tribute'
                    ? `Haraç için en az ${balance.diplomacy.peace.tributeMinScore} savaş puanı gerekir.`
                    : terms === 'offer'
                      ? 'Altını sen ödersin; kabul etmeleri kolaylaşır.'
                      : 'Kimse bir şey ödemez.'}{' '}
                Savaş puanın {balance.diplomacy.peace.enforceScore} olursa teklifin kabul edilmek zorundadır.
              </p>
              <button className="btn small" disabled={sending('peace') || !!termsWhy} onClick={() => envoy('peace', { terms: peaceTerms })}>
                Barış teklif et {termsWhy === 'score' ? '(savaş puanı yetmiyor)' : ''}
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
                    {ENVOY_NAMES[e.kind]} · {e.status === 'traveling' ? `yolda, ${Math.max(0, Math.ceil((Date.parse(e.arrive_at) - now) / 1000))} sn` : 'cevap bekliyor'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Anlaşmalar" icon="crown">
        <div className="actions">
          {theyPay && (
            <button className="btn small" onClick={() => online.act({ type: 'endTribute', pact: theyPay.id })}>
              Haracı bağışla (+{d.tribute.release})
            </button>
          )}
          {wePay && (
            <button className="btn small danger" onClick={() => online.act({ type: 'endTribute', pact: wePay.id })}>
              Haracı kes ({d.tribute.renege} ilişki)
            </button>
          )}
          {alliance && (
            <button className="btn small danger" onClick={() => online.act({ type: 'breakAlliance', pact: alliance.id })}>
              İttifakı boz ({d.alliance.break} ilişki)
            </button>
          )}
          {!war && !ally && (
            <button
              className={confirmWar ? 'btn small danger' : 'btn small'}
              disabled={relation > threshold}
              onClick={() => (confirmWar ? (setConfirmWar(false), online.act({ type: 'declareWar', to: target.id })) : setConfirmWar(true))}
            >
              <Icon name="swords" size={16} />{' '}
              {confirmWar
                ? claim
                  ? 'Emin misin? Savaş ilan et'
                  : `Emin misin? Gerekçesiz savaş (herkesle ${d.casusBelli.infamy})`
                : relation > threshold
                  ? `Savaş ilanı (${threshold} gerekir)`
                  : 'Savaş ilan et'}
            </button>
          )}
          {!theyPay && !wePay && !alliance && (war || ally) ? null : null}
        </div>
        {!theyPay && !wePay && !alliance && !war && <p className="hint">Aranızda anlaşma yok.</p>}
      </Section>
      <Section title="Dış ilişkileri" icon="banner" aside="herkese açık">
        <Stat label="Müttefikleri" value={theirAllies.length ? theirAllies.map((id) => kingdomName(online, id)).join(', ') : 'yok'} />
        <Stat label="Savaşta olduğu" value={theirWars.length ? theirWars.map((id) => kingdomName(online, id)).join(', ') : 'yok'} />
        {theirTributes.map((p) => (
          <Stat key={p.id} label="Haraç" value={`${kingdomName(online, p.to_id)} → ${kingdomName(online, p.from_id)} · ${p.gold}/tur`} />
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
      <Section title="İstihbarat" icon="eye" aside={intel ? 'casus ağından' : undefined}>
        {intel === undefined ? (
          <button className="btn small" onClick={() => online.loadIntel(target.id)}>
            Casus raporunu getir
          </button>
        ) : intel === null ? (
          <p className="hint">Rapor alınamadı.</p>
        ) : (
          <>
            {(Object.keys(TOPIC_NAMES) as SpyTopic[]).map((t) => (
              <span key={t} className="sign">
                <span>{TOPIC_NAMES[t]}</span>
                <Meter value={intel.strength[t] / 100} tone="water" label={`${TOPIC_NAMES[t]} ağı`} segments={10} />
                <small>%{intel.strength[t]}</small>
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
                <Range label="Garnizon" value={intel.army.garrison} />
                <Range label="Sahadaki asker" value={intel.army.field} />
                <Range label="Savaş gücü" value={intel.army.might} />
                <Range label="Halkın mutluluğu" value={intel.army.happiness} unit="%" />
              </>
            )}
            {intel.diplomacy && (
              <>
                {intel.diplomacy.envoys.map((e, i) => (
                  <Stat key={i} label="Elçisi" value={`${e.to} · ${ENVOY_NAMES[e.kind as Envoy['kind']] ?? e.kind}`} />
                ))}
                <Stat
                  label="Casusları"
                  value={intel.diplomacy.spies ? intel.diplomacy.spies.map((s) => `${s.target} (${TOPIC_NAMES[s.topic as SpyTopic]})`).join(', ') || 'yok' : `${intel.diplomacy.spyCount} casus (ağ %50 olunca hedefleri görünür)`}
                />
              </>
            )}
            {Object.values(intel.strength).every((s) => s < balance.espionage.minStrength) && <p className="hint">Ağın henüz zayıf; casusların orada kaldıkça rapor netleşir.</p>}
            <button className="btn small" onClick={() => online.loadIntel(target.id)}>
              Raporu yenile
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
                  <small>{there > 0 ? `ağ %${intel ? Math.round(intel.strength[t] ?? 0) : '?'}` : 'casusun yok'}</small>
                </span>
                {there > 0 ? (
                  <span className="chip up">Casusun orada</span>
                ) : (
                  <button className="btn small" disabled={spiesHome < 1} onClick={() => online.act({ type: 'spy', target: target.id, topic: t })}>
                    <Icon name="eye" size={16} /> Casus gönder
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="hint">Bir krallığın her konusuna bir casus gönderilebilir.</p>
        {spiesHome < 1 && <p className="hint">Evde casusun yok. Casus evi zamanla casus yetiştirir.</p>}
      </Section>
      <Section title="Casus operasyonları" icon="eye" aside={intel ? `en güçlü ağın %${Math.round(best)}` : 'önce raporu getir'}>
        {outcome && <p className="alert">{outcome}</p>}
        <p className="hint">Operasyonlar oradaki en güçlü ağından yapılır. Başarısız olan operasyon casusunu kaybettirir ve kimin yaptığını ortaya çıkarır.</p>
        <ul className="places">
          {OPERATIONS.map((op) => {
            const spec = operationSpec(op)
            const blocked = !intel || best < spec.minStrength || (op === 'kidnap' && !target.queen) || kingdom.stock.gold < (spec.cost.gold ?? 0)
            return (
              <li key={op}>
                <Icon name={op === 'kidnap' ? 'crown' : op === 'revolt' ? 'unhappy' : 'warn'} size={24} />
                <span>
                  <b>{OPERATION_NAMES[op]}</b>
                  <small>
                    {OPERATION_NOTES[op]} · ağ %{spec.minStrength} · {spec.cost.gold} altın
                    {op === 'kidnap' && !target.queen ? ' · kraliçeleri yok' : ''}
                  </small>
                </span>
                <button
                  className="btn small"
                  disabled={blocked}
                  onClick={() =>
                    online.act<{ success: boolean }>({ type: 'operation', target: target.id, op }).then((r) => {
                      if (r) setOutcome(r.success ? `${OPERATION_NAMES[op]}: başarılı.` : `${OPERATION_NAMES[op]}: başarısız, casusun yakalandı.`)
                      online.loadIntel(target.id)
                    })
                  }
                >
                  Dene
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

function Spies({ data, online }: { data: HudData; online: Online }) {
  const { kingdom, now } = data
  const capacity = spyCapacity(kingdom, now)
  const active = online.missions.filter((m) => !m.ended_at && (!m.caught_at || Date.parse(m.caught_at) > now))
  const ended = online.missions.filter((m) => m.ended_at).slice(0, 6)
  if (capacity === 0 && active.length === 0) {
    return (
      <Section title="Casusluk" icon="eye">
        <Placeholder icon="lock" title="Casus evin yok">
          Sarayı 2. seviyeye yükselt ve casus evi kur. Casus evi zamanla casus yetiştirir; casusları bir krallığa bir konuda gönderirsin (hammadde,
          ordu, diplomasi). Evde kalan casuslar karşı casusluk yapar.
        </Placeholder>
      </Section>
    )
  }
  const next = kingdom.nextSpyAt && (kingdom.spies ?? 0) + (kingdom.spiesAway ?? 0) < capacity ? kingdom.nextSpyAt - now : null
  return (
    <>
      <Section title="Casuslar" icon="eye" aside={`kapasite ${capacity}`}>
        <Stat label="Evde (karşı casusluk)" value={kingdom.spies ?? 0} />
        <Stat label="Görevde" value={kingdom.spiesAway ?? 0} />
        {next !== null && next > 0 && <Stat label="Sıradaki casus" value={`${Math.ceil(next / 1000)} sn`} note={`${balance.espionage.spyCost.gold} altın`} />}
        <p className="hint">Bir krallığa casus göndermek için Krallıklar listesinden krallığı seç.</p>
      </Section>
      <Section title="Görevler" icon="scroll" aside={`${active.length}`}>
        {active.length === 0 && <p className="hint">Görevde casus yok.</p>}
        <ul className="places">
          {active.map((m) => (
            <li key={m.id}>
              <Icon name="eye" size={24} />
              <span>
                <b>
                  {kingdomName(online, m.target_id)} · {TOPIC_NAMES[m.topic]}
                </b>
                <small>{Math.floor((now - Date.parse(m.started_at)) / 60000)} dakikadır orada</small>
              </span>
              <button className="btn small" onClick={() => (online.setFocus(m.target_id), online.loadIntel(m.target_id))}>
                Rapor
              </button>
              <button className="btn small" onClick={() => online.act({ type: 'recall', mission: m.id })}>
                Geri çağır
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
                    {kingdomName(online, m.target_id)} · {TOPIC_NAMES[m.topic]} · {m.end_reason === 'caught' ? 'yakalandı' : 'geri çağrıldı'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
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
        ? `Yağma başarılı: ${res.loot?.units ?? 0} ${RESOURCE_NAMES[res.loot?.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} getirildi, ${res.lost} asker kaybedildi. Ticaret noktaları harap.`
        : `Yağmacılar püskürtüldü: ${res.lost} asker kaybedildi.`,
    )
  }
  return (
    <Section title="Düşmanlık" icon="swords">
      <div className="actions">
        <button className="btn small danger" disabled={insulting} onClick={() => online.act({ type: 'envoy', to: target.id, kind: 'insult' })}>
          Hakaret et ({d.insult.relation} ilişki)
        </button>
        <button
          className="btn small danger"
          disabled={ally || (kingdom.soldiers ?? 0) < r.soldiers || raidReady > now || !(target.buildings ?? []).some((b) => b.kind === 'tradePost')}
          title={raidReady > now ? `${Math.ceil((raidReady - now) / 1000)} sn sonra` : undefined}
          onClick={raid}
        >
          Ticaret yolunu yağmala · {r.soldiers} asker · şans %{Math.round(chance * 100)}
        </button>
      </div>
      <p className="hint">
        Hakaret: elçin gider, ilişkiniz {d.insult.relation} düşer ve onlar sana karşı savaş gerekçesi kazanır. Yağma: garnizondan {r.soldiers} asker
        tüccarlarını basar; başarırsa sattıkları maldan yüklü bir pay getirir ve ticaret noktaları onarılana kadar satış yapamaz. Ticaret noktasının
        yakınındaki gözcü kuleleri ({towers}) şansı düşürür. Her durumda asker kaybedersin, ilişki {r.relation} düşer ve onlar savaş gerekçesi kazanır.
      </p>
      {outcome && <p className="alert">{outcome}</p>}
    </Section>
  )
}

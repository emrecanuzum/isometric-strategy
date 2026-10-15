import {
  atWar,
  balance,
  dynastyEffects,
  happinessOf,
  heldTown,
  townCenter,
  townFactor,
  townLoyalty,
  townLoyaltyTarget,
  townRevolting,
  townScore,
  townSends,
  townSiegeMs,
  townUpkeepGold,
  townUpkeepLevel,
} from '@game/shared'
import type { Army, HeldTown, Kingdom, Pact, Point, Town, TownGood, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { TOWN_KIND_NAMES, townGift } from '../../game/towns'
import { Icon } from '../icons'
import { Meter, Section, Stat, fmt, signed } from './primitives'

// A town's sheet (CLAUDE.md §8.4): what it sends its holder, who holds it, the siege under way, and sending an army
// to lay siege to it. A town of the player's own also shows what it has sent so far, how loyal it is and why, the
// upkeep paid for that loyalty (set here), and what it adds to the lord's strength and to his crown's.

// The upkeep levels by name (balance.towns.upkeep.goldPerRound).
const UPKEEP_NAMES = ['Yok', 'Az', 'Orta', 'Cömert']
const upkeepName = (i: number) => UPKEEP_NAMES[i] ?? `${i}. kademe`

const GOOD_NAMES: Record<TownGood, string> = { gold: 'Altın', food: 'Yemek', materials: 'Yapı malzemesi', arms: 'Savaş malzemesi', villagers: 'Köylü' }
const amount = (v: number) => (v >= 100 ? fmt(v) : (Math.round(v * 10) / 10).toLocaleString('tr-TR'))
const span = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return m < 60 ? `${m} dakika` : m < 1440 ? `${Math.floor(m / 60)} saat ${m % 60} dakika` : `${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} saat`
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TownSheet({ world, town, walled, kingdom, me, names, armies, pacts, now, onSend, onShow, onWatch, onUpkeep, onClose }: {
  world: World
  town: Town
  // Behind a wooden palisade (see townWalled).
  walled: boolean
  kingdom: Kingdom
  me: number
  // Kingdoms' names by id.
  names: Map<number, string>
  armies: Army[]
  pacts: Pact[]
  now: number
  onSend(army: number, tile: Point): void
  onShow(tile: Point): void
  onWatch(): void
  // Sets the upkeep paid to a town of the player's (an index into balance.towns.upkeep.goldPerRound).
  onUpkeep(level: number): void
  onClose(): void
}) {
  const middle = townCenter(town)
  const distance = Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))
  const mine = town.owner === me
  const holder = town.owner === null ? null : (names.get(town.owner) ?? '?')
  const lawful = town.owner === null || atWar(pacts, me, town.owner)
  const siege = town.siege
  const own = armies.filter((a) => a.kingdom_id === me && a.status !== 'battle')
  const minutes = Math.round(townSiegeMs(walled) / 60_000)
  const p = balance.towns.palisade
  return (
    <section className="sheet frame" aria-labelledby="town-title">
      <header className="sheet-head">
        <Icon name="banner" size={32} />
        <div>
          <h2 id="town-title">{town.name}</h2>
          <small>
            {TOWN_KIND_NAMES[town.kind]}
            {walled && ' · tahta surlu'} · {distance} karo uzakta
          </small>
        </div>
        <button className="btn icon-only" onClick={() => onShow(middle)} aria-label="Haritada göster" title="Haritada göster">
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <div className="feature">
          <Icon name="crown" size={32} />
          <div>
            <b>{mine ? 'Bu kasaba senin' : holder ? `${holder} elinde` : 'Kimseye bağlı değil'}</b>
            <small className="hint">
              Sahibine {townGift(town.kind)} gönderir.
              {town.owner === null && ` Kendi garnizonu var: ${town.garrison} asker; kuşatma bitince ordun onlar kadar kayıp verir.`}
              {town.owner !== null && !mine && ' Sahibiyle savaştaysan kuşatıp alabilirsin.'}
              {mine && ' Savaşta olduğun biri kuşatırsa ordunla gelip kuşatmayı kırabilirsin.'}
              {walled &&
                ` Tahta bir çitle çevrili: taş surdan zayıftır ama kuşatma %${Math.round((p.siegeFactor - 1) * 100)} uzun sürer ve garnizon %${Math.round((p.lossFactor - 1) * 100)} daha çok kayıp verdirir.`}
            </small>
          </div>
        </div>
        {mine && <Holding world={world} kingdom={kingdom} held={kingdom.towns?.find((h) => h.id === town.id) ?? heldTown(town, now)} now={now} onUpkeep={onUpkeep} />}
        {siege && (
          <Section title="Kuşatma" icon="swords" aside={`${clock(siege.endsAt - now)} kaldı`}>
            <p className="hint">{siege.kingdom === me ? 'Ordun kasabayı kuşatıyor.' : `${names.get(siege.kingdom) ?? '?'} ordusu kasabayı kuşatıyor.`}</p>
            <Meter value={(now - siege.startedAt) / (siege.endsAt - siege.startedAt)} tone={siege.kingdom === me ? 'up' : 'down'} label="Kuşatma ilerlemesi" segments={12} />
            <button className="btn small" onClick={onWatch}>
              İzle
            </button>
          </Section>
        )}
        {!mine && (
          <Section title="Kuşat" icon="shield">
            {!lawful ? (
              <p className="hint">Bu kasaba {holder} elinde ve onunla savaşta değilsin. Kuşatmak için önce savaş ilan etmelisin.</p>
            ) : own.length === 0 ? (
              <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <>
                <p className="hint">Gönderdiğin ordu kasabanın kapısına varınca kuşatma başlar ve {minutes} dakika sürer. Ordu orada kalmalı; giderse ya da yenilirse kuşatma kalkar.</p>
                <ul className="town-armies">
                  {own.map((a) => (
                    <li key={a.id}>
                      <span>
                        Ordu #{a.id} · {a.soldiers ?? '?'} asker
                      </span>
                      <button className="btn small" disabled={!!siege && siege.army === a.id} onClick={() => onSend(a.id, middle)}>
                        {siege && siege.army === a.id ? 'Kuşatıyor' : 'Gönder'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}
      </div>
    </section>
  )
}

// A town of the player's: its loyalty and what moves it, the upkeep, what it has sent, and the strength it lends.
function Holding({ world, kingdom, held, now, onUpkeep }: { world: World; kingdom: Kingdom; held: HeldTown; now: number; onUpkeep(level: number): void }) {
  const t = balance.towns
  const loyalty = townLoyalty(held)
  const mood = { happiness: happinessOf(kingdom), ruler: dynastyEffects(kingdom).happiness }
  const target = townLoyaltyTarget(held, mood)
  const trend = target - loyalty
  const revolting = townRevolting(held, now)
  const level = townUpkeepLevel(held)
  const roundsPerHour = 3600 / balance.economy.productionSeconds
  const cost = townUpkeepGold(held)
  const sends = townSends(held, now)
  const factor = townFactor(held, now)
  const delivered = held.delivered ?? {}
  const goods = (Object.keys(GOOD_NAMES) as TownGood[]).filter((g) => (delivered[g] ?? 0) > 0 || sends[g] > 0)
  const happinessPart = (mood.happiness - 50) * t.loyalty.happinessWeight
  const rulerPart = mood.ruler * t.loyalty.rulerWeight
  const points = Math.round(townScore(held, now))
  const liege = kingdom.liege !== undefined && world.cities[kingdom.liege] ? cityInfo(world, kingdom.liege) : null
  const r = t.revolt
  return (
    <>
      <Section title="Sadakat" icon={loyalty >= 50 ? 'happy' : loyalty >= r.below ? 'content' : 'unhappy'} aside={`%${Math.round(loyalty)} · ${Math.abs(trend) < 0.5 ? 'durgun' : trend > 0 ? 'yükseliyor' : 'düşüyor'}`}>
        <Meter value={loyalty / 100} tone={loyalty >= 50 ? 'up' : loyalty >= r.below ? 'gold' : 'down'} label="Sadakat" segments={20} />
        {revolting ? (
          <p className="alert">
            Kasaba ayaklandı: {span(held.revoltUntil! - now)} daha hiçbir şey göndermeyecek. Ayaklanma bittiğinde sadakat %{r.breakAwayBelow}'nin altındaysa kasaba senden kopar.
          </p>
        ) : loyalty < r.below + 10 ? (
          <p className="alert">Sadakat %{r.below}'in altına inerse kasaba ayaklanır. Bakımı artırmak sadakati yükseltir.</p>
        ) : null}
        <Stat label="Gittiği yer" value={`%${Math.round(target)}`} tone={trend >= 0 ? 'up' : 'down'} note={`yaklaşık ${Math.round(t.loyalty.tauSeconds / 60)} dakikada yolun üçte ikisini alır`} />
        <Stat label={`Taban (bakım: ${upkeepName(held.unpaid ? 0 : level).toLocaleLowerCase('tr-TR')})`} value={`%${t.loyalty.upkeepTargets[held.unpaid ? 0 : level]}`} note={held.unpaid ? 'hazine yetmedi, ödenmedi' : undefined} tone={held.unpaid ? 'down' : undefined} />
        <Stat label="Halkının mutluluğu" value={signed(happinessPart)} tone={happinessPart >= 0 ? 'up' : 'down'} />
        <Stat label="Hükümdarın halk yeteneği" value={signed(rulerPart)} tone={rulerPart >= 0 ? 'up' : 'down'} />
        <p className="hint">
          Sadakat ne kadar yüksekse kasaba o kadar çok gönderir (%0'da ×{t.loyalty.yieldMin}, %100'de ×{t.loyalty.yieldMax}; şu an ×{factor.toFixed(2).replace('.', ',')}).
          Düşman casusları kasabayı kışkırtıp sadakatini bir anda düşürebilir.
        </p>
      </Section>
      <Section title="Bakım" icon="gold" aside={cost > 0 ? `tur başına ${amount(cost)} altın` : 'ödeme yok'}>
        <p className="hint">Kasabayı elinde tutmak için her üretim turunda hazineden ödenir. Hazine yetmezse ödenmez ve sadakat bakımsızmış gibi düşer.</p>
        <div className="segmented" role="radiogroup" aria-label="Bakım">
          {t.upkeep.goldPerRound.map((gold, i) => (
            <button key={i} className="btn small" role="radio" aria-checked={level === i} onClick={() => level !== i && onUpkeep(i)}>
              {upkeepName(i)}
              <small> {gold > 0 ? `${amount(gold)}` : '0'}</small>
            </button>
          ))}
        </div>
        <Stat label="Saatte" value={`${amount(cost * roundsPerHour)} altın`} note={`sadakat hedefi %${t.loyalty.upkeepTargets[level]} (+ halk ve hükümdar)`} />
      </Section>
      <Section title="Sana getirdikleri" icon="chest" aside={held.takenAt ? `alınalı ${span(now - held.takenAt)}` : undefined}>
        {goods.length === 0 && <p className="hint">Henüz bir şey göndermedi.</p>}
        {goods.map((g) => (
          <Stat
            key={g}
            label={
              <>
                <Icon name={g === 'villagers' ? 'villager' : g} size={16} /> {GOOD_NAMES[g]}
              </>
            }
            value={g === 'villagers' ? `${fmt(sends.villagers)} köylü` : `${amount(delivered[g] ?? 0)} toplam`}
            note={g === 'villagers' ? 'şu an barındırdığı' : `şu an tur başına ${amount(sends[g])}`}
          />
        ))}
        {cost > 0 && <Stat label="Bakıma giden" value={`tur başına −${amount(cost)} altın`} tone="down" />}
      </Section>
      <Section title="Sana kattığı güç" icon="crown" aside={`+${points} puan`}>
        <p className="hint">
          Kasaba lordluğunun puanına +{points} katar (sadakatle artar, ayaklanmada yarıya iner).{' '}
          {liege ? (
            <>
              Bağlı olduğun <b style={{ color: liege.color }}>{liege.name}</b>nın gücüne +{points}.
            </>
          ) : (
            'Henüz bir taç krallığına biat etmedin; ettiğinde bu puan onun gücüne de eklenir.'
          )}
        </p>
      </Section>
    </>
  )
}

import { atWar, balance, townCenter } from '@game/shared'
import type { Army, Kingdom, Pact, Point, Town } from '@game/shared'
import { TOWN_KIND_NAMES, townGift } from '../../game/towns'
import { Icon } from '../icons'
import { Meter, Section } from './primitives'

// A town's sheet (CLAUDE.md §8.4): what it sends its holder, who holds it, the siege under way, and sending an army
// to lay siege to it.

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TownSheet({ town, kingdom, me, names, armies, pacts, now, onSend, onShow, onClose }: {
  town: Town
  kingdom: Kingdom
  me: number
  // Kingdoms' names by id.
  names: Map<number, string>
  armies: Army[]
  pacts: Pact[]
  now: number
  onSend(army: number, tile: Point): void
  onShow(tile: Point): void
  onClose(): void
}) {
  const middle = townCenter(town)
  const distance = Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))
  const mine = town.owner === me
  const holder = town.owner === null ? null : (names.get(town.owner) ?? '?')
  const lawful = town.owner === null || atWar(pacts, me, town.owner)
  const siege = town.siege
  const own = armies.filter((a) => a.kingdom_id === me && a.status !== 'battle')
  const minutes = Math.round(balance.towns.siegeSeconds / 60)
  return (
    <section className="sheet frame" aria-labelledby="town-title">
      <header className="sheet-head">
        <Icon name="banner" size={32} />
        <div>
          <h2 id="town-title">{town.name}</h2>
          <small>
            {TOWN_KIND_NAMES[town.kind]} · {distance} karo uzakta
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
            </small>
          </div>
        </div>
        {siege && (
          <Section title="Kuşatma" icon="swords" aside={`${clock(siege.endsAt - now)} kaldı`}>
            <p className="hint">{siege.kingdom === me ? 'Ordun kasabayı kuşatıyor.' : `${names.get(siege.kingdom) ?? '?'} ordusu kasabayı kuşatıyor.`}</p>
            <Meter value={(now - siege.startedAt) / (siege.endsAt - siege.startedAt)} tone={siege.kingdom === me ? 'up' : 'down'} label="Kuşatma ilerlemesi" segments={12} />
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

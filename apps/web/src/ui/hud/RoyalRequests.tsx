import { NoticeArt } from '../NoticeArt'
import { EnvoyPortrait } from '../advisor/EnvoyPortrait'
import { balance, goldCap, isWeaponItem, palaceLevel, questError, questProgress, royalAnswer, royalError, royalHave, royalRequest } from '@game/shared'
import type { Kingdom, Market, RoyalItem, RoyalRequest, World } from '@game/shared'
import { useEffect, useState } from 'react'
import { playOnce } from '../../audio/sfx'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_ICONS, RESOURCE_NAMES, WEAPON_ICONS, WEAPON_NAMES } from '../names'
import { QUEST_TITLES } from './cities'
import type { Online } from './online'
import { Meter, fmt } from './primitives'

// The liege's royal envoy (CLAUDE.md §7.8): every hour the crown a lord is sworn to asks for a lot of one thing, to be
// handed over within the hour. Its arrival opens a dialog; while it lasts it stays in the quest tracker on the right,
// beside the crowns' tasks taken this hour.

export const itemName = (item: RoyalItem) => (isWeaponItem(item) ? WEAPON_NAMES[item] : RESOURCE_NAMES[item]).toLowerCase()
export const itemIcon = (item: RoyalItem): IconName => (isWeaponItem(item) ? WEAPON_ICONS[item] : RESOURCE_ICONS[item])

// What the envoy says, a few ways for every kind of thing; the ruler's name and the lot filled in.
const SAYINGS: Record<'weapon' | 'food' | 'materials' | 'arms', ((who: string, lot: string) => string)[]> = {
  weapon: [
    (who, lot) => `${who} ${lot} istiyor; sınırda işler karışık. Yarına kadar yetişir mi?`,
    (who, lot) => `${who} muhafız alayını yeniden donatıyor ve senden ${lot} bekliyor. Demircilerin hazır mı?`,
    (who, lot) => `Başkentin cephaneliği boşaldı. ${who}, sadık lordundan ${lot} rica ediyor.`,
    (who, lot) => `${who} yakında bir sefere çıkacak; ${lot} gerek. Günün sonuna dek gönderebilir misin?`,
  ],
  food: [
    (who, lot) => `Başkentte ambarlar boşalıyor. ${who} halkı doyurmak için ${lot} istiyor.`,
    (who, lot) => `${who} büyük bir ziyafet veriyor; mutfaklara ${lot} lazım. Yetiştirebilir misin?`,
    (who, lot) => `Kuzeyde kıtlık var. ${who} oraya göndermek için senden ${lot} bekliyor.`,
  ],
  materials: [
    (who, lot) => `${who} katedralin kulesini onarıyor; ${lot} gerek. Gün bitmeden gönderebilir misin?`,
    (who, lot) => `Selden yıkılan köprüler yeniden kurulacak. ${who} senden ${lot} istiyor.`,
    (who, lot) => `${who} başkentin surlarını yükseltiyor ve ${lot} bekliyor.`,
  ],
  arms: [
    (who, lot) => `${who} yeni bir kadırga döktürüyor; ${lot} istiyor. Ocakların yetişir mi?`,
    (who, lot) => `Taç ordusunun demirhaneleri malzemesiz kaldı. ${who} senden ${lot} bekliyor.`,
    (who, lot) => `${who} sınır kalelerini donatıyor; ${lot} gerek. Yarına kadar olur mu?`,
  ],
}

export function royalSaying(world: World, req: RoyalRequest) {
  const ruler = cityInfo(world, req.crown).ruler
  const list = SAYINGS[isWeaponItem(req.item) ? 'weapon' : req.item]
  const who = req.n % 2 === 0 ? `Hükümdarımız ${ruler}` : ruler
  return list[Math.abs(req.n) % list.length](who, `${fmt(req.units)} ${itemName(req.item)}`)
}

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} sn`
}

// The request of the hour, while it lasts and is not turned down or handed over.
export function liveRequest(kingdom: Kingdom, market: Market | null | undefined, now: number) {
  const req = royalRequest(kingdom, now, market)
  if (!req || now >= req.endsAt) return null
  const answer = royalAnswer(kingdom, req.n)
  if (answer && answer.status !== 'accepted') return null
  return { req, accepted: answer?.status === 'accepted' }
}

// The envoy at the gates: the request, what it pays, and the two answers.
export function RoyalDialog({ world, kingdom, req, online, onClose }: { world: World; kingdom: Kingdom; req: RoyalRequest; online: Online; onClose: () => void }) {
  const info = cityInfo(world, req.crown)
  const r = balance.cities.crown.royal
  const have = royalHave(kingdom, req.item)
  // The court's herald, once per request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => playOnce(`royal:${req.crown}:${req.n}`, 'royal'), [req.crown, req.n])
  return (
    <div className="modal" role="dialog" aria-labelledby="royal-title">
      <section className="dialog frame fortune-dialog envoy-dialog good">
        <header className="fortune-banner">
          <span className="envoy-face">
            <EnvoyPortrait size={44} />
          </span>
          <div>
            {/* The crown's colour as a swatch: its red or blue text was unreadable on the green banner. */}
            <small>
              <Icon name="crown" size={16} />
              <i style={{ width: 10, height: 10, background: info.color, boxShadow: '0 0 0 2px rgb(0 0 0 / 45%)', display: 'inline-block' }} />
              {info.name} · kraliyet elçisi
            </small>
            <h2 id="royal-title">Hükümdarın isteği</h2>
          </div>
        </header>
        <div className="fortune-art">
          <NoticeArt look={{ family: 'envoy', other: info.color, own: null, tone: 'good' }} />
        </div>
        <div className="fortune-body">
        <p>{royalSaying(world, req)}</p>
        <p className="hint">
          <Icon name={itemIcon(req.item)} size={16} /> Elinde {fmt(have)} / {fmt(req.units)} {itemName(req.item)} var. {Math.round(r.durationSeconds / 60)} dakika içinde teslim edersen {fmt(req.gold)} altın ve taçla ilişki +{r.relation.deliver}. Geri çevirirsen
          ilişki −{Math.abs(r.relation.decline)}.
        </p>
        <div className="row spread">
          <button className="btn small danger" onClick={() => (online.act({ type: 'royal', action: 'decline' }), onClose())}>
            Bu sefer olmaz
          </button>
          <button className="btn small primary" onClick={() => (online.act({ type: 'royal', action: 'accept' }), onClose())}>
            <Icon name="scroll" size={16} /> Elimden geleni yaparım
          </button>
        </div>
        </div>
      </section>
    </div>
  )
}

const FOLD_KEY = 'quests-folded'

// The quests under way, folded away to their header if the player likes (remembered in the browser): the royal
// request of the hour and the crowns' tasks taken.
export function QuestTracker({ world, kingdom, online, now }: { world: World; kingdom: Kingdom; online: Online; now: number }) {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1'
    } catch {
      return false
    }
  })
  const fold = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(FOLD_KEY, folded ? '0' : '1')
    } catch {
      // Without storage it is only folded for now.
    }
  }
  const live = liveRequest(kingdom, online.market, now)
  const crowns = world.cities.length
  const palace = palaceLevel(kingdom, now)
  const quests = world.cities.flatMap((_, i) => {
    const p = questProgress(kingdom, i, now)
    return p.taken && !p.taken.done ? [{ crown: i, ...p, claim: questError(kingdom, i, 'claim', now, crowns, palace) }] : []
  })
  const count = (live ? 1 : 0) + quests.length
  if (count === 0) return null
  const ready = (live && !royalError(kingdom, 'deliver', now, online.market) ? 1 : 0) + quests.filter((q) => !q.claim).length
  const goldRoom = goldCap(kingdom, now) - kingdom.stock.gold
  return (
    <section className={folded ? 'quests frame folded' : 'quests frame open'} aria-label="Görevler">
      <button className="quests-head" onClick={fold} aria-expanded={!folded}>
        <Icon name={folded ? 'plus' : 'minus'} size={8} />
        <span>Görevler · {count}</span>
        {ready > 0 && <b>{ready}</b>}
      </button>
      {!folded && (
        <ul className="quests-list">
          {live && (
            <RoyalRow world={world} kingdom={kingdom} req={live.req} accepted={live.accepted} online={online} now={now} goldRoom={goldRoom} />
          )}
          {quests.map((q) => (
            <li key={`q:${q.crown}`} className="quest">
              <div className="quest-top">
                <Icon name="crown" size={16} />
                <span>
                  <b style={{ color: cityInfo(world, q.crown).ink }}>{QUEST_TITLES[q.quest.kind]}</b>
                  <small>{cityInfo(world, q.crown).name}</small>
                </span>
                <small>{left(q.quest.endsAt - now)}</small>
              </div>
              <Meter value={q.need ? Math.min(1, q.have / q.need) : 1} tone={q.have >= q.need ? 'up' : 'gold'} label="Görevin ilerlemesi" segments={10} />
              <small className="quest-info">
                {fmt(Math.min(q.have, q.need))} / {fmt(q.need)} · {fmt(q.quest.gold)} altın
              </small>
              <div className="quest-actions">
                <button className={q.claim ? 'btn small' : 'btn small primary'} disabled={!!q.claim} data-why={q.claim === 'notYet' ? 'Görev henüz tamamlanmadı' : q.claim === 'done' ? 'Ödülü aldın' : 'Ödül şu an alınamaz'} onClick={() => online.act({ type: 'quest', crown: q.crown, action: 'claim' })}>
                  <Icon name="chest" size={16} /> Ödülü al
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RoyalRow({ world, kingdom, req, accepted, online, now, goldRoom }: { world: World; kingdom: Kingdom; req: RoyalRequest; accepted: boolean; online: Online; now: number; goldRoom: number }) {
  const have = royalHave(kingdom, req.item)
  const can = !royalError(kingdom, 'deliver', now, online.market)
  const r = balance.cities.crown.royal
  return (
    <li className="quest royal">
      <div className="quest-top">
        <Icon name={itemIcon(req.item)} size={16} />
        <span>
          <b style={{ color: cityInfo(world, req.crown).ink }}>Kraliyet isteği</b>
          <small>
            {fmt(req.units)} {itemName(req.item)}
          </small>
        </span>
        <small>{left(req.endsAt - now)}</small>
      </div>
      <Meter value={Math.min(1, have / Math.max(1, req.units))} tone={have >= req.units ? 'up' : 'gold'} label="Kraliyet isteğinin ilerlemesi" segments={10} />
      <small className="quest-info">
        {fmt(Math.min(have, req.units))} / {fmt(req.units)} · {fmt(req.gold)} altın · ilişki +{r.relation.deliver}
      </small>
      <div className="quest-actions">
        {accepted ? (
          <button className={can ? 'btn small primary' : 'btn small'} disabled={!can} data-why={have < req.units ? `Elinde ${fmt(have)} / ${fmt(req.units)} ${itemName(req.item)} var` : now >= req.endsAt ? 'Bu isteğin süresi doldu' : 'Şu an teslim edilemez'} onClick={() => online.act({ type: 'royal', action: 'deliver' })}>
            <Icon name="chest" size={16} /> Teslim et
          </button>
        ) : (
          <>
            <button className="btn small danger" title="Bu sefer olmaz" aria-label="Bu sefer olmaz" onClick={() => online.act({ type: 'royal', action: 'decline' })}>
              <Icon name="close" size={16} />
            </button>
            <button className="btn small primary" onClick={() => online.act({ type: 'royal', action: can ? 'deliver' : 'accept' })}>
              <Icon name={can ? 'chest' : 'scroll'} size={16} /> {can ? 'Teslim et' : 'Üstlen'}
            </button>
          </>
        )}
      </div>
      {can && goldRoom < req.gold && <small className="down">Hazinende {fmt(Math.max(0, goldRoom))} altınlık yer var; kalanı boşa gider.</small>}
    </li>
  )
}

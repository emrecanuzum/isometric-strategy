import { NoticeArt } from '../NoticeArt'
import { EnvoyPortrait } from '../advisor/EnvoyPortrait'
import { balance, goldCap, isWeaponItem, palaceLevel, questError, questProgress, royalAnswer, royalError, royalHave, royalRequest } from '@game/shared'
import type { Kingdom, Market, RoyalItem, RoyalRequest, World } from '@game/shared'
import { useEffect, useState } from 'react'
import { playOnce } from '../../audio/sfx'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { L } from '../../lib/i18n'
import type { IconName } from '../icons'
import { RESOURCE_ICONS, RESOURCE_NAMES, WEAPON_ICONS, WEAPON_NAMES } from '../names'
import { QUEST_TITLES } from './cities'
import type { Online } from './online'
import { Meter, fmt } from './primitives'

// The liege's royal envoy (CLAUDE.md §7.8): every hour the crown a lord is sworn to asks for a lot of one thing, to be
// handed over within the hour. Its arrival opens a dialog; while it lasts it stays in the quest tracker on the right,
// beside the crowns' tasks taken this hour.

// Counted in English, so a weapon reads in the plural ("115 shields", "sets of bow and arrows").
export const itemName = (item: RoyalItem) =>
  isWeaponItem(item) ? L(WEAPON_NAMES[item].toLowerCase(), item === 'bow' ? 'sets of bow and arrows' : `${WEAPON_NAMES[item].toLowerCase()}s`) : RESOURCE_NAMES[item].toLowerCase()
export const itemIcon = (item: RoyalItem): IconName => (isWeaponItem(item) ? WEAPON_ICONS[item] : RESOURCE_ICONS[item])

// What the envoy says, a few ways for every kind of thing; the ruler's name and the lot filled in.
const SAYINGS: Record<'weapon' | 'food' | 'materials' | 'arms', ((who: string, lot: string) => string)[]> = {
  weapon: [
    (who, lot) => L(`${who} ${lot} istiyor; sınırda işler karışık. Yarına kadar yetişir mi?`, `${who} asks for ${lot}; things are restless on the border. Can it be ready by tomorrow?`),
    (who, lot) => L(`${who} muhafız alayını yeniden donatıyor ve senden ${lot} bekliyor. Demircilerin hazır mı?`, `${who} is re-arming the household guard and expects ${lot} from you. Are your smiths ready?`),
    (who, lot) => L(`Başkentin cephaneliği boşaldı. ${who}, sadık lordundan ${lot} rica ediyor.`, `The capital's armoury stands empty. ${who} kindly asks a loyal lord for ${lot}.`),
    (who, lot) => L(`${who} yakında bir sefere çıkacak; ${lot} gerek. Günün sonuna dek gönderebilir misin?`, `${who} rides to war soon and needs ${lot}. Can you send it before the day is out?`),
  ],
  food: [
    (who, lot) => L(`Başkentte ambarlar boşalıyor. ${who} halkı doyurmak için ${lot} istiyor.`, `The capital's granaries are running low. ${who} asks for ${lot} to feed the people.`),
    (who, lot) => L(`${who} büyük bir ziyafet veriyor; mutfaklara ${lot} lazım. Yetiştirebilir misin?`, `${who} is throwing a grand feast; the kitchens need ${lot}. Can you manage it in time?`),
    (who, lot) => L(`Kuzeyde kıtlık var. ${who} oraya göndermek için senden ${lot} bekliyor.`, `There is famine in the north. ${who} expects ${lot} from you to send there.`),
  ],
  materials: [
    (who, lot) => L(`${who} katedralin kulesini onarıyor; ${lot} gerek. Gün bitmeden gönderebilir misin?`, `${who} is mending the cathedral's tower and needs ${lot}. Can you send it before the day ends?`),
    (who, lot) => L(`Selden yıkılan köprüler yeniden kurulacak. ${who} senden ${lot} istiyor.`, `The bridges the flood swept away are to be rebuilt. ${who} asks you for ${lot}.`),
    (who, lot) => L(`${who} başkentin surlarını yükseltiyor ve ${lot} bekliyor.`, `${who} is raising the capital's walls and expects ${lot}.`),
  ],
  arms: [
    (who, lot) => L(`${who} yeni bir kadırga döktürüyor; ${lot} istiyor. Ocakların yetişir mi?`, `${who} is having a new galley fitted out and asks for ${lot}. Can your forges keep up?`),
    (who, lot) => L(`Taç ordusunun demirhaneleri malzemesiz kaldı. ${who} senden ${lot} bekliyor.`, `The crown army's smithies have run out of stock. ${who} expects ${lot} from you.`),
    (who, lot) => L(`${who} sınır kalelerini donatıyor; ${lot} gerek. Yarına kadar olur mu?`, `${who} is stocking the border forts and needs ${lot}. Can it be done by tomorrow?`),
  ],
}

export function royalSaying(world: World, req: RoyalRequest) {
  const ruler = cityInfo(world, req.crown).ruler
  const list = SAYINGS[isWeaponItem(req.item) ? 'weapon' : req.item]
  const who = req.n % 2 === 0 ? L(`Hükümdarımız ${ruler}`, `Our sovereign ${ruler}`) : ruler
  return list[Math.abs(req.n) % list.length](who, `${fmt(req.units)} ${itemName(req.item)}`)
}

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : L(`${s} sn`, `${s}s`)
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
              {info.name} · {L('kraliyet elçisi', 'royal envoy')}
            </small>
            <h2 id="royal-title">{L('Hükümdarın isteği', 'The ruler\'s request')}</h2>
          </div>
        </header>
        <div className="fortune-art">
          <NoticeArt look={{ family: 'envoy', other: info.color, own: null, tone: 'good' }} />
        </div>
        <div className="fortune-body">
        <p>{royalSaying(world, req)}</p>
        <p className="hint">
          <Icon name={itemIcon(req.item)} size={16} />{' '}
          {L(
            `Elinde ${fmt(have)} / ${fmt(req.units)} ${itemName(req.item)} var. ${Math.round(r.durationSeconds / 60)} dakika içinde teslim edersen ${fmt(req.gold)} altın ve taçla ilişki +${r.relation.deliver}. Geri çevirirsen ilişki −${Math.abs(r.relation.decline)}.`,
            `You hold ${fmt(have)} / ${fmt(req.units)} ${itemName(req.item)}. Deliver within ${Math.round(r.durationSeconds / 60)} minutes for ${fmt(req.gold)} gold and +${r.relation.deliver} relations with the crown. Turn it down and relations fall by ${Math.abs(r.relation.decline)}.`,
          )}
        </p>
        <div className="row spread">
          <button className="btn small danger" onClick={() => (online.act({ type: 'royal', action: 'decline' }), onClose())}>
            {L('Bu sefer olmaz', 'Not this time')}
          </button>
          <button className="btn small primary" onClick={() => (online.act({ type: 'royal', action: 'accept' }), onClose())}>
            <Icon name="scroll" size={16} /> {L('Elimden geleni yaparım', 'I shall do my best')}
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
    <section className={folded ? 'quests frame folded' : 'quests frame open'} aria-label={L('Görevler', 'Tasks')}>
      <button className="quests-head" onClick={fold} aria-expanded={!folded}>
        <Icon name={folded ? 'plus' : 'minus'} size={8} />
        <span>{L('Görevler', 'Tasks')} · {count}</span>
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
              <Meter value={q.need ? Math.min(1, q.have / q.need) : 1} tone={q.have >= q.need ? 'up' : 'gold'} label={L('Görevin ilerlemesi', 'Task progress')} segments={10} />
              <small className="quest-info">
                {fmt(Math.min(q.have, q.need))} / {fmt(q.need)} · {fmt(q.quest.gold)} {L('altın', 'gold')}
              </small>
              <div className="quest-actions">
                <button className={q.claim ? 'btn small' : 'btn small primary'} disabled={!!q.claim} data-why={q.claim === 'notYet' ? L('Görev henüz tamamlanmadı', 'The task is not finished yet') : q.claim === 'done' ? L('Ödülü aldın', 'You have claimed the reward') : L('Ödül şu an alınamaz', 'The reward cannot be claimed now')} onClick={() => online.act({ type: 'quest', crown: q.crown, action: 'claim' })}>
                  <Icon name="chest" size={16} /> {L('Ödülü al', 'Claim reward')}
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
          <b style={{ color: cityInfo(world, req.crown).ink }}>{L('Kraliyet isteği', 'Royal request')}</b>
          <small>
            {fmt(req.units)} {itemName(req.item)}
          </small>
        </span>
        <small>{left(req.endsAt - now)}</small>
      </div>
      <Meter value={Math.min(1, have / Math.max(1, req.units))} tone={have >= req.units ? 'up' : 'gold'} label={L('Kraliyet isteğinin ilerlemesi', 'Royal request progress')} segments={10} />
      <small className="quest-info">
        {fmt(Math.min(have, req.units))} / {fmt(req.units)} · {fmt(req.gold)} {L('altın', 'gold')} · {L('ilişki', 'relations')} +{r.relation.deliver}
      </small>
      <div className="quest-actions">
        {accepted ? (
          <button className={can ? 'btn small primary' : 'btn small'} disabled={!can} data-why={have < req.units ? L(`Elinde ${fmt(have)} / ${fmt(req.units)} ${itemName(req.item)} var`, `You hold ${fmt(have)} / ${fmt(req.units)} ${itemName(req.item)}`) : now >= req.endsAt ? L('Bu isteğin süresi doldu', 'This request has expired') : L('Şu an teslim edilemez', 'Cannot be delivered right now')} onClick={() => online.act({ type: 'royal', action: 'deliver' })}>
            <Icon name="chest" size={16} /> {L('Teslim et', 'Deliver')}
          </button>
        ) : (
          <>
            <button className="btn small danger" title={L('Bu sefer olmaz', 'Not this time')} aria-label={L('Bu sefer olmaz', 'Not this time')} onClick={() => online.act({ type: 'royal', action: 'decline' })}>
              <Icon name="close" size={16} />
            </button>
            <button className="btn small primary" onClick={() => online.act({ type: 'royal', action: can ? 'deliver' : 'accept' })}>
              <Icon name={can ? 'chest' : 'scroll'} size={16} /> {can ? L('Teslim et', 'Deliver') : L('Üstlen', 'Take it on')}
            </button>
          </>
        )}
      </div>
      {can && goldRoom < req.gold && <small className="down">{L(`Hazinende ${fmt(Math.max(0, goldRoom))} altınlık yer var; kalanı boşa gider.`, `Your treasury has room for ${fmt(Math.max(0, goldRoom))} gold; the rest goes to waste.`)}</small>}
    </li>
  )
}

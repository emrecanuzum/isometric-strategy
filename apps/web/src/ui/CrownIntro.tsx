import { balance, cityCenter, crownPower } from '@game/shared'
import type { Kingdom, World } from '@game/shared'
import { useEffect, useMemo, useState } from 'react'
import { playOnce } from '../audio/sfx'
import { squad } from '../game/armies'
import { STRUCTURE_SPRITES, palaceIn } from '../game/buildingSprites'
import { cityInfo } from '../game/cities'
import { Scene } from './AwayReport'
import type { Placed } from './AwayReport'
import { Icon } from './icons'
import { L } from '../lib/i18n'
import { CrownBanner, CrownRivalry } from './hud/cities'
import type { Online } from './hud/online'

// The crowns introduced (CLAUDE.md §7.8): once the lord has a few buildings standing, the two crown kingdoms make
// themselves known, page by page, and the last page asks the lord to choose a side. Until then fealty is not offered.

const seenKey = (lobby: string, id: number) => `crown-intro:${lobby}:${id}`

// Whether the introduction was already shown (or put off) on this browser.
export function introSeen(lobby: string, id: number) {
  try {
    return localStorage.getItem(seenKey(lobby, id)) === '1'
  } catch {
    return false
  }
}

function markSeen(lobby: string, id: number) {
  try {
    localStorage.setItem(seenKey(lobby, id), '1')
  } catch {
    // Shown again next time: no harm.
  }
}

// The two capitals face each other, their armies between them.
function crownsPicture(): Placed[] {
  return [
    { sprite: palaceIn('crimson', 3), x: -1, y: 6 },
    { sprite: palaceIn('royal', 3), x: 6, y: 1 },
    { sprite: squad('crimson', 0, 12), x: 1, y: 4.2 },
    { sprite: squad('royal', 2, 12), x: 2.8, y: 2.4 },
  ]
}

function lordPicture(own: string | undefined): Placed[] {
  return [
    { sprite: palaceIn(own, 2), x: 0, y: 5 },
    { sprite: STRUCTURE_SPRITES.tavern[0], x: 4, y: 2 },
    { sprite: squad('crimson', 1, 6), x: 5.2, y: 1.4 },
  ]
}

function marketPicture(): Placed[] {
  return [
    { sprite: STRUCTURE_SPRITES.market[0], x: 0, y: 5 },
    { sprite: STRUCTURE_SPRITES.warehouse[1], x: 2, y: 0 },
    { sprite: STRUCTURE_SPRITES.market[1], x: 6, y: 1 },
  ]
}

export function CrownIntro({ world, kingdom, online, lobby, onSwear, onClose }: {
  world: World
  kingdom: Kingdom
  online: Online
  lobby: string
  onSwear(city: number): void
  onClose(): void
}) {
  const [page, setPage] = useState(0)
  // The crowns announce themselves with a fanfare.
  useEffect(() => playOnce(`crown-intro:${lobby}`, 'crown'), [lobby])
  const [asking, setAsking] = useState<number | null>(null)
  const infos = world.cities.map((_, i) => cityInfo(world, i))
  const lords = online.kingdoms.map((k) => ({ liege: k.liege ?? null, score: k.score?.total ?? 0 }))
  const { share } = crownPower(lords, world.cities.length)
  const c = balance.cities.crown
  const pages = useMemo(
    () => [
      { title: L('İki taç', 'Two crowns'), picture: crownsPicture() },
      { title: L('Taçların rekabeti', 'The crowns\' rivalry'), picture: crownsPicture() },
      { title: L('Lord olmak', 'Being a lord'), picture: lordPicture(kingdom.color) },
      { title: L('Taçların pazarı', 'The crowns\' market'), picture: marketPicture() },
      { title: L('Tarafını seç', 'Choose your side'), picture: crownsPicture() },
    ],
    [kingdom.color],
  )
  const close = () => {
    markSeen(lobby, online.me)
    onClose()
  }
  const current = pages[page]
  return (
    <div className="modal" role="dialog" aria-labelledby="crown-intro-title">
      <section className="dialog frame away">
        <header className="sheet-head">
          <Icon name="crown" size={32} />
          <div>
            <h2 id="crown-intro-title">{L('Taç krallıkları', 'The crown kingdoms')}</h2>
            <small>
              {current.title} · {page + 1} / {pages.length}
            </small>
          </div>
          <button className="btn icon-only" onClick={close} aria-label={L('Sonra karar ver', 'Decide later')}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <Scene items={current.picture} />
        <h3 className="away-title">{current.title}</h3>
        {page === 0 && (
          <div className="away-lines">
            <p>
              {L(
                'Lordluğun büyüdü; artık diyarın büyükleri seni fark ediyor. Bu topraklarda yalnızca iki krallık var, sen ve öbür oyuncular onların lordlarısınız.',
                'Your lordship has grown; the great of the realm have begun to take notice of you. There are only two kingdoms in these lands, and you and the other players are their lords.',
              )}
            </p>
            {infos.map((info, i) => {
              const middle = cityCenter(world.cities[i])
              return (
                <p key={i}>
                  <CrownBanner world={world} liege={i} size={16} /> <b style={{ color: info.color }}>{info.name}</b>:{' '}
                  {L(
                    `hükümdarı ${info.ruler}, başkenti ${info.capital} (${Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))} karo uzakta).`,
                    `ruled by ${info.ruler}, capital ${info.capital} (${Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))} tiles away).`,
                  )}
                </p>
              )
            })}
          </div>
        )}
        {page === 1 && (
          <div className="away-lines">
            <p>
              {L(
                `İki taç diyara hâkim olmak için yarışır. Bir tacın gücü, ona bağlı lordların gücüdür: lordları büyüdükçe, zenginleştikçe ve savaş kazandıkça tacı güçlenir. Şu an güç %${Math.round(share[0] * 100)} – %${Math.round(share[1] * 100)}.`,
                `The two crowns vie to rule the realm. A crown's power is the power of its lords: as its lords grow, prosper and win battles, the crown grows stronger. Right now the power stands at ${Math.round(share[0] * 100)}% – ${Math.round(share[1] * 100)}%.`,
              )}
            </p>
            <CrownRivalry world={world} online={online} />
          </div>
        )}
        {page === 2 && (
          <div className="away-lines">
            <p>{L('Biat ettiğin tacın devriyeleri sana uğrar; eğlence merkezin varsa içip eğlenir, bahşiş bırakır. Taçla ilişkin iyileştikçe armağanlar da getirir:', 'The patrols of the crown you swear fealty to will call on you; if you have an entertainment hall, they drink, make merry and leave a tip. As your relations with the crown improve they bring gifts too:')}</p>
            <ul className="tiers">
              {c.gifts.map((g) => (
                <li key={g.at} className="on">
                  <Icon name="chest" size={16} />
                  <span>
                    <b>{L(g.name, g.nameEn ?? g.name)}</b> · {L('ilişki', 'relations')} {g.at}+
                  </span>
                </li>
              ))}
            </ul>
            <p>
              {L(
                `Rakip tacın haraççıları ise her ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir kapına gelip hazinenin %${Math.round(balance.cities.crown.patrol.tribute.share * 100)}'ini (en az ${balance.cities.crown.patrol.tribute.min} altın) ister. Ödersen o taçla da aran düzelir; reddedersen bozulur.`,
                `The rival crown's tribute collectors, meanwhile, knock at your door every ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} minutes and ask for ${Math.round(balance.cities.crown.patrol.tribute.share * 100)}% of your treasury (at least ${balance.cities.crown.patrol.tribute.min} gold). Pay, and you get on better with that crown too; refuse, and things sour.`,
              )}
            </p>
            <p>{L('Taçla ilişkini en çok, tüccarını onun başkentine göndererek artırırsın: her sefer onun ticaretine yarar.', 'The best way to win a crown\'s favour is to send your merchant to its capital: every trip feeds its trade.')}</p>
          </div>
        )}
        {page === 3 && (
          <div className="away-lines">
            <p>
              {L(
                `Her taç dönem dönem bir malın ticaretini yönetir. O malı satarken taçla ilişkin iyiyse %${Math.round(c.stewardship.bonus * 100)}'e kadar daha pahalıya satarsın; kötüyse daha ucuza. İlişkin ${String(c.stewardship.refuseBelow).replace('-', '−')}'nin altına düşerse o tacın tüccarları seninle alışveriş etmez.`,
                `Each crown oversees the trade in one good, which changes from time to time. When you sell that good, good relations with the crown get you up to ${Math.round(c.stewardship.bonus * 100)}% more; bad ones, less. If your relations fall below ${String(c.stewardship.refuseBelow).replace('-', '−')}, that crown's merchants will not deal with you at all.`,
              )}
            </p>
            <p>{L('Bu yüzden rakip tacı da büsbütün küstürmemek akıllıcadır.', 'So it is wise not to offend the rival crown entirely either.')}</p>
          </div>
        )}
        {page === 4 && (
          <div className="away-lines">
            <p>{L(`Birine biat et. Biat sezon boyunca değişmez; sarayını ${c.requiredForPalaceLevel}. seviyeye yükseltmek için de biat şarttır.`, `Swear fealty to one of them. Fealty holds for the whole season, and you need it to raise your palace to level ${c.requiredForPalaceLevel}.`)}</p>
            <div className="goods choices" role="group" aria-label={L('Taç krallıkları', 'The crown kingdoms')}>
              {infos.map((info, i) => (
                <div key={i} className="good">
                  <CrownBanner world={world} liege={i} size={24} />
                  <b style={{ color: info.color }}>{info.name}</b>
                  <small>{info.ruler}</small>
                  <small>{L(`güç %${Math.round(share[i] * 100)}`, `power ${Math.round(share[i] * 100)}%`)}</small>
                  {asking === i ? (
                    <span className="row">
                      <button
                        className="btn small"
                        onClick={() => {
                          onSwear(i)
                          close()
                        }}
                      >
                        {L('Eminim, biat et', "I'm sure, swear fealty")}
                      </button>
                      <button className="btn small" onClick={() => setAsking(null)}>
                        {L('Vazgeç', 'Cancel')}
                      </button>
                    </span>
                  ) : (
                    <button className="btn small" onClick={() => setAsking(i)}>
                      {L('Biat et', 'Swear fealty')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="away-nav">
          <button className="btn" disabled={page === 0} data-why={L('İlk sayfadasın', 'You are on the first page')} onClick={() => setPage(page - 1)}>
            {L('Geri', 'Back')}
          </button>
          <span className="away-dots" aria-hidden>
            {pages.map((_, i) => (
              <i key={i} className={i === page ? 'on' : undefined} />
            ))}
          </span>
          {page < pages.length - 1 ? (
            <button className="btn primary" onClick={() => setPage(page + 1)}>
              {L('İleri', 'Next')}
            </button>
          ) : (
            <button className="btn" onClick={close}>
              {L('Sonra karar vereceğim', "I'll decide later")}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

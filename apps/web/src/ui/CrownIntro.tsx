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
    { sprite: palaceIn('crimson', 3), x: 44, y: 76 },
    { sprite: palaceIn('royal', 3), x: 198, y: 76 },
    { sprite: squad('crimson', 0, 12), x: 100, y: 90 },
    { sprite: squad('royal', 2, 12), x: 142, y: 90 },
  ]
}

function lordPicture(own: string | undefined): Placed[] {
  return [
    { sprite: palaceIn(own, 2), x: 70, y: 84 },
    { sprite: STRUCTURE_SPRITES.tavern[0], x: 150, y: 80 },
    { sprite: squad('crimson', 1, 6), x: 196, y: 90 },
  ]
}

function marketPicture(): Placed[] {
  return [
    { sprite: STRUCTURE_SPRITES.market[0], x: 70, y: 84 },
    { sprite: STRUCTURE_SPRITES.market[1], x: 170, y: 84 },
    { sprite: STRUCTURE_SPRITES.warehouse[1], x: 120, y: 70 },
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
      { title: 'İki taç', picture: crownsPicture() },
      { title: 'Taçların rekabeti', picture: crownsPicture() },
      { title: 'Lord olmak', picture: lordPicture(kingdom.color) },
      { title: 'Taçların pazarı', picture: marketPicture() },
      { title: 'Tarafını seç', picture: crownsPicture() },
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
            <h2 id="crown-intro-title">Taç krallıkları</h2>
            <small>
              {current.title} · {page + 1} / {pages.length}
            </small>
          </div>
          <button className="btn icon-only" onClick={close} aria-label="Sonra karar ver">
            <Icon name="close" size={16} />
          </button>
        </header>
        <Scene items={current.picture} />
        <h3 className="away-title">{current.title}</h3>
        {page === 0 && (
          <div className="away-lines">
            <p>
              Lordluğun büyüdü; artık diyarın büyükleri seni fark ediyor. Bu topraklarda yalnızca iki krallık var, sen ve öbür oyuncular onların lordlarısınız.
            </p>
            {infos.map((info, i) => {
              const middle = cityCenter(world.cities[i])
              return (
                <p key={i}>
                  <CrownBanner world={world} liege={i} size={16} /> <b style={{ color: info.color }}>{info.name}</b>: hükümdarı {info.ruler}, başkenti {info.capital} (
                  {Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))} karo uzakta).
                </p>
              )
            })}
          </div>
        )}
        {page === 1 && (
          <div className="away-lines">
            <p>
              İki taç diyara hâkim olmak için yarışır. Bir tacın gücü, ona bağlı lordların gücüdür: lordları büyüdükçe, zenginleştikçe ve savaş kazandıkça tacı güçlenir.
              Şu an güç %{Math.round(share[0] * 100)} – %{Math.round(share[1] * 100)}.
            </p>
            <CrownRivalry world={world} online={online} />
          </div>
        )}
        {page === 2 && (
          <div className="away-lines">
            <p>Biat ettiğin tacın devriyeleri sana uğrar; eğlence merkezin varsa içip eğlenir, bahşiş bırakır. Taçla ilişkin iyileştikçe armağanlar da getirir:</p>
            <ul className="tiers">
              {c.gifts.map((g) => (
                <li key={g.at} className="on">
                  <Icon name="chest" size={16} />
                  <span>
                    <b>{g.name}</b> · ilişki {g.at}+
                  </span>
                </li>
              ))}
            </ul>
            <p>Rakip tacın devriyeleri ise kapına gelip haraç ister. Ödersen o taçla da aran düzelir; reddedersen bozulur.</p>
            <p>Taçla ilişkini en çok, tüccarını onun başkentine göndererek artırırsın: her sefer onun ticaretine yarar.</p>
          </div>
        )}
        {page === 3 && (
          <div className="away-lines">
            <p>
              Her taç dönem dönem bir malın ticaretini yönetir. O malı satarken taçla ilişkin iyiyse %{Math.round(c.stewardship.bonus * 100)}'e kadar daha pahalıya
              satarsın; kötüyse daha ucuza. İlişkin {c.stewardship.refuseBelow}'nin altına düşerse o tacın tüccarları seninle alışveriş etmez.
            </p>
            <p>Bu yüzden rakip tacı da büsbütün küstürmemek akıllıcadır.</p>
          </div>
        )}
        {page === 4 && (
          <div className="away-lines">
            <p>Birine biat et. Biat sezon boyunca değişmez; sarayını {c.requiredForPalaceLevel}. seviyeye yükseltmek için de biat şarttır.</p>
            <div className="goods" role="group" aria-label="Taç krallıkları">
              {infos.map((info, i) => (
                <div key={i} className="good">
                  <CrownBanner world={world} liege={i} size={24} />
                  <b style={{ color: info.color }}>{info.name}</b>
                  <small>{info.ruler}</small>
                  <small>güç %{Math.round(share[i] * 100)}</small>
                  {asking === i ? (
                    <span className="row">
                      <button
                        className="btn small"
                        onClick={() => {
                          onSwear(i)
                          close()
                        }}
                      >
                        Eminim, biat et
                      </button>
                      <button className="btn small" onClick={() => setAsking(null)}>
                        Vazgeç
                      </button>
                    </span>
                  ) : (
                    <button className="btn small" onClick={() => setAsking(i)}>
                      Biat et
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="away-nav">
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Geri
          </button>
          <span className="away-dots" aria-hidden>
            {pages.map((_, i) => (
              <i key={i} className={i === page ? 'on' : undefined} />
            ))}
          </span>
          {page < pages.length - 1 ? (
            <button className="btn primary" onClick={() => setPage(page + 1)}>
              İleri
            </button>
          ) : (
            <button className="btn" onClick={close}>
              Sonra karar vereceğim
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

import { ARCADE_GAMES, balance, gameError, fishError, operationSpec } from '@game/shared'
import type { MiniGame } from '@game/shared'
import { useMemo } from 'react'
import { squad } from '../../game/armies'
import { STRUCTURE_SPRITES } from '../../game/buildingSprites'
import { CROWN_ROOFS, cityInfo } from '../../game/cities'
import { Scene } from '../AwayReport'
import type { Placed } from '../AwayReport'
import { L } from '../../lib/i18n'
import { Icon } from '../icons'
import { Dot, SpyPanel } from './diplomacy'
import { FisherPanel } from './Fishing'
import { GAME_ICONS, GAME_NAMES, GamePanel } from './MiniGames'
import type { KingdomInfo } from './online'
import { Placeholder, Section } from './primitives'
import { Subtabs, usePart } from './Subtabs'
import type { HudData } from './tabs'
import { crownKeyOf, tipPreview, waysText } from './crownHouse'

// The menus of the buildings that make nothing: the prison, the entertainment hall and the spy house (the treasury's is
// in treasury.tsx).

// A picture over a building's menu, in the "while you were away" style.
function Picture({ items, mood }: { items: Placed[]; mood: Parameters<typeof Scene>[0]['mood'] }) {
  return (
    <div className="sheet-scene">
      <Scene items={items} mood={mood} />
    </div>
  )
}

// ---- Hapishane ------------------------------------------------------------------------------------------------------

// The rumour the guards pass round about a lord, worded a little differently for each lord and hour.
function rumour(k: KingdomInfo, held: boolean, now: number) {
  const pick = <T,>(xs: T[]) => xs[(k.id * 7 + Math.floor(now / 3_600_000)) % xs.length]
  if (held)
    return pick([
      L(`«${k.name} lordunun kraliçesi zaten bizim zindanımızda.»`, `“${k.name}'s queen is already in our dungeon.”`),
      L(`«${k.name} kraliçesi aşağıda, demir kapının ardında; fidyesini bekliyoruz.»`, `“${k.name}'s queen is downstairs behind the iron door; we await her ransom.”`),
    ])
  if (k.queen)
    return pick([
      L(`«${k.name} lordunun kraliçesi sarayında, rahat uyuyor.»`, `“${k.name}'s queen sleeps soundly in her palace.”`),
      L(`«Diyorlar ki ${k.name} kraliçesi her akşam surlarda geziniyormuş.»`, `“They say ${k.name}'s queen walks the walls every evening.”`),
      L(`«${k.name} sarayında bir kraliçe var; muhafızı az mı çok mu, kim bilir.»`, `“There's a queen in ${k.name}'s palace; few guards or many, who knows.”`),
    ])
  return pick([
    L(`«${k.name} lordunun kraliçesi yok; oradan kaçıracak kimse çıkmaz.»`, `“${k.name} has no queen; nobody to snatch there.”`),
    L(`«${k.name} sarayında kraliçe yok, taht yanı boş.»`, `“No queen in ${k.name}'s palace; the seat beside the throne is empty.”`),
  ])
}

// The prison (CLAUDE.md §9.7): its yard by night, the queens held in it and, from the guards, who of the lords has a
// queen to be taken and how far our spies have got with each.
export function PrisonPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const hostages = kingdom.hostages ?? []
  const fallback = balance.espionage.operations.kidnap.ransom
  const need = operationSpec('kidnap').minStrength
  const color = kingdom.color ?? undefined
  const scene = useMemo<Placed[]>(
    () => [
      { sprite: STRUCTURE_SPRITES.house[2], x: -3, y: 4 },
      { sprite: hostages.length > 0 ? STRUCTURE_SPRITES.prisonFull[0] : STRUCTURE_SPRITES.prison[0], x: 2, y: 4 },
      { sprite: squad(color ?? null, 0, 1), x: 0.2, y: 5.4 },
      { sprite: squad(color ?? null, 2, 1), x: 2.6, y: 3.6 },
      { sprite: squad(color ?? null, 1, 2), x: 4, y: 2 },
      { sprite: STRUCTURE_SPRITES.watchtower[0], x: 6, y: 1 },
    ],
    [color, hostages.length > 0],
  )
  // Every other lord with what the guards say of him and our spies there: the queens within reach first.
  const lords = (online?.kingdoms ?? [])
    .filter((k) => k.id !== online?.me)
    .map((k) => {
      const held = hostages.some((h) => h.of === k.id)
      const spies = online?.missions.filter((m) => m.owner_id === online.me && m.target_id === k.id && !m.ended_at).length ?? 0
      const intel = online?.intel[k.id]
      const best = intel ? Math.max(...Object.values(intel.strength)) : null
      return { k, held, spies, best, rank: held ? 0 : k.queen ? 1 + (spies > 0 ? 1 : 0) + (best ?? 0) / 100 : -1 }
    })
    .sort((a, b) => b.rank - a.rank)
  const ready = lords.filter((l) => !l.held && l.k.queen && l.best !== null && l.best >= need)
  const whisper = lords.filter((l) => !l.held).slice(0, 2).map((l) => rumour(l.k, false, now).slice(1, -1).replace(/\.$/, ''))
  return (
    <>
      <Picture items={scene} mood="intrigue" />
      {whisper.length > 0 && (
        <p className="hint prison-whisper">
          {L(`Gardiyanlar fısıldaşıyor: «${whisper.join('; ')}…»`, `The guards whisper: “${whisper.join('; ')}…”`)}
        </p>
      )}
      <Section title={L('Mahkûmlar', 'Prisoners')} icon="crown" aside={hostages.length > 0 ? L(`${hostages.length} kraliçe`, `${hostages.length} queen${hostages.length === 1 ? '' : 's'}`) : L('boş', 'empty')}>
        {hostages.length === 0 ? (
          <p className="hint">
            {L(
              `Hapishane boş. Casus operasyonuyla bir lordun kraliçesini kaçırırsan burada tutulur; fidyesi o lordun altınının casuslarının tahminine göre %${Math.round(balance.espionage.operations.kidnap.ransomShare * 100)}'ı olur (en az ${balance.espionage.operations.kidnap.ransomMin} altın).`,
              `The prison is empty. If a spy operation kidnaps a lord's queen, she is held here; her ransom is ${Math.round(balance.espionage.operations.kidnap.ransomShare * 100)}% of that lord's gold as your spies reckon it (at least ${balance.espionage.operations.kidnap.ransomMin} gold).`,
            )}
          </p>
        ) : (
          <ul className="places">
            {hostages.map((h) => (
              <li key={h.of}>
                <Icon name="crown" size={24} />
                <span>
                  <b>{L(`${h.name} kraliçesi`, `Queen of ${h.name}`)}</b>
                  <small>{L(`Fidyesi ${h.ransom ?? fallback} altın · kurtarılmayı bekliyor`, `Ransom ${h.ransom ?? fallback} gold · awaiting rescue`)}</small>
                </span>
                <button className="btn small" onClick={() => online?.act({ type: 'release', target: h.of })}>
                  {L('Serbest bırak', 'Release')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {hostages.length > 0 && (
          <p className="hint">
            {L(
              `Kraliçesi elinde olan lordun halkı mutsuzdur. Fidyeyi öderse kraliçe döner ve altın sana gelir; serbest bırakırsan ilişkiniz düzelir (+${balance.espionage.operations.kidnap.release}).`,
              `The people of a lord whose queen you hold are unhappy. If he pays the ransom, the queen goes home and the gold comes to you; if you release her, your relations improve (+${balance.espionage.operations.kidnap.release}).`,
            )}
          </p>
        )}
      </Section>
      {online && (
        <Section title={L('Gardiyanların fısıltıları', 'The guards\' whispers')} icon="eye" aside={L(`kaçırmak için ağ %${need}`, `${need}% network to kidnap`)}>
          {lords.length === 0 ? (
            <p className="hint">{L('Lobide başka lord yok; gardiyanlar zar atıp vakit geçiriyor.', 'No other lords in the lobby; the guards pass the time playing dice.')}</p>
          ) : (
            <ul className="places">
              {lords.map(({ k, held, spies, best }) => (
                <li key={k.id}>
                  <Dot color={k.color} />
                  <span>
                    <b>{k.name}</b>
                    <small>{rumour(k, held, now)}</small>
                    {!held && k.queen && (
                      <small className={best !== null && best >= need ? 'up' : undefined}>
                        {spies === 0
                          ? L('Orada casusumuz yok.', 'We have no spies there.')
                          : best === null
                            ? L(`Orada ${spies} casusumuz var; ağın gücünü bilmiyoruz.`, `We have ${spies} spy${spies === 1 ? '' : 'ies'} there; we do not know the network's strength.`)
                            : best >= need
                              ? L(`En güçlü ağımız %${Math.round(best)}: kaçırmaya yeter.`, `Our strongest network is ${Math.round(best)}%: enough to kidnap.`)
                              : L(`En güçlü ağımız %${Math.round(best)}; %${need} olmalı.`, `Our strongest network is ${Math.round(best)}%; it needs ${need}%.`)}
                      </small>
                    )}
                  </span>
                  {spies > 0 && !held && k.queen && (
                    <button className="btn small" onClick={() => online.loadIntel(k.id)}>
                      {L('Ölç', 'Gauge')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            {ready.length > 0
              ? L(`${ready.map((l) => l.k.name).join(', ')} hazır: kaçırma, Diplomasi sekmesinde lordun sayfasındaki casus operasyonlarından yapılır.`, `${ready.map((l) => l.k.name).join(', ')}: ready. Kidnappings are carried out from the spy operations on the lord's page in the Diplomacy tab.`)
              : L('Bir kraliçeyi kaçırmak için o lordun herhangi bir konusundaki casus ağın bu gücü bulmalı; operasyon Diplomasi sekmesinde lordun sayfasından yapılır.', "To kidnap a queen, your spy network on any one of that lord's topics must reach this strength; the operation is carried out from the lord's page in the Diplomacy tab.")}
          </p>
        </Section>
      )}
    </>
  )
}

// ---- Eğlence merkezi ------------------------------------------------------------------------------------------------

const TAVERN_GAMES: MiniGame[] = ['fishing', ...ARCADE_GAMES]

// The entertainment hall (CLAUDE.md §7.8): where the sworn crown's patrols drink and tip, and where every mini-game can be
// played, one at a time, with its leaderboard.
export function TavernPanel({ data }: { data: HudData }) {
  const { kingdom, now, world } = data
  const [game, setGame] = usePart('tavern', TAVERN_GAMES, 'fishing')
  const liege = kingdom.liege
  const scene = useMemo<Placed[]>(
    () => [
      { sprite: STRUCTURE_SPRITES.house[1], x: -3, y: 4 },
      { sprite: STRUCTURE_SPRITES.tavern[0], x: 2, y: 4 },
      ...(liege != null ? [{ sprite: squad(CROWN_ROOFS[liege % CROWN_ROOFS.length], 0, 3), x: 3.4, y: 2.6 }] : []),
      { sprite: STRUCTURE_SPRITES.market[0], x: 6, y: 1 },
    ],
    [liege],
  )
  const ready = (g: MiniGame) => (g === 'fishing' ? fishError(kingdom, now) : gameError(kingdom, g, now)) === null
  return (
    <>
      <Picture items={scene} mood="house" />
      <Section title={L('Devriyeler', 'Patrols')} icon="banner">
        <p className="hint">
          {liege != null
            ? L(
                `${cityInfo(world, liege).name} devriyesi uğradığında burada içer, eğlenir ve şu an yaklaşık ${tipPreview(kingdom, liege, data.online ?? { kingdoms: [] }, now)} altın bahşiş bırakır (tacın gücüne, hükümdarın huyuna ve taçların rekabetine göre${waysText(crownKeyOf(kingdom), liege, now, 'tip') ? `: ${waysText(crownKeyOf(kingdom), liege, now, 'tip')}` : ''}).`,
                `When the patrol of ${cityInfo(world, liege).name} calls, it drinks and makes merry here and currently leaves a tip of about ${tipPreview(kingdom, liege, data.online ?? { kingdoms: [] }, now)} gold (depending on the crown's power, the ruler's temper and the crowns' rivalry${waysText(crownKeyOf(kingdom), liege, now, 'tip') ? `: ${waysText(crownKeyOf(kingdom), liege, now, 'tip')}` : ''}).`,
              )
            : L('Bir taç krallığına biat edince onun devriyeleri buraya uğrar, eğlenir ve bahşiş bırakır.', 'Once you swear fealty to a crown kingdom, its patrols call here, make merry and leave tips.')}
        </p>
      </Section>
      <Subtabs
        label={L('Oyunlar', 'Games')}
        part={game}
        onPart={setGame}
        parts={TAVERN_GAMES.map((g) => ({ id: g, name: GAME_NAMES[g], icon: GAME_ICONS[g], dot: ready(g) }))}
      />
      <p className="hint">{L('Bütün mini oyunlar burada da oynanır; her oyunun bekleme süresi kendi binasındakiyle ortaktır.', 'Every minigame can be played here too; each game shares its cooldown with its own building.')}</p>
      {game === 'fishing' ? <FisherPanel data={data} hall /> : <GamePanel key={game} game={game} data={data} />}
    </>
  )
}

// ---- Casus evi ------------------------------------------------------------------------------------------------------

// The spy house: the spies at home and away, their missions and networks, the counter-espionage and the news of spies.
export function SpyHousePanel({ data }: { data: HudData }) {
  if (!data.online) return <Placeholder icon="eye" title={L('Lobi yükleniyor', 'Loading lobby')} />
  return <SpyPanel data={data} online={data.online} detail={false} />
}

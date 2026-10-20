import { balance, crisisDecideMs, crisisKey, crisisToll, dilemmaDecideMs, dilemmaOptions } from '@game/shared'
import type { ChoiceOption, CrisisChoice, DilemmaChoice, EconomyEvent, Good, Kingdom } from '@game/shared'
import { EventArt } from './EventArt'
import { StoryScene, fortuneStory } from './storyScenes'
import { DialogFoot } from './DialogQueue'
import { Icon } from './icons'
import { L } from '../lib/i18n'
import { CRISIS_TEXTS, DILEMMA_TEXTS, FORTUNE_TEXTS, RESOURCE_NAMES, SCOPE_NAMES } from './names'

export type FortuneEvent = Extract<EconomyEvent, { kind: 'fortune' }>

const resourceName = (r: string) => (r === 'gold' ? L('altın', 'gold') : RESOURCE_NAMES[r as Good]?.toLowerCase() ?? r)
const pct = (v: number) => L(`${v > 0 ? '+' : '−'}%${Math.round(Math.abs(v) * 100)}`, `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`)
const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`

// What one way of meeting a choice fortune costs, gives and does while the fortune lasts, each effect marked good or bad.
type Effect = { text: string; good: boolean }
function optionEffects(o: ChoiceOption): Effect[] {
  return [
    ...Object.entries(o.cost ?? {}).map(([r, v]) => ({ text: `−${v} ${resourceName(r)}`, good: false })),
    ...Object.entries(o.gain ?? {}).map(([r, v]) => ({ text: `+${v} ${resourceName(r)}`, good: true })),
    ...(o.happiness ? [{ text: L(`mutluluk ${signed(o.happiness)}`, `happiness ${signed(o.happiness)}`), good: o.happiness > 0 }] : []),
    ...(o.templeHappiness ? [{ text: L(`tapınak varsa mutluluk ${signed(o.templeHappiness)}`, `happiness ${signed(o.templeHappiness)} with a temple`), good: o.templeHappiness > 0 }] : []),
    ...(o.trade ? [{ text: L(`ticaret geliri ${pct(o.trade)}`, `trade income ${pct(o.trade)}`), good: o.trade > 0 }] : []),
    ...(o.work ? [{ text: L(`iş gücü ${pct(o.work)}`, `workforce ${pct(o.work)}`), good: o.work > 0 }] : []),
    ...Object.entries(o.output ?? {}).map(([g, v]) => ({ text: L(`${resourceName(g)} üretimi ${pct(v ?? 0)}`, `${resourceName(g)} output ${pct(v ?? 0)}`), good: (v ?? 0) > 0 })),
    ...(o.researchRush ? [{ text: L(`süren araştırma ${Math.round(o.researchRush)} sn erken biter`, `current research finishes ${Math.round(o.researchRush)} s sooner`), good: true }] : []),
    ...(o.people ? [{ text: L(`${o.people} köylü yerleşir (boş ev varsa)`, `${o.people} ${o.people === 1 ? 'villager settles' : 'villagers settle'} (if there are empty homes)`), good: true }] : []),
  ]
}

export const optionNote = (o: ChoiceOption) => optionEffects(o).map((e) => e.text).join(' · ')

// Effects in a line: the good ones blue, the bad ones red.
function Effects({ list }: { list: (Effect | false | '' | undefined)[] }) {
  const shown = list.filter((e): e is Effect => !!e)
  return (
    <>
      {shown.map((e, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span className={e.good ? 'fx-good' : 'fx-bad'}>{e.text}</span>
        </span>
      ))}
    </>
  )
}

// What a crisis would take from the stores if met that way now (CLAUDE.md §9.8): "Yine de ~786 yapı malzemesi gider".
function tollOf(kingdom: Kingdom | null, kind: string, choice: CrisisChoice, now: number): Effect | false {
  if (!kingdom) return false
  const lost = Object.entries(crisisToll(kingdom, kind, choice, now)).filter(([, v]) => (v ?? 0) > 0)
  return lost.length > 0 && { text: L(`yine de ~${lost.map(([r, v]) => `${Math.round(v ?? 0)} ${resourceName(r)}`).join(', ')} gider`, `still ~${lost.map(([r, v]) => `${Math.round(v ?? 0)} ${resourceName(r)}`).join(', ')} lost`), good: false }
}

const tollNote = (kingdom: Kingdom | null, kind: string, choice: CrisisChoice, now: number) => {
  const t = tollOf(kingdom, kind, choice, now)
  return t ? L(` Yine de ${t.text.slice('yine de '.length)}.`, ` Still, ${t.text.slice('still '.length)}.`) : ''
}

const short = (o: ChoiceOption, stock: Kingdom['stock'] | undefined) =>
  Object.entries(o.cost ?? {}).some(([r, v]) => (stock?.[r as keyof Kingdom['stock']] ?? 0) < (v ?? 0))

// A random event as it begins: a banner across the top (green for good fortune, red for bad), its picture filling the
// upper half edge to edge, the news and any choice below.
export function FortuneDialog({
  event,
  now,
  kingdom,
  onAnswer,
  onChoose,
  onClose,
}: {
  event: FortuneEvent
  now: number
  kingdom: Kingdom | null
  onAnswer(choice: CrisisChoice): void
  onChoose(choice: DilemmaChoice): void
  onClose: () => void
}) {
  const f = FORTUNE_TEXTS[event.fortune]
  const key = event.start !== undefined ? crisisKey({ scope: event.scope ?? 'kingdom', start: event.start }) : ''
  const answered = kingdom?.responses?.[key]?.choice
  // A crisis asks what to do (CLAUDE.md §9.8) until its time to answer runs out; a choice asks which of two ways.
  const crisis = event.crisis && event.start !== undefined ? CRISIS_TEXTS[event.fortune] : undefined
  const options = event.dilemma && event.start !== undefined ? dilemmaOptions(event.fortune) : null
  const dilemma = options ? DILEMMA_TEXTS[event.fortune] : undefined
  const deadline = (event.start ?? 0) + (options ? dilemmaDecideMs() : crisisDecideMs())
  const open = !answered && now <= deadline
  const c = balance.institutions.events.crisis
  const soldiers = kingdom?.soldiers ?? 0
  const tone = f?.tone ?? 'good'
  const extra = [
    ...Object.entries(event.lost ?? {})
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([g, v]) => L(`${Math.round(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} kayboldu`, `${Math.round(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} lost`)),
    ...(event.gold ? [L(`+${event.gold} altın`, `+${event.gold} gold`)] : []),
  ]
  const left = L(`${Math.max(0, Math.ceil((deadline - now) / 1000))} sn`, `${Math.max(0, Math.ceil((deadline - now) / 1000))} s`)
  return (
    <div className="modal" role="dialog" aria-labelledby="fortune-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`dialog frame fortune-dialog ${tone}`}>
        <header className="fortune-banner">
          <Icon name={f?.icon ?? 'star'} size={32} />
          <div>
            <small>
              {tone === 'good' ? L('Hayırlı bir haber', 'Good tidings') : L('Kötü bir haber', 'Ill tidings')} · {SCOPE_NAMES[event.scope ?? 'kingdom']}
            </small>
            <h2 id="fortune-title">{f?.title ?? L('Beklenmedik bir olay', 'An unexpected event')}</h2>
          </div>
        </header>
        <div className="fortune-art">
          {(() => {
            // The fortunes added with the expeditions are drawn like the reports' pictures (storyScenes.tsx).
            const story = fortuneStory(event.fortune, kingdom?.color)
            return story ? <StoryScene story={story} id={`${event.fortune}:${kingdom?.color}`} /> : <EventArt kind={event.fortune} />
          })()}
        </div>
        <div className="fortune-body">
          <p>{f?.text}</p>
          <p className="hint">{event.scope === 'lobby' ? L('Bu olay lobideki bütün lordları etkiliyor.', 'This event affects every lord in the lobby.') : L('Bu olay yalnızca senin topraklarını etkiliyor.', 'This event affects only your lands.')}</p>
          {extra.length > 0 && <p className={tone === 'good' ? 'up' : 'down'}>{extra.join(' · ')}</p>}
          <p className="hint">{L(`Yaklaşık ${Math.max(1, Math.round((event.until - now) / 60_000))} dakika sürecek.`, `Lasts about ${Math.max(1, Math.round((event.until - now) / 60_000))} min.`)}</p>
          {crisis && (
            <div className="crisis">
              {answered ? (
                <p className={answered === 'none' ? 'down' : 'up'}>
                  {answered === 'none' ? L('Bir şey yapılmadı; olay etkisini gösterecek.', 'Nothing was done; the event will take its toll.') : answered === 'villagers' || answered === 'army' ? L(`${crisis[answered]}: asıl zarar önlendi.${tollNote(kingdom, event.fortune, answered, now)}`, `${crisis[answered]}: the worst was averted.${tollNote(kingdom, event.fortune, answered, now)}`) : ''}
                </p>
              ) : now > deadline ? (
                <p className="down">{L('Karar vermek için geç kaldın; olay etkisini gösterdi.', 'Too late to decide; the event has taken its toll.')}</p>
              ) : (
                <>
                  <p className="hint">
                    {L(`Ne yapalım? ${left} içinde karar verilmezse`, `What shall we do? If no decision is made within ${left},`)}{' '}
                    {kingdom?.steward ? L(`kâhyan köylüleri seferber eder (${balance.institutions.events.crisis.steward.fee.gold} altın).`, `your steward calls out the villagers (${balance.institutions.events.crisis.steward.fee.gold} gold).`) : L('hiçbir şey yapılmaz.', 'nothing is done.')}
                  </p>
                  <div className="choices">
                    <button className="btn crisis-choice" onClick={() => onAnswer('villagers')}>
                      <b>{crisis.villagers}</b>
                      <small>
                        <Effects
                          list={[
                            { text: L('asıl zarar önlenir', 'the worst is averted'), good: true },
                            { text: L(`${Math.round(c.villagers.seconds / 60)} dakika iş gücü %${Math.round(-c.villagers.work * 100)} düşer`, `workforce −${Math.round(-c.villagers.work * 100)}% for ${Math.round(c.villagers.seconds / 60)} min`), good: false },
                            tollOf(kingdom, event.fortune, 'villagers', now),
                          ]}
                        />
                      </small>
                    </button>
                    <button className="btn crisis-choice" disabled={soldiers < c.army.minSoldiers} data-why={L(`Sarayda en az ${c.army.minSoldiers} asker olmalı (${soldiers} var)`, `Needs at least ${c.army.minSoldiers} soldiers at the palace (${soldiers} there)`)} onClick={() => onAnswer('army')}>
                      <b>{crisis.army}</b>
                      <small>
                        {soldiers < c.army.minSoldiers ? (
                          L(`Sarayda en az ${c.army.minSoldiers} asker olmalı.`, `Needs at least ${c.army.minSoldiers} soldiers at the palace.`)
                        ) : (
                          <Effects
                            list={[
                              { text: L('asıl zarar önlenir', 'the worst is averted'), good: true },
                              { text: L(`${c.army.loss}, nadiren ${c.army.loss + 1} asker ölür`, `${c.army.loss}, rarely ${c.army.loss + 1}, soldiers die`), good: false },
                              { text: L(`ordu ${Math.round(c.army.lockSeconds / 60)} dakika sefere çıkamaz`, `the army cannot march for ${Math.round(c.army.lockSeconds / 60)} min`), good: false },
                              tollOf(kingdom, event.fortune, 'army', now),
                            ]}
                          />
                        )}
                      </small>
                    </button>
                    <button className="btn crisis-choice" onClick={() => onAnswer('none')}>
                      <b>{crisis.none}</b>
                      <small>
                        <Effects
                          list={[
                            { text: L('kimse yorulmaz', 'nobody breaks a sweat'), good: true },
                            { text: L('olayın kötü etkisi tam yaşanır', 'the event takes its full toll'), good: false },
                            tollOf(kingdom, event.fortune, 'none', now),
                          ]}
                        />
                      </small>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {options && dilemma && (
            <div className="crisis">
              {answered === 'a' || answered === 'b' ? (
                <p className="up">
                  <b>{dilemma[answered]}</b>: {dilemma.done[answered]}
                </p>
              ) : now > deadline ? (
                <p className="hint">{L('Karar verilmedi; olay kendi hâlinde sürüyor.', 'No decision made; the event runs its course.')}</p>
              ) : (
                <>
                  <p className="hint">{L(`Ne yapalım? ${left} içinde karar verilmezse hiçbir şey yapılmaz.`, `What shall we do? If no decision is made within ${left}, nothing is done.`)}</p>
                  <div className="choices">
                    {(['a', 'b'] as const).map((way) => {
                      const lack = short(options[way], kingdom?.stock)
                      return (
                        <button key={way} className="btn crisis-choice" disabled={lack} data-why={L(`Yetersiz kaynak: ${optionNote({ cost: options[way].cost })}`, `Not enough resources: ${optionNote({ cost: options[way].cost })}`)} onClick={() => onChoose(way)}>
                          <b>{dilemma[way]}</b>
                          <small>{lack ? L(`Yetersiz kaynak: ${optionNote({ cost: options[way].cost })}`, `Not enough resources: ${optionNote({ cost: options[way].cost })}`) : optionEffects(options[way]).length > 0 ? <Effects list={optionEffects(options[way])} /> : L('Bir bedeli yok.', 'It costs nothing.')}</small>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFoot onNext={onClose} label={(crisis || options) && open ? L('Sonra', 'Later') : undefined} />
        </div>
      </section>
    </div>
  )
}

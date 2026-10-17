import { balance, crisisDecideMs, crisisKey, dilemmaDecideMs, dilemmaOptions } from '@game/shared'
import type { ChoiceOption, CrisisChoice, DilemmaChoice, EconomyEvent, Good, Kingdom } from '@game/shared'
import { EventArt } from './EventArt'
import { StoryScene, fortuneStory } from './storyScenes'
import { DialogFoot } from './DialogQueue'
import { Icon } from './icons'
import { CRISIS_TEXTS, DILEMMA_TEXTS, FORTUNE_TEXTS, RESOURCE_NAMES, SCOPE_NAMES } from './names'

export type FortuneEvent = Extract<EconomyEvent, { kind: 'fortune' }>

const resourceName = (r: string) => (r === 'gold' ? 'altın' : RESOURCE_NAMES[r as Good]?.toLowerCase() ?? r)
const pct = (v: number) => `${v > 0 ? '+' : '−'}%${Math.round(Math.abs(v) * 100)}`
const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`

// What one way of meeting a choice fortune costs, gives and does while the fortune lasts, in a line.
export function optionNote(o: ChoiceOption) {
  return [
    ...Object.entries(o.cost ?? {}).map(([r, v]) => `−${v} ${resourceName(r)}`),
    ...Object.entries(o.gain ?? {}).map(([r, v]) => `+${v} ${resourceName(r)}`),
    ...(o.happiness ? [`mutluluk ${signed(o.happiness)}`] : []),
    ...(o.templeHappiness ? [`tapınak varsa mutluluk ${signed(o.templeHappiness)}`] : []),
    ...(o.trade ? [`ticaret geliri ${pct(o.trade)}`] : []),
    ...(o.work ? [`iş gücü ${pct(o.work)}`] : []),
    ...Object.entries(o.output ?? {}).map(([g, v]) => `${resourceName(g)} üretimi ${pct(v ?? 0)}`),
    ...(o.researchRush ? [`süren araştırma ${Math.round(o.researchRush)} sn erken biter`] : []),
    ...(o.people ? [`${o.people} köylü yerleşir (boş ev varsa)`] : []),
  ].join(' · ')
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
      .map(([g, v]) => `${Math.round(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} kayboldu`),
    ...(event.gold ? [`+${event.gold} altın`] : []),
  ]
  const left = `${Math.max(0, Math.ceil((deadline - now) / 1000))} sn`
  return (
    <div className="modal" role="dialog" aria-labelledby="fortune-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`dialog frame fortune-dialog ${tone}`}>
        <header className="fortune-banner">
          <Icon name={f?.icon ?? 'star'} size={32} />
          <div>
            <small>
              {tone === 'good' ? 'Hayırlı bir haber' : 'Kötü bir haber'} · {SCOPE_NAMES[event.scope ?? 'kingdom']}
            </small>
            <h2 id="fortune-title">{f?.title ?? 'Beklenmedik bir olay'}</h2>
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
          <p className="hint">{event.scope === 'lobby' ? 'Bu olay lobideki bütün lordları etkiliyor.' : 'Bu olay yalnızca senin topraklarını etkiliyor.'}</p>
          {extra.length > 0 && <p className={tone === 'good' ? 'up' : 'down'}>{extra.join(' · ')}</p>}
          <p className="hint">Yaklaşık {Math.max(1, Math.round((event.until - now) / 60_000))} dakika sürecek.</p>
          {crisis && (
            <div className="crisis">
              {answered ? (
                <p className={answered === 'none' ? 'down' : 'up'}>
                  {answered === 'none' ? 'Bir şey yapılmadı; olay etkisini gösterecek.' : answered === 'villagers' || answered === 'army' ? `${crisis[answered]}: zarar önlendi.` : ''}
                </p>
              ) : now > deadline ? (
                <p className="down">Karar vermek için geç kaldın; olay etkisini gösterdi.</p>
              ) : (
                <>
                  <p className="hint">
                    Ne yapalım? {left} içinde karar verilmezse{' '}
                    {kingdom?.steward ? `kâhyan köylüleri seferber eder (${balance.institutions.events.crisis.steward.fee.gold} altın).` : 'hiçbir şey yapılmaz.'}
                  </p>
                  <div className="choices">
                    <button className="btn crisis-choice" onClick={() => onAnswer('villagers')}>
                      <b>{crisis.villagers}</b>
                      <small>
                        Zarar önlenir; {Math.round(c.villagers.seconds / 60)} dakika iş gücü %{Math.round(-c.villagers.work * 100)} düşer.
                      </small>
                    </button>
                    <button className="btn crisis-choice" disabled={soldiers < c.army.minSoldiers} onClick={() => onAnswer('army')}>
                      <b>{crisis.army}</b>
                      <small>
                        {soldiers < c.army.minSoldiers
                          ? `Sarayda en az ${c.army.minSoldiers} asker olmalı.`
                          : `Zarar önlenir; ${c.army.loss}, nadiren ${c.army.loss + 1} asker kaybedilir ve ordu ${Math.round(c.army.lockSeconds / 60)} dakika sefere çıkamaz.`}
                      </small>
                    </button>
                    <button className="btn crisis-choice" onClick={() => onAnswer('none')}>
                      <b>{crisis.none}</b>
                      <small>Kimse yorulmaz; ama olayın kötü etkisi tam olarak yaşanır.</small>
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
                <p className="hint">Karar verilmedi; olay kendi hâlinde sürüyor.</p>
              ) : (
                <>
                  <p className="hint">Ne yapalım? {left} içinde karar verilmezse hiçbir şey yapılmaz.</p>
                  <div className="choices">
                    {(['a', 'b'] as const).map((way) => {
                      const lack = short(options[way], kingdom?.stock)
                      return (
                        <button key={way} className="btn crisis-choice" disabled={lack} onClick={() => onChoose(way)}>
                          <b>{dilemma[way]}</b>
                          <small>{lack ? `Yetersiz kaynak: ${optionNote({ cost: options[way].cost })}` : optionNote(options[way]) || 'Bir bedeli yok.'}</small>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFoot onNext={onClose} label={(crisis || options) && open ? 'Sonra' : undefined} />
        </div>
      </section>
    </div>
  )
}

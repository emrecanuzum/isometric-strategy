// Reasons a disabled button shows on hover or tap (`data-why`, lib/whyTooltip.ts; CLAUDE.md §11).
import { maxConstructions, queued, type BuildError, type Cost, type Kingdom, type Resource, type Stock } from '@game/shared'
import { RESOURCE_NAMES } from './names'
import { L, locale } from '../lib/i18n'

const fmt = (n: number) => Math.ceil(n).toLocaleString(locale())

// "Yeterli altın yok (eksik: 120)" for each resource the stock lacks; null when the cost is covered.
export function lackWhy(stock: Stock, cost: Cost | undefined): string | null {
  if (!cost) return null
  const short = (Object.entries(cost) as [Resource, number][]).filter(([r, v]) => (v ?? 0) > (stock[r] ?? 0))
  if (!short.length) return null
  const name = (r: Resource) => RESOURCE_NAMES[r].toLocaleLowerCase(locale())
  if (short.length === 1) {
    const [r, v] = short[0]
    return L(`Yeterli ${name(r)} yok (eksik: ${fmt(v - (stock[r] ?? 0))})`, `Not enough ${name(r)} (short by ${fmt(v - (stock[r] ?? 0))})`)
  }
  const list = short.map(([r, v]) => `${fmt(v - (stock[r] ?? 0))} ${name(r)}`).join(', ')
  return L(`Kaynak yetmiyor; eksik: ${list}`, `Not enough resources; short by: ${list}`)
}

// "3 dk 20 sn sonra" for a wait in milliseconds.
export function waitWhy(ms: number, prefix = ''): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = h ? [L(`${h} sa`, `${h} h`), m ? L(`${m} dk`, `${m} min`) : ''] : m ? [L(`${m} dk`, `${m} min`), sec ? L(`${sec} sn`, `${sec} s`) : ''] : [L(`${sec} sn`, `${sec} s`)]
  return L(`${prefix}${parts.filter(Boolean).join(' ')} sonra`, `${prefix}available in ${parts.filter(Boolean).join(' ')}`)
}

const BUILD_WHY: Record<BuildError, string> = {
  palace: L('Önce sarayını yerleştir', 'Place your palace first'),
  unique: L('Bundan yalnızca bir tane kurulabilir', 'Only one of these can be built'),
  cost: L('Kaynak yetmiyor', 'Not enough resources'),
  queue: L('İnşaat yeri dolu', 'All building slots are busy'),
  spot: L('Buraya inşa edilemez', 'Cannot build here'),
  top: L('En yüksek seviyede', 'Already at the highest level'),
  busy: L('İnşaat sürüyor', 'Construction under way'),
  locked: L('Daha yüksek seviye saray ister', 'Needs a higher-level palace'),
  limit: L('Bu yapının sınırı dolu; sarayı yükselt', 'This building is at its limit; upgrade the palace'),
  liege: L('Önce bir taç krallığına biat et (Saray → Bağlılık)', 'Swear fealty to a crown kingdom first (Palace → Allegiance)'),
  queen: L('Sarayı 3. seviyeye yükseltmek için sarayda bir kraliçe olmalı (Halk → Kraliçe)', 'The palace needs a queen in residence to reach level 3 (People → Queen)'),
}

// Why building, raising or moving is refused, with the numbers: what is missing, how full the queue is.
export function buildWhy(error: BuildError | string | null, kingdom: Kingdom, now: number, cost?: Cost): string | undefined {
  if (!error) return undefined
  if (error === 'cost') return lackWhy(kingdom.stock, cost) ?? BUILD_WHY.cost
  if (error === 'queue') return L(`İnşaat yeri dolu (${queued(kingdom, now).length}/${maxConstructions(kingdom, now)})`, `All building slots are busy (${queued(kingdom, now).length}/${maxConstructions(kingdom, now)})`)
  return BUILD_WHY[error as BuildError] ?? L('Şu an olmaz', 'Not right now')
}

// A reason written as a clause ("altın yetmiyor") as a sentence ("Altın yetmiyor").
export const sentence = (s: string | undefined | null) => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : undefined)

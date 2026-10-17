// Reasons a disabled button shows on hover or tap (`data-why`, lib/whyTooltip.ts; CLAUDE.md §11).
import { maxConstructions, queued, type BuildError, type Cost, type Kingdom, type Resource, type Stock } from '@game/shared'
import { RESOURCE_NAMES } from './names'

const fmt = (n: number) => Math.ceil(n).toLocaleString('tr-TR')

// "Yeterli altın yok (eksik: 120)" for each resource the stock lacks; null when the cost is covered.
export function lackWhy(stock: Stock, cost: Cost | undefined): string | null {
  if (!cost) return null
  const short = (Object.entries(cost) as [Resource, number][]).filter(([r, v]) => (v ?? 0) > (stock[r] ?? 0))
  if (!short.length) return null
  const name = (r: Resource) => RESOURCE_NAMES[r].toLowerCase()
  if (short.length === 1) {
    const [r, v] = short[0]
    return `Yeterli ${name(r)} yok (eksik: ${fmt(v - (stock[r] ?? 0))})`
  }
  return `Kaynak yetmiyor; eksik: ${short.map(([r, v]) => `${fmt(v - (stock[r] ?? 0))} ${name(r)}`).join(', ')}`
}

// "3 dk 20 sn sonra" for a wait in milliseconds.
export function waitWhy(ms: number, prefix = ''): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = h ? [`${h} sa`, m ? `${m} dk` : ''] : m ? [`${m} dk`, sec ? `${sec} sn` : ''] : [`${sec} sn`]
  return `${prefix}${parts.filter(Boolean).join(' ')} sonra`
}

const BUILD_WHY: Record<BuildError, string> = {
  palace: 'Önce sarayını yerleştir',
  unique: 'Bundan yalnızca bir tane kurulabilir',
  cost: 'Kaynak yetmiyor',
  queue: 'İnşaat yeri dolu',
  spot: 'Buraya inşa edilemez',
  top: 'En yüksek seviyede',
  busy: 'İnşaat sürüyor',
  locked: 'Daha yüksek seviye saray ister',
  limit: 'Bu yapının sınırı dolu; sarayı yükselt',
  liege: 'Önce bir taç krallığına biat et (Saray → Bağlılık)',
  queen: 'Sarayı 3. seviyeye yükseltmek için sarayda bir kraliçe olmalı (Halk → Kraliçe)',
}

// Why building, raising or moving is refused, with the numbers: what is missing, how full the queue is.
export function buildWhy(error: BuildError | string | null, kingdom: Kingdom, now: number, cost?: Cost): string | undefined {
  if (!error) return undefined
  if (error === 'cost') return lackWhy(kingdom.stock, cost) ?? BUILD_WHY.cost
  if (error === 'queue') return `İnşaat yeri dolu (${queued(kingdom, now).length}/${maxConstructions(kingdom, now)})`
  return BUILD_WHY[error as BuildError] ?? 'Şu an olmaz'
}

// A reason written as a clause ("altın yetmiyor") as a sentence ("Altın yetmiyor").
export const sentence = (s: string | undefined | null) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : undefined)

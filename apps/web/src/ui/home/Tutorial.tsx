import { useState } from 'react'
import { balance } from '@game/shared'
import { Icon } from '../icons'
import type { IconName } from '../icons'

// How to play, a page at a time.

const { stageParcels, parcelTiles } = balance.territory
const first = stageParcels[0]
const last = stageParcels[stageParcels.length - 1]

const PAGES: { icon: IconName; title: string; text: string[] }[] = [
  {
    icon: 'time',
    title: 'Dünya hiç durmaz',
    text: [
      'Her lobi iki haftalık bir sezondur. Oyunda bir gün gerçekte bir saat sürer; saat ve gün herkes için aynıdır.',
      'Oyunu kapattığında da lordluğun yaşamaya devam eder: inşaatlar biter, tüccarın satış yapar, köylüler üretir.',
    ],
  },
  {
    icon: 'pin',
    title: 'Yerini seç',
    text: [
      'Lobiye girince sana rastgele bir yer gösterilir. Beğenmezsen başka bir yer keşfedebilirsin; gördüğün yerlerden birinde lordluğunu kurarsın.',
      'Yerin çevresindeki arazi üretimi belirler: nehir ve çayır yemek, orman yapı malzemesi, dağ savaş malzemesi verir.',
    ],
  },
  {
    icon: 'crown',
    title: 'Saray ve hudut',
    text: [
      'İlk iş sarayını hudut içinde istediğin yere yerleştir. Yalnızca kendi hududunun içine inşa edebilirsin.',
      `Hudut ${first}×${first} parselle başlar (1 parsel = ${parcelTiles}×${parcelTiles} karo) ve sarayı yükselttikçe ${last}×${last} parsele kadar büyür.`,
    ],
  },
  {
    icon: 'build',
    title: 'İnşa et ve üret',
    text: [
      'Evler köylü verir; tarla, oduncu kampı ve silah atölyesi köylüleri işçi olarak çalıştırır. Köylü yetmezse binalar yavaşlar.',
      'İnşaat ve yükseltme altın ile yapı malzemesi ister ve süre alır. Aynı anda en fazla iki inşaat yürür. Bir binaya tıklayarak işçisini ve ürününü ayarla.',
    ],
  },
  {
    icon: 'trade',
    title: 'Ticaret',
    text: [
      'Lordluğun ücretsiz bir ticaret noktasıyla başlar. Satılacak malı seç; tüccar düzenli aralıklarla gidip satar ve altın getirir.',
      'Kıyıdaki iskele arsana iskele kurarsan balık tutarak yemek üretirsin.',
    ],
  },
  {
    icon: 'banner',
    title: 'Komşuların',
    text: [
      'Lobideki diğer lordların hudutları haritada kendi renkleriyle görünür. Depolarını göremezsin.',
      'Sol alttaki sohbetten lobiyle konuşabilirsin. Ordular, diplomasi ve entrika yakında geliyor.',
    ],
  },
]

export function Tutorial() {
  const [page, setPage] = useState(0)
  const { icon, title, text } = PAGES[page]
  return (
    <div className="home-body tutorial">
      <div className="tutorial-page">
        <Icon name={icon} size={48} />
        <h3>{title}</h3>
        {text.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="row spread">
        <button className="btn small" onClick={() => setPage(page - 1)} disabled={page === 0}>
          Geri
        </button>
        <span className="tutorial-dots" aria-label={`Sayfa ${page + 1} / ${PAGES.length}`}>
          {PAGES.map((_, i) => (
            <i key={i} className={i === page ? 'on' : undefined} />
          ))}
        </span>
        <button className="btn small" onClick={() => setPage(page + 1)} disabled={page === PAGES.length - 1}>
          İleri
        </button>
      </div>
    </div>
  )
}

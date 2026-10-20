import { useState } from 'react'
import { balance } from '@game/shared'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { L } from '../../lib/i18n'

// How to play, a page at a time.

const { stageParcels, parcelTiles } = balance.territory
const first = stageParcels[0]
const last = stageParcels[stageParcels.length - 1]

const PAGES: { icon: IconName; title: string; text: string[] }[] = [
  {
    icon: 'time',
    title: L('Dünya hiç durmaz', 'The world never stops'),
    text: [
      L('Her lobi iki haftalık bir sezondur. Oyunda bir gün (gece ve gündüz) gerçekte bir saat sürer ve takvimde bir yıldır: aylar ve mevsimler o saatin içinde geçer, hanedan da bu yıllarla yaşlanır. Saat ve tarih herkes için aynıdır.', 'Every lobby is a two-week season. A day in the game (night and day) lasts one real hour and is a year on the calendar: the months and seasons pass within that hour, and your dynasty ages by those years. The time and date are the same for everyone.'),
      L('Oyunu kapattığında da lordluğun yaşamaya devam eder: inşaatlar biter, tüccarın satış yapar, köylüler üretir.', 'Your lordship lives on after you close the game: buildings are finished, your merchant sells, villagers produce.'),
    ],
  },
  {
    icon: 'pin',
    title: L('Yerini seç', 'Choose your site'),
    text: [
      L('Lobiye girince sana rastgele bir yer gösterilir. Beğenmezsen başka bir yer keşfedebilirsin; gördüğün yerlerden birinde lordluğunu kurarsın.', 'When you enter a lobby you are shown a random site. If you don’t like it you can explore another; you found your lordship at one of the sites you have seen.'),
      L('Yerin çevresindeki arazi üretimi belirler: nehir ve çayır yemek, orman yapı malzemesi, dağ savaş malzemesi verir.', 'The land around the site decides production: rivers and meadows give food, forests building materials, mountains war materials.'),
    ],
  },
  {
    icon: 'crown',
    title: L('Saray ve hudut', 'Palace and border'),
    text: [
      L('İlk iş sarayını hudut içinde istediğin yere yerleştir. Yalnızca kendi hududunun içine inşa edebilirsin.', 'First, place your palace anywhere inside your border. You can only build inside your own border.'),
      L(
        `Hudut ${first}×${first} parselle başlar (1 parsel = ${parcelTiles}×${parcelTiles} karo) ve sarayı yükselttikçe ${last}×${last} parsele kadar büyür.`,
        `The border starts at ${first}×${first} parcels (1 parcel = ${parcelTiles}×${parcelTiles} tiles) and grows to ${last}×${last} parcels as you upgrade the palace.`,
      ),
    ],
  },
  {
    icon: 'build',
    title: L('İnşa et ve üret', 'Build and produce'),
    text: [
      L('Evler köylü verir; tarla, oduncu kampı ve silah atölyesi köylüleri işçi olarak çalıştırır. Köylü yetmezse binalar yavaşlar.', 'Houses bring villagers; fields, lumber camps and forges put them to work. Without enough villagers, buildings slow down.'),
      L('İnşaat ve yükseltme altın ile yapı malzemesi ister ve süre alır. Aynı anda en fazla iki inşaat yürür. Bir binaya tıklayarak işçisini ve ürününü ayarla.', 'Building and upgrading cost gold and building materials and take time. At most two building projects run at once. Click a building to set its workers and product.'),
    ],
  },
  {
    icon: 'trade',
    title: L('Ticaret', 'Trade'),
    text: [
      L('Lordluğun ücretsiz bir ticaret noktasıyla başlar. Satılacak malı seç; tüccar düzenli aralıklarla gidip satar ve altın getirir.', 'Your lordship starts with a free trading post. Choose a good to sell; the merchant goes off at regular intervals, sells it and brings back gold.'),
      L('Kıyıdaki iskele arsana iskele kurarsan balık tutarak yemek üretirsin.', 'Build a dock on your dock plot by the shore and you produce food by fishing.'),
    ],
  },
  {
    icon: 'banner',
    title: L('Komşuların', 'Your neighbours'),
    text: [
      L('Lobideki diğer lordların hudutları haritada kendi renkleriyle görünür. Depolarını göremezsin.', 'The other lords\' borders show on the map in their colours. You cannot see their stores.'),
      L('Sol alttaki sohbetten lobiyle konuşabilirsin. Ordular, diplomasi ve entrika yakında geliyor.', 'You can talk to the lobby in the chat at the bottom left. Armies, diplomacy and intrigue are coming soon.'),
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
        <button className="btn small" onClick={() => setPage(page - 1)} disabled={page === 0} data-why={L('İlk sayfadasın', 'This is the first page')}>
          {L('Geri', 'Back')}
        </button>
        <span className="tutorial-dots" aria-label={L(`Sayfa ${page + 1} / ${PAGES.length}`, `Page ${page + 1} / ${PAGES.length}`)}>
          {PAGES.map((_, i) => (
            <i key={i} className={i === page ? 'on' : undefined} />
          ))}
        </span>
        <button className="btn small" onClick={() => setPage(page + 1)} disabled={page === PAGES.length - 1} data-why={L('Son sayfadasın', 'This is the last page')}>
          {L('İleri', 'Next')}
        </button>
      </div>
    </div>
  )
}

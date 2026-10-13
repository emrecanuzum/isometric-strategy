import { balance } from '@game/shared'
import type { Envoy as EnvoyRow, Operation, PeaceTerms, SpyTopic } from '@game/shared'
import type { Notice } from '../net/online'
import { Icon } from './icons'
import type { IconName } from './icons'
import { RESOURCE_NAMES } from './names'
import { ENVOY_NAMES, OPERATION_NAMES, TOPIC_NAMES, describeTerms } from './hud/diplomacy'
import type { Online } from './hud/online'

// The envoy's dialogs: one notice at a time from the player's inbox (proposals to answer, wars declared, battles
// beginning and ending, spies caught). Closing one marks it read.

const fmt = (v: number) => Math.round(v).toLocaleString('tr-TR')

// What the insulting envoy says at the gate (one of these, by the envoy's number).
const INSULTS = [
  'Efendim der ki: kralınızın sakalı keçininkinden seyrek, ordunuz da tavuk kümesinden düzensiz!',
  'Efendim der ki: sarayınızın kokusu üç vadi öteden duyuluyor; hamamı hiç mi duymadınız?',
  'Efendim der ki: atalarınız domuz güderdi, siz ise onları bile güdemezsiniz!',
  'Efendim der ki: sancağınızı gördük, sandık ki çamaşır asmışsınız.',
  'Efendim der ki: askerleriniz tahta kılıçla bile birbirini yaralar!',
  'Efendim der ki: hazineniz fare yuvasından boş, tüccarınız da dilenciden fakir.',
  'Efendim der ki: kralınız ata binemez, eşeği bile ondan utanır!',
  'Efendim der ki: surlarınızı çocuklar bile kumdan daha sağlam yapar.',
]


export function describe(n: Notice, online: Online): { icon: IconName; title: string; text: string } {
  const p = n.payload as Record<string, never>
  const kind = (k: unknown) => ENVOY_NAMES[k as EnvoyRow['kind']] ?? String(k)
  const me = online.kingdoms.find((k) => k.id === online.me)?.name
  switch (n.kind) {
    case 'envoy_proposal':
      return {
        icon: 'scroll',
        title: `${p.from} elçisi geldi`,
        text:
          p.kind === 'tribute'
            ? `${p.from} her üretim turunda ${p.gold} altın haraç istiyor. Kabul edersen ilişkiniz ${balance.diplomacy.tribute.accept} düşer; reddedersen ${balance.diplomacy.tribute.reject} düşer.`
            : p.kind === 'alliance'
              ? `${p.from} seninle ittifak kurmak istiyor. Müttefik orduları birbirini korur.`
              : `${p.from} savaşı bitirmek için barış teklif ediyor: ${describeTerms(p.terms as PeaceTerms | null)}.`,
      }
    case 'envoy_courtesy':
      return p.kind === 'gift'
        ? { icon: 'gold', title: `${p.from} hediye gönderdi`, text: `${p.gold} altın hazinene eklendi; ilişkiniz iyileşti.` }
        : { icon: 'scroll', title: `${p.from} elçisi geldi`, text: `${p.from} ilişkilerinizi geliştirmek istiyor (+${balance.diplomacy.improve.gain}).` }
    case 'envoy_answer':
      return {
        icon: p.accepted ? 'happy' : 'unhappy',
        title: `${p.by}: ${kind(p.kind)} ${p.accepted ? 'kabul edildi' : p.expired ? 'cevapsız kaldı' : 'reddedildi'}`,
        text: p.accepted
          ? p.kind === 'tribute'
            ? `${p.by} artık her turda ${p.gold} altın ödeyecek.`
            : p.kind === 'alliance'
              ? `${p.by} artık müttefikin.`
              : 'Savaş bitti.'
          : p.kind === 'tribute'
            ? `İlişkiniz ${-balance.diplomacy.tribute.reject} düştü.`
            : '',
      }
    case 'war_declared':
      return {
        icon: 'swords',
        title: 'Savaş ilan edildi!',
        text: `${p.by}, ${p.on === me ? 'sana' : `${p.on} krallığına`} savaş ilan etti${p.claim ? '' : ' (hiçbir gerekçe göstermeden)'}.`,
      }
    case 'peace_enforced':
      return { icon: 'banner', title: 'Barış dayatıldı', text: `${p.from} savaşı ezici bir üstünlükle kazandı ve barışı dayattı: ${describeTerms(p.terms as PeaceTerms | null)}.` }
    case 'operation_foiled':
      return { icon: 'eye', title: 'Casus operasyonu önlendi', text: `${p.by} adına ${OPERATION_NAMES[p.op as Operation].toLowerCase()} isteyen bir casus yakalandı. Artık onlara karşı savaş gerekçen var.` }
    case 'operation_struck':
      return {
        icon: 'warn',
        title: p.op === 'kidnap' ? 'Kraliçen kaçırıldı!' : p.op === 'revolt' ? 'Halk ayaklandı!' : 'Sabotaj!',
        text:
          p.op === 'kidnap'
            ? `${p.by} casusları kraliçeni kaçırdı. Fidye ödeyebilir ya da savaş açabilirsin (savaş gerekçen var).`
            : p.op === 'revolt'
              ? 'Kışkırtıcılar halkı ayaklandırdı: üretim bir süre yarıya indi.'
              : p.op === 'burn'
                ? 'Kimliği belirsiz sabotajcılar depolarını ateşe verdi.'
                : 'Sabotajcılar inşaatlarını geciktirdi.',
      }
    case 'ransom_paid':
      return { icon: 'gold', title: 'Fidye ödendi', text: `${p.by} kraliçesi için ${p.gold} altın fidye ödedi.` }
    case 'queen_released':
      return { icon: 'happy', title: 'Kraliçen döndü', text: `${p.by} kraliçeni serbest bıraktı.` }
    case 'alliance_broken':
      return { icon: 'unhappy', title: 'İttifak bozuldu', text: `${p.by} ittifakınızı bozdu.` }
    case 'tribute_ended':
      return { icon: 'gold', title: 'Haraç bitti', text: p.renege ? `${p.by} haracı kesti; sözünden döndü.` : `${p.by} haracı bağışladı.` }
    case 'spy_caught':
      return { icon: 'eye', title: 'Casus yakalandı', text: `Topraklarında ${p.owner} adına ${TOPIC_NAMES[p.topic as SpyTopic]} bilgisi toplayan bir casus yakalandı.` }
    case 'spy_lost':
      return { icon: 'eye', title: 'Casusun yakalandı', text: `${p.target} krallığındaki casusun yakalandı. İlişkiniz bozuldu.` }
    case 'envoy_insult':
      return { icon: 'unhappy', title: `${p.from} elçisi hakaret etti!`, text: `"${INSULTS[Number(p.seed ?? 0) % INSULTS.length]}" İlişkiniz ${balance.diplomacy.insult.relation} düştü; artık onlara karşı savaş gerekçen var.` }
    case 'insult_delivered':
      return { icon: 'scroll', title: 'Hakaretin iletildi', text: `Elçin ${p.to} sarayında ağzına geleni söyledi. İlişkiniz ${balance.diplomacy.insult.relation} düştü; onlar da sana karşı savaş gerekçesi kazandı.` }
    case 'trade_raided':
      return {
        icon: 'warn',
        title: 'Ticaret yolun yağmalandı!',
        text: `${p.by} askerleri tüccarını bastı${p.units ? ` ve ${fmt(Number(p.units))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} götürdü` : ''}. Ticaret noktan harap; onarmadan satış yapılamaz. Savaş gerekçen var.`,
      }
    case 'raid_repelled':
      return { icon: 'shield', title: 'Yağmacılar püskürtüldü', text: `${p.by} askerleri ticaret yolunu basmaya çalıştı ama geri püskürtüldü. Savaş gerekçen var.` }
    case 'battle_start':
      return {
        icon: 'swords',
        title: p.kind === 'siege' ? 'Kuşatma başladı!' : 'Savaş başladı!',
        text: `${(p.sides as string[][])[0].join(', ')} ile ${(p.sides as string[][])[1].join(', ')} karşı karşıya. Savaş tur tur sürecek.`,
      }
    case 'battle_end': {
      const report = p.report as { winner: string; losses: Record<string, number>; loot?: Record<string, number> }
      const losses = Object.entries(report.losses).map(([name, n]) => `${name} ${fmt(n)}`).join(', ')
      const loot = report.loot ? ` Yağma: ${Object.entries(report.loot).map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')}.` : ''
      return { icon: 'swords', title: `${p.kind === 'siege' ? 'Kuşatma' : 'Savaş'} bitti: ${p.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`, text: `Kayıplar: ${losses}.${loot}` }
    }
    case 'tower_losses':
      return { icon: 'warn', title: 'Gözcü kuleleri ateş açtı', text: `Düşman kuleleri ordundan ${p.killed} askeri vurdu.` }
    case 'order_failed':
      return { icon: 'warn', title: 'Emir yerine getirilemedi', text: 'Elçi orduya ulaştı ama emir uygulanamadı (yol yok ya da ordu savaşta).' }
    default:
      return { icon: 'scroll', title: 'Elçiden haber', text: '' }
  }
}

export function EnvoyDialog({ notice, online, onClose }: { notice: Notice; online: Online; onClose: () => void }) {
  const { icon, title, text } = describe(notice, online)
  const p = notice.payload as Record<string, unknown>
  const pending = notice.kind === 'envoy_proposal' && online.envoys.some((e) => e.id === p.envoy && e.status === 'pending')
  const battle = notice.kind.startsWith('battle') ? (p.battle as number) : null
  return (
    <div className="modal" role="dialog" aria-labelledby="envoy-title">
      <section className="dialog frame envoy">
        <header className="sheet-head">
          <Icon name={icon} size={32} />
          <div>
            <small>Elçi</small>
            <h2 id="envoy-title">{title}</h2>
          </div>
        </header>
        {text && <p>{text}</p>}
        <div className="row spread">
          {pending ? (
            <>
              <button className="btn small danger" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: false }), onClose())}>
                Reddet
              </button>
              <button className="btn small" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: true }), onClose())}>
                Kabul et
              </button>
            </>
          ) : (
            <>
              {battle !== null ? (
                <button className="btn small" onClick={() => (online.watch(battle), onClose())}>
                  <Icon name="swords" size={16} /> İzle
                </button>
              ) : (
                <span />
              )}
              <button className="btn small" onClick={onClose}>
                Tamam
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

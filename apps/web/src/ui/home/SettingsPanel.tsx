import type { ReactNode } from 'react'
import type { Cut, Pace, Profile, Settings, WeatherMode } from '../../net/settings'
import { usePowerSave } from '../../lib/power'
import type { PowerMode } from '../../lib/power'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { Subtabs, usePart } from '../hud/Subtabs'

// The player's settings (CLAUDE.md §11 Ayarlar), in parts: sound, picture, performance, and in the game the envoy's.
// Used on the main menu and in the game alike.

type Change = (change: Partial<Settings>) => void

export function SettingsPanel({ profile, settings, onChange, onSignOut }: { profile: Profile; settings: Settings; onChange: Change; onSignOut: () => void }) {
  return (
    <div className="home-body form">
      <SettingsTabs settings={settings} onChange={onChange} />
      <h3>Hesap</h3>
      <dl className="account">
        <dt>Kullanıcı adı</dt>
        <dd>{profile.username}</dd>
        <dt>E-posta</dt>
        <dd>{profile.email}</dd>
      </dl>
      <button className="btn small" onClick={onSignOut}>
        Çıkış yap
      </button>
    </div>
  )
}

type PartId = 'sound' | 'picture' | 'performance' | 'envoy'

// The parts as tabs; `envoy` adds the envoy's own part (in the game only).
export function SettingsTabs({ settings, onChange, envoy }: { settings: Settings; onChange: Change; envoy?: ReactNode }) {
  const ids: PartId[] = envoy ? ['sound', 'picture', 'performance', 'envoy'] : ['sound', 'picture', 'performance']
  const [part, setPart] = usePart<PartId>('settings', ids, 'sound')
  return (
    <>
      <Subtabs
        label="Ayarlar"
        part={part}
        onPart={setPart}
        parts={[
          { id: 'sound' as const, name: 'Ses', icon: 'music' as const },
          { id: 'picture' as const, name: 'Görüntü', icon: 'eye' as const },
          { id: 'performance' as const, name: 'Performans', icon: 'time' as const },
          ...(envoy ? [{ id: 'envoy' as const, name: 'Elçi', icon: 'scroll' as const }] : []),
        ]}
      />
      {part === 'sound' && <SoundSettings settings={settings} onChange={onChange} />}
      {part === 'picture' && <PictureSettings settings={settings} onChange={onChange} />}
      {part === 'performance' && <PerformanceSettings settings={settings} onChange={onChange} />}
      {part === 'envoy' && envoy}
    </>
  )
}

type Flag = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]
type Level = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]

function Toggle({ on, onClick, disabled, why }: { on: boolean; onClick: () => void; disabled?: boolean; why?: string }) {
  return (
    <button className="btn small" aria-pressed={on} disabled={disabled} data-why={why} onClick={onClick}>
      {on ? 'Açık' : 'Kapalı'}
    </button>
  )
}

function Choice<T extends string>({ value, options, onPick }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <span className="row settings-choice">
      {options.map((o) => (
        <button key={o.id} className="btn small" aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

// A setting's row: its name and what it does, the control on the right.
function Row({ label, hint, icon, children }: { label: string; hint?: string; icon?: IconName; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <b>
          {icon && <Icon name={icon} size={16} />} {label}
        </b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  )
}

// Every kind of sound with its own switch and volume.
export function SoundSettings({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const rows: { label: string; hint: string; on: Flag; volume: Level; icon: IconName }[] = [
    { label: 'Müzik', hint: 'Meyhane ezgisi (menüde daha kısık).', on: 'music', volume: 'musicVolume', icon: 'music' },
    { label: 'Savaş müziği', hint: 'Bir savaşı izlerken davullar ve borular.', on: 'battle', volume: 'battleVolume', icon: 'swords' },
    { label: 'Ses efektleri', hint: 'Elçinin haberleri, olaylar, inşaat ve pencerelerin sesleri.', on: 'sfx', volume: 'sfxVolume', icon: 'bell' },
    { label: 'Yağmur ve gök gürültüsü', hint: 'Yağmurun hışırtısı ve şimşekten sonra gürleme.', on: 'rain', volume: 'rainVolume', icon: 'snow' },
    { label: 'Elçinin sesi', hint: 'Elçi ve haraççıbaşı konuşurken mırıldanır.', on: 'voice', volume: 'voiceVolume', icon: 'scroll' },
  ]
  return (
    <div className="settings-list">
      {rows.map((r) => (
        <div key={r.on} className="sound-row">
          <Row label={r.label} hint={r.hint} icon={r.icon}>
            <Toggle on={settings[r.on]} onClick={() => onChange({ [r.on]: !settings[r.on] })} />
          </Row>
          <label>
            <span>
              Ses düzeyi: <b>%{settings[r.volume]}</b>
            </span>
            <input type="range" min={0} max={100} step={5} value={settings[r.volume]} disabled={!settings[r.on]} onChange={(e) => onChange({ [r.volume]: Number(e.target.value) })} />
          </label>
          {r.on === 'sfx' && (
            <Row label="Düğme sesleri" hint="Düğmelere basınca hafif bir tık.">
              <Toggle on={settings.clicks} disabled={!settings.sfx} why="Ses efektleri kapalı" onClick={() => onChange({ clicks: !settings.clicks })} />
            </Row>
          )}
        </div>
      ))}
    </div>
  )
}

const WEATHER: { id: WeatherMode; label: string }[] = [
  { id: 'full', label: 'Tam' },
  { id: 'lite', label: 'Sade' },
  { id: 'off', label: 'Kapalı' },
]

// What the map draws. A row power saving turns down says so while it does.
export function PictureSettings({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const saving = usePowerSave(settings.power)
  const cutNote = (k: Cut) => (saving && settings.cuts[k] ? ' Güç tasarrufu şu an bunu kısıyor.' : '')
  const rows: { label: string; hint: string; key: Flag & Cut; icon: IconName }[] = [
    { label: 'Detay animasyonları', hint: 'Yakında rüzgârda sallanan ağaçlar ve hareketli binalar (ekin, demirci, bayraklar).', key: 'detail', icon: 'leaf' },
    { label: 'Canlı gölgeler', hint: 'Binaların, yürüyenlerin ve orduların güneşle dönen gölgeleri. Zemine boyalı gölgeler kalır.', key: 'shadows', icon: 'sun' },
    { label: 'Gece ışıltısı', hint: 'Gece yanan pencerelerin çevresindeki yumuşak parıltı.', key: 'glow', icon: 'moon' },
    { label: 'Kuşlar', hint: 'Haritanın üstünde uçan kuş sürüleri.', key: 'birds', icon: 'flower' },
    { label: 'Bulutlar', hint: 'Uzaklaşınca sürüklenen bulutlar ve gölgeleri.', key: 'clouds', icon: 'map' },
    { label: 'Keskin çizim', hint: 'Uzaklaştırınca ekranın tam piksel yoğunluğu (Retina). Kapalıyken daha az piksel boyanır.', key: 'sharp', icon: 'camera' },
  ]
  return (
    <div className="settings-list">
      {rows.map((r) => (
        <Row key={r.key} label={r.label} hint={r.hint + cutNote(r.key)} icon={r.icon}>
          <Toggle on={settings[r.key]} onClick={() => onChange({ [r.key]: !settings[r.key] })} />
        </Row>
      ))}
      <Row label="Hava efektleri" hint={'Tam: yağmur, kar, bulut gölgeleri ve damla sıçramaları. Sade: daha az damla, gölge ve sıçrama yok. Kapalı: hava hiç çizilmez.' + cutNote('weather')} icon="snow">
        <Choice value={settings.weather} options={WEATHER} onPick={(weather) => onChange({ weather })} />
      </Row>
    </div>
  )
}

const PACES: { id: Pace; label: string }[] = [
  { id: 'smooth', label: 'Akıcı' },
  { id: 'balanced', label: 'Dengeli' },
  { id: 'saver', label: 'Pil dostu' },
]

const PACE_HINTS: Record<Pace, string> = {
  smooth: 'Dururken saniyede 30 kare (uzakta 20), gezinirken 60.',
  balanced: 'Dururken saniyede 24 kare (uzakta 15), gezinirken 60.',
  saver: 'Dururken saniyede 15 kare (uzakta 10), gezinirken 30.',
}

const POWER_MODES: { id: PowerMode; label: string }[] = [
  { id: 'auto', label: 'Otomatik' },
  { id: 'on', label: 'Açık' },
  { id: 'off', label: 'Kapalı' },
]

const CUTS: { key: Cut; label: string }[] = [
  { key: 'pace', label: 'Kare hızını Pil dostu yap' },
  { key: 'detail', label: 'Detay animasyonlarını kapat' },
  { key: 'shadows', label: 'Canlı gölgeleri kapat' },
  { key: 'glow', label: 'Gece ışıltısını kapat' },
  { key: 'birds', label: 'Kuşları kapat' },
  { key: 'clouds', label: 'Bulutları kapat' },
  { key: 'weather', label: 'Hava efektlerini sadeleştir' },
  { key: 'sharp', label: 'Keskin çizimi kapat' },
]

// How often the map is drawn, and power saving with what it turns down (CLAUDE.md §12).
export function PerformanceSettings({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const saving = usePowerSave(settings.power)
  return (
    <div className="settings-list">
      <Row label="Kare hızı" hint={PACE_HINTS[settings.pace] + ' Bir pencere haritayı örtünce daha da yavaşlar; sekme gizliyken hiç çizilmez.'} icon="time">
        <Choice value={settings.pace} options={PACES} onPick={(pace) => onChange({ pace })} />
      </Row>
      <Row
        label="Güç tasarrufu"
        hint={
          settings.power === 'auto'
            ? `Telefonda, tablette ve pil ile çalışırken kendiliğinden açılır${saving ? ' (şu an açık)' : ' (şu an kapalı)'}.`
            : saving
              ? 'Açık: aşağıda seçtiklerin kısılır.'
              : 'Kapalı: harita her zaman yukarıdaki ayarlarla çizilir.'
        }
        icon="info"
      >
        <Choice value={settings.power} options={POWER_MODES} onPick={(power) => onChange({ power })} />
      </Row>
      <div className="settings-cuts">
        <b>Güç tasarrufu açıkken</b>
        {CUTS.map((c) => (
          <button key={c.key} className="pixel-check" role="checkbox" aria-checked={settings.cuts[c.key]} onClick={() => onChange({ cuts: { ...settings.cuts, [c.key]: !settings.cuts[c.key] } })}>
            <span className="box" aria-hidden>
              <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
                <path d="M1 4h1v1h-1zM2 5h1v1h-1zM3 6h1v1h-1zM4 5h1v1h-1zM5 4h1v1h-1zM6 3h1v1h-1zM7 2h1v1h-1zM2 4h1v1h-1zM3 5h1v1h-1zM4 4h1v1h-1zM5 3h1v1h-1zM6 2h1v1h-1z" />
              </svg>
            </span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

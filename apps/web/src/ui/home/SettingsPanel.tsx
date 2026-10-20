import type { ReactNode } from 'react'
import { PHONE_OFF, playTrack, useNowPlaying } from '../../net/settings'
import { TRACKS } from '../../audio/music'
import type { Cut, Pace, Profile, Settings, WeatherMode } from '../../net/settings'
import { usePhone, usePowerSave } from '../../lib/power'
import type { PowerMode } from '../../lib/power'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { Subtabs, usePart } from '../hud/Subtabs'
import { L, chooseLang, getLang } from '../../lib/i18n'

// The player's settings (CLAUDE.md §11 Ayarlar), in parts: sound, picture, performance, and in the game the envoy's.
// Used on the main menu and in the game alike.

type Change = (change: Partial<Settings>) => void

export function SettingsPanel({ profile, settings, onChange, onSignOut }: { profile: Profile; settings: Settings; onChange: Change; onSignOut: () => void }) {
  return (
    <div className="home-body form">
      <SettingsTabs settings={settings} onChange={onChange} />
      <h3>{L('Hesap', 'Account')}</h3>
      <dl className="account">
        <dt>{L('Kullanıcı adı', 'Username')}</dt>
        <dd>{profile.username}</dd>
        <dt>{L('E-posta', 'Email')}</dt>
        <dd>{profile.email}</dd>
      </dl>
      <button className="btn small" onClick={onSignOut}>
        {L('Çıkış yap', 'Sign out')}
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
      <LanguageRow />
      <Subtabs
        label={L('Ayarlar', 'Settings')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'sound' as const, name: L('Ses', 'Sound'), icon: 'music' as const },
          { id: 'picture' as const, name: L('Görüntü', 'Picture'), icon: 'eye' as const },
          { id: 'performance' as const, name: L('Performans', 'Performance'), icon: 'time' as const },
          ...(envoy ? [{ id: 'envoy' as const, name: L('Elçi', 'Envoy'), icon: 'scroll' as const }] : []),
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
      {on ? L('Açık', 'On') : L('Kapalı', 'Off')}
    </button>
  )
}

function Choice<T extends string>({ value, options, onPick, locked }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; locked?: { allowed: T[]; why: string } }) {
  return (
    <span className="row settings-choice">
      {options.map((o) => (
        <button
          key={o.id}
          className="btn small"
          aria-pressed={value === o.id}
          disabled={locked && !locked.allowed.includes(o.id)}
          data-why={locked && !locked.allowed.includes(o.id) ? locked.why : undefined}
          onClick={() => onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

// The language, kept in this browser (CLAUDE.md §11 Dil); picking the other one reloads the page. Written in both
// languages so a player who cannot read the current one still finds it.
export function LanguageRow() {
  return (
    <div className="settings-row settings-lang">
      <div>
        <b>
          <Icon name="scroll" size={16} /> Dil · Language
        </b>
      </div>
      <Choice
        value={getLang()}
        options={[
          { id: 'tr', label: 'Türkçe' },
          { id: 'en', label: 'English' },
        ]}
        onPick={chooseLang}
      />
    </div>
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
    { label: L('Müzik', 'Music'), hint: L('Meyhane ezgisi (menüde daha kısık).', 'Tavern tunes (softer in the menu).'), on: 'music', volume: 'musicVolume', icon: 'music' },
    { label: L('Savaş müziği', 'Battle music'), hint: L('Bir savaşı izlerken davullar ve borular.', 'Drums and horns while you watch a battle.'), on: 'battle', volume: 'battleVolume', icon: 'swords' },
    { label: L('Ses efektleri', 'Sound effects'), hint: L('Elçinin haberleri, olaylar, inşaat ve pencerelerin sesleri.', 'The sounds of the envoy\'s news, events, construction and windows.'), on: 'sfx', volume: 'sfxVolume', icon: 'bell' },
    { label: L('Yağmur ve gök gürültüsü', 'Rain and thunder'), hint: L('Yağmurun hışırtısı ve şimşekten sonra gürleme.', 'The patter of rain and the rumble after lightning.'), on: 'rain', volume: 'rainVolume', icon: 'snow' },
    { label: L('Elçinin sesi', 'The envoy\'s voice'), hint: L('Elçi ve haraççıbaşı konuşurken mırıldanır.', 'The envoy and the chief tribute collector mumble as they talk.'), on: 'voice', volume: 'voiceVolume', icon: 'scroll' },
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
              {L('Ses düzeyi:', 'Volume:')} <b>{L(`%${settings[r.volume]}`, `${settings[r.volume]}%`)}</b>
            </span>
            <input type="range" min={0} max={100} step={5} value={settings[r.volume]} disabled={!settings[r.on]} onChange={(e) => onChange({ [r.volume]: Number(e.target.value) })} />
          </label>
          {r.on === 'music' && <TrackList settings={settings} onChange={onChange} />}
          {r.on === 'sfx' && (
            <Row label={L('Düğme sesleri', 'Button sounds')} hint={L('Düğmelere basınca hafif bir tık.', 'A soft click when you press buttons.')}>
              <Toggle on={settings.clicks} disabled={!settings.sfx} why={L('Ses efektleri kapalı', 'Sound effects are off')} onClick={() => onChange({ clicks: !settings.clicks })} />
            </Row>
          )}
        </div>
      ))}
    </div>
  )
}

// The music's pieces (CLAUDE.md §11 Ayarlar): each ticked plays in its turn; "Çal" plays it now. One stays on.
function TrackList({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const now = useNowPlaying()
  const on = TRACKS.filter((t) => settings.tracks[t.id]).length
  return (
    <div className="settings-cuts track-list">
      <b>{L('Çalacak parçalar', 'Pieces to play')}</b>
      {TRACKS.map((t) => {
        const ticked = settings.tracks[t.id]
        return (
          <div key={t.id} className={`track-row${now === t.id && settings.music ? ' playing' : ''}`}>
            <button
              className="pixel-check"
              role="checkbox"
              aria-checked={ticked}
              disabled={ticked && on <= 1}
              data-why={L('En az bir parça seçili kalmalı', 'At least one piece must stay chosen')}
              onClick={() => onChange({ tracks: { ...settings.tracks, [t.id]: !ticked } })}
            >
              <span className="box" aria-hidden>
                <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
                  <path d="M1 4h1v1h-1zM2 5h1v1h-1zM3 6h1v1h-1zM4 5h1v1h-1zM5 4h1v1h-1zM6 3h1v1h-1zM7 2h1v1h-1zM2 4h1v1h-1zM3 5h1v1h-1zM4 4h1v1h-1zM5 3h1v1h-1zM6 2h1v1h-1z" />
                </svg>
              </span>
              <span>
                {t.name}
                <small>{now === t.id && settings.music ? L('Şimdi çalıyor · ', 'Now playing · ') : ''}{t.hint}</small>
              </span>
            </button>
            <button
              className="btn small"
              disabled={!settings.music || (now === t.id)}
              data-why={!settings.music ? L('Müzik kapalı', 'Music is off') : L('Zaten çalıyor', 'Already playing')}
              onClick={() => {
                if (!ticked) onChange({ tracks: { ...settings.tracks, [t.id]: true } })
                playTrack(t.id)
              }}
            >
              <Icon name="music" size={14} /> {L('Çal', 'Play')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

const PHONE_WHY = L('Telefonda hep kapalı (pil ve bellek için)', 'Always off on phones (for battery and memory)')

const WEATHER: { id: WeatherMode; label: string }[] = [
  { id: 'full', label: L('Tam', 'Full') },
  { id: 'lite', label: L('Sade', 'Light') },
  { id: 'off', label: L('Kapalı', 'Off') },
]

// What the map draws. A row power saving turns down says so while it does.
export function PictureSettings({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const saving = usePowerSave(settings.power)
  const phone = usePhone()
  const cutNote = (k: Cut) => (saving && settings.cuts[k] && !(phone && PHONE_OFF.includes(k)) ? L(' Güç tasarrufu şu an bunu kısıyor.', ' Power saving is turning this down right now.') : '')
  const off = (k: Cut) => phone && PHONE_OFF.includes(k)
  const rows: { label: string; hint: string; key: Flag & Cut; icon: IconName }[] = [
    { label: L('Detay animasyonları', 'Detail animations'), hint: L('Yakında rüzgârda sallanan ağaçlar ve hareketli binalar (ekin, demirci, bayraklar).', 'Up close, trees swaying in the wind and moving buildings (crops, smiths, flags).'), key: 'detail', icon: 'leaf' },
    { label: L('Canlı gölgeler', 'Live shadows'), hint: L('Binaların, yürüyenlerin ve orduların güneşle dönen gölgeleri. Zemine boyalı gölgeler kalır.', 'Shadows of buildings, walkers and armies that turn with the sun. Shadows painted on the ground stay.'), key: 'shadows', icon: 'sun' },
    { label: L('Gece ışıltısı', 'Night glow'), hint: L('Gece yanan pencerelerin çevresindeki yumuşak parıltı.', 'The soft glow around windows lit at night.'), key: 'glow', icon: 'moon' },
    { label: L('Kuşlar', 'Birds'), hint: L('Haritanın üstünde uçan kuş sürüleri.', 'Flocks of birds flying over the map.'), key: 'birds', icon: 'flower' },
    { label: L('Bulutlar', 'Clouds'), hint: L('Uzaklaşınca sürüklenen bulutlar ve gölgeleri.', 'Drifting clouds and their shadows when zoomed out.'), key: 'clouds', icon: 'map' },
    { label: L('Keskin çizim', 'Sharp rendering'), hint: L('Uzaklaştırınca ekranın tam piksel yoğunluğu (Retina). Kapalıyken daha az piksel boyanır.', 'The screen\'s full pixel density (Retina) when zoomed out. When off, fewer pixels are painted.'), key: 'sharp', icon: 'camera' },
  ]
  return (
    <div className="settings-list">
      {rows.map((r) => (
        <Row key={r.key} label={r.label} hint={r.hint + cutNote(r.key) + (off(r.key) ? L(' Telefonda hep kapalı.', ' Always off on phones.') : '')} icon={r.icon}>
          <Toggle on={settings[r.key] && !off(r.key)} disabled={off(r.key)} why={PHONE_WHY} onClick={() => onChange({ [r.key]: !settings[r.key] })} />
        </Row>
      ))}
      <Row label={L('Hava efektleri', 'Weather effects')} hint={L('Tam: yağmur, kar, bulut gölgeleri ve damla sıçramaları. Sade: daha az damla, gölge ve sıçrama yok. Kapalı: hava hiç çizilmez.', 'Full: rain, snow, cloud shadows and splashes. Light: fewer drops, no shadows or splashes. Off: no weather is drawn.') + cutNote('weather') + (phone ? L(' Telefonda en çok Sade.', ' At most Light on phones.') : '')} icon="snow">
        <Choice
          value={phone && settings.weather === 'full' ? 'lite' : settings.weather}
          options={WEATHER}
          onPick={(weather) => onChange({ weather })}
          locked={phone ? { allowed: ['lite', 'off'], why: PHONE_WHY } : undefined}
        />
      </Row>
    </div>
  )
}

const PACES: { id: Pace; label: string }[] = [
  { id: 'smooth', label: L('Akıcı', 'Smooth') },
  { id: 'balanced', label: L('Dengeli', 'Balanced') },
  { id: 'saver', label: L('Pil dostu', 'Battery saver') },
]

const PACE_HINTS: Record<Pace, string> = {
  smooth: L('Dururken saniyede 30 kare (uzakta 20), gezinirken 60.', '30 frames a second when still (20 zoomed out), 60 while moving.'),
  balanced: L('Dururken saniyede 24 kare (uzakta 15), gezinirken 60.', '24 frames a second when still (15 zoomed out), 60 while moving.'),
  saver: L('Dururken saniyede 15 kare (uzakta 10), gezinirken 30.', '15 frames a second when still (10 zoomed out), 30 while moving.'),
}

const POWER_MODES: { id: PowerMode; label: string }[] = [
  { id: 'auto', label: L('Otomatik', 'Automatic') },
  { id: 'on', label: L('Açık', 'On') },
  { id: 'off', label: L('Kapalı', 'Off') },
]

const CUTS: { key: Cut; label: string }[] = [
  { key: 'pace', label: L('Kare hızını Pil dostu yap', 'Set the frame rate to Battery saver') },
  { key: 'detail', label: L('Detay animasyonlarını kapat', 'Turn off detail animations') },
  { key: 'shadows', label: L('Canlı gölgeleri kapat', 'Turn off live shadows') },
  { key: 'glow', label: L('Gece ışıltısını kapat', 'Turn off night glow') },
  { key: 'birds', label: L('Kuşları kapat', 'Turn off birds') },
  { key: 'clouds', label: L('Bulutları kapat', 'Turn off clouds') },
  { key: 'weather', label: L('Hava efektlerini sadeleştir', 'Simplify weather effects') },
  { key: 'sharp', label: L('Keskin çizimi kapat', 'Turn off sharp rendering') },
]

// How often the map is drawn, and power saving with what it turns down (CLAUDE.md §12).
export function PerformanceSettings({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const saving = usePowerSave(settings.power)
  const phone = usePhone()
  return (
    <div className="settings-list">
      <Row
        label={L('Kare hızı', 'Frame rate')}
        hint={PACE_HINTS[settings.pace] + L(' Bir pencere haritayı örtünce daha da yavaşlar; sekme gizliyken hiç çizilmez.', ' Slower still when a window covers the map; nothing is drawn while the tab is hidden.') + (phone ? L(' Telefonda güç tasarrufu bunu değiştirmez, seçtiğin geçerlidir.', ' On phones power saving leaves this alone; your choice applies.') : '')}
        icon="time"
      >
        <Choice value={settings.pace} options={PACES} onPick={(pace) => onChange({ pace })} />
      </Row>
      <Row
        label={L('Güç tasarrufu', 'Power saving')}
        hint={
          settings.power === 'auto'
            ? L(`Telefonda, tablette ve pil ile çalışırken kendiliğinden açılır${saving ? ' (şu an açık)' : ' (şu an kapalı)'}.`, `Turns on by itself on phones, tablets and when running on battery${saving ? ' (on right now)' : ' (off right now)'}.`)
            : saving
              ? L('Açık: aşağıda seçtiklerin kısılır.', 'On: what you tick below is turned down.')
              : L('Kapalı: harita her zaman yukarıdaki ayarlarla çizilir.', 'Off: the map is always drawn with the settings above.')
        }
        icon="info"
      >
        <Choice value={settings.power} options={POWER_MODES} onPick={(power) => onChange({ power })} />
      </Row>
      <div className="settings-cuts">
        <b>{L('Güç tasarrufu açıkken', 'While power saving is on')}</b>
        {CUTS.map((c) => (
          <button
            key={c.key}
            className="pixel-check"
            role="checkbox"
            aria-checked={phone && c.key !== 'pace' && c.key !== 'shadows' ? true : phone && c.key === 'pace' ? false : settings.cuts[c.key]}
            disabled={phone && (PHONE_OFF.includes(c.key) || c.key === 'pace' || c.key === 'weather')}
            data-why={phone ? (c.key === 'pace' ? L('Telefonda kare hızını sen seçersin', 'On phones you choose the frame rate') : PHONE_WHY) : undefined}
            onClick={() => onChange({ cuts: { ...settings.cuts, [c.key]: !settings.cuts[c.key] } })}
          >
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

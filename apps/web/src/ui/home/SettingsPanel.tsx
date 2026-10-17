import type { Profile, Settings } from '../../net/settings'
import { usePowerSave } from '../../lib/power'
import type { PowerMode } from '../../lib/power'
import { Icon } from '../icons'

// The player's settings and account.

export function SettingsPanel({
  profile,
  settings,
  onChange,
  onSignOut,
}: {
  profile: Profile
  settings: Settings
  onChange: (change: Partial<Settings>) => void
  onSignOut: () => void
}) {
  return (
    <div className="home-body form">
      <h3>Ses</h3>
      <SoundSettings settings={settings} onChange={onChange} />
      <h3>Görüntü</h3>
      <DetailSettings settings={settings} onChange={onChange} />
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

// Music and sound effects: each can be turned off, and has its own volume. Used on the main menu and in the game.
export function SoundSettings({ settings, onChange }: { settings: Settings; onChange: (change: Partial<Settings>) => void }) {
  const rows: { label: string; on: keyof Settings; volume: keyof Settings; icon: 'music' | 'swords' }[] = [
    { label: 'Müzik', on: 'music', volume: 'musicVolume', icon: 'music' },
    { label: 'Ses efektleri', on: 'sfx', volume: 'sfxVolume', icon: 'swords' },
  ]
  return (
    <>
      {rows.map((r) => (
        <div key={r.on} className="sound-row">
          <div className="row spread">
            <span>{r.label}</span>
            <button className="btn small" aria-pressed={!!settings[r.on]} onClick={() => onChange({ [r.on]: !settings[r.on] })}>
              <Icon name={r.icon} size={16} slash={!settings[r.on]} /> {settings[r.on] ? 'Açık' : 'Kapalı'}
            </button>
          </div>
          <label>
            <span>
              {r.label} sesi: <b>%{settings[r.volume] as number}</b>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings[r.volume] as number}
              disabled={!settings[r.on]}
              onChange={(e) => onChange({ [r.volume]: Number(e.target.value) })}
            />
          </label>
        </div>
      ))}
    </>
  )
}

const POWER_MODES: { mode: PowerMode; label: string }[] = [
  { mode: 'auto', label: 'Otomatik' },
  { mode: 'on', label: 'Açık' },
  { mode: 'off', label: 'Kapalı' },
]

// Small motions on the map (swaying trees); turning them off repaints the map without them. Power saving (CLAUDE.md
// §12) lowers the frame rate and leaves out the detail animations, birds, clouds and the night glow.
export function DetailSettings({ settings, onChange }: { settings: Settings; onChange: (change: Partial<Settings>) => void }) {
  const saving = usePowerSave(settings.power)
  return (
    <>
      <div className="row spread">
        <span>Detay animasyonları (sallanan ağaçlar)</span>
        <button className="btn small" aria-pressed={settings.detail} disabled={saving} data-why="Güç tasarrufu açıkken detay animasyonları kapalıdır" onClick={() => onChange({ detail: !settings.detail })}>
          {settings.detail && !saving ? 'Açık' : 'Kapalı'}
        </button>
      </div>
      <div className="row spread">
        <span>Güç tasarrufu</span>
        <span className="row">
          {POWER_MODES.map((p) => (
            <button key={p.mode} className="btn small" aria-pressed={settings.power === p.mode} onClick={() => onChange({ power: p.mode })}>
              {p.label}
            </button>
          ))}
        </span>
      </div>
      <p className="hint">
        {settings.power === 'auto'
          ? `Telefonda, tablette ve pil ile çalışırken kendiliğinden açılır${saving ? ' (şu an açık)' : ' (şu an kapalı)'}.`
          : saving
            ? 'Açık: harita daha seyrek çizilir; detay animasyonları, kuşlar, bulutlar ve gece ışıltısı kapanır.'
            : 'Kapalı: harita her zaman tam ayrıntıyla çizilir.'}
      </p>
    </>
  )
}

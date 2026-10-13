import type { Profile, Settings } from '../../net/settings'
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

// Small motions on the map (swaying trees); turning them off repaints the map without them.
export function DetailSettings({ settings, onChange }: { settings: Settings; onChange: (change: Partial<Settings>) => void }) {
  return (
    <div className="row spread">
      <span>Detay animasyonları (sallanan ağaçlar)</span>
      <button className="btn small" aria-pressed={settings.detail} onClick={() => onChange({ detail: !settings.detail })}>
        {settings.detail ? 'Açık' : 'Kapalı'}
      </button>
    </div>
  )
}

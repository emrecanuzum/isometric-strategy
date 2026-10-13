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
      <div className="row spread">
        <span>Müzik</span>
        <button className="btn small" aria-pressed={settings.music} onClick={() => onChange({ music: !settings.music })}>
          <Icon name="music" size={16} slash={!settings.music} /> {settings.music ? 'Açık' : 'Kapalı'}
        </button>
      </div>
      <label>
        <span>
          Müzik sesi: <b>{settings.musicVolume}</b>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={settings.musicVolume}
          disabled={!settings.music}
          onChange={(e) => onChange({ musicVolume: Number(e.target.value) })}
        />
      </label>
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

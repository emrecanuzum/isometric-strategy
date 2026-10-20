import { LOBBY_SIZES } from '@game/shared'
import { useCallback, useEffect, useState } from 'react'
import { deleteLobby, listLobbies } from '../../net/online'
import type { LobbyListing } from '../../net/online'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'

// The lobby browser: the open lobbies, joining one (with its password if it has one) and opening a new one.

const date = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })

export function Lobbies({
  busy,
  error,
  onEnter,
  onCreate,
  admin = false,
}: {
  // What is under way (entering or opening a lobby), and why the last attempt failed.
  busy: string | null
  error: string | null
  onEnter: (lobby: LobbyListing, password: string) => void
  onCreate: (name: string, maxPlayers: number, password: string) => void
  // Admins see a delete button on every lobby.
  admin?: boolean
}) {
  const [lobbies, setLobbies] = useState<LobbyListing[] | null>(null)
  // The lobby whose delete button was pressed once (a second press deletes it).
  const [deleting, setDeleting] = useState<string | null>(null)
  const remove = async (id: string) => {
    if (deleting !== id) return setDeleting(id)
    setDeleting(null)
    try {
      await deleteLobby(id)
    } finally {
      refresh()
    }
  }
  const [loadError, setLoadError] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    setLoadError(false)
    listLobbies()
      .then(setLobbies)
      .catch(() => setLoadError(true))
  }, [])
  useEffect(refresh, [refresh])

  if (creating) return <CreateLobby busy={busy} error={error} onCancel={() => setCreating(false)} onCreate={onCreate} />

  return (
    <div className="home-body">
      <div className="row spread">
        <button className="btn" onClick={() => setCreating(true)} disabled={busy !== null} data-why={L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}>
          <Icon name="plus" size={16} /> {L('Lobi aç', 'Open a lobby')}
        </button>
        <button className="btn small" onClick={refresh} disabled={busy !== null} data-why={L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}>
          {L('Yenile', 'Refresh')}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="warn" size={16} /> {error}
        </p>
      )}
      {loadError && <p className="form-error">{L('Lobiler yüklenemedi.', 'Could not load the lobbies.')}</p>}
      {!lobbies && !loadError && <p className="hint">{L('Lobiler yükleniyor…', 'Loading lobbies…')}</p>}
      {lobbies?.length === 0 && <p className="hint">{L('Şu an açık lobi yok. İlkini sen aç!', 'No open lobbies right now. Open the first one!')}</p>}
      <ul className="lobby-rows">
        {lobbies?.map((lobby) => {
          const full = lobby.players >= lobby.max_players && !lobby.joined
          const locked = lobby.has_password && !lobby.joined
          return (
            <li key={lobby.id} className={lobby.joined ? 'joined' : undefined}>
              <div className="lobby-row">
                <span className="lobby-name">
                  <b>
                    {locked && <Icon name="lock" size={16} />} {lobby.name}
                  </b>
                  <small>
                    {lobby.owner ? L(`${lobby.owner} açtı · `, `opened by ${lobby.owner} · `) : ''}{L(`sezon ${date(lobby.season_end)} biter`, `season ends ${date(lobby.season_end)}`)}
                  </small>
                </span>
                <span className="lobby-count" title={L('Lord sayısı', 'Number of lords')}>
                  <Icon name="people" size={16} /> {lobby.players}/{lobby.max_players}
                </span>
                {admin && (
                  <button
                    className={deleting === lobby.id ? 'btn small danger' : 'btn small'}
                    onClick={() => remove(lobby.id)}
                    onBlur={() => setDeleting(null)}
                    disabled={busy !== null}
                    data-why={L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}
                    title={L('Lobiyi ve içindeki her şeyi sil', 'Delete the lobby and everything in it')}
                  >
                    {deleting === lobby.id ? L('Emin misin?', 'Are you sure?') : L('Sil', 'Delete')}
                  </button>
                )}
                {lobby.joined ? (
                  <button className="btn small" onClick={() => onEnter(lobby, '')} disabled={busy !== null} data-why={L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}>
                    {L('Devam et', 'Continue')}
                  </button>
                ) : (
                  <button
                    className="btn small"
                    disabled={full || busy !== null}
                    data-why={full ? L('Lobi dolu', 'The lobby is full') : L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}
                    onClick={() => (locked ? (setAsking(asking === lobby.id ? null : lobby.id), setPassword('')) : onEnter(lobby, ''))}
                  >
                    {full ? L('Dolu', 'Full') : L('Katıl', 'Join')}
                  </button>
                )}
              </div>
              {asking === lobby.id && (
                <form
                  className="lobby-password"
                  onSubmit={(e) => {
                    e.preventDefault()
                    onEnter(lobby, password)
                  }}
                >
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={L('Lobi şifresi', 'Lobby password')}
                    aria-label={L('Lobi şifresi', 'Lobby password')}
                    autoFocus
                    required
                  />
                  <button className="btn small" disabled={busy !== null} data-why={L('Bir işlem sürüyor; bekle', 'Something is in progress; please wait')}>
                    {busy === lobby.id ? L('Bekle…', 'Wait…') : L('Gir', 'Enter')}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CreateLobby({
  busy,
  error,
  onCancel,
  onCreate,
}: {
  busy: string | null
  error: string | null
  onCancel: () => void
  onCreate: (name: string, maxPlayers: number, password: string) => void
}) {
  const [name, setName] = useState('')
  const [players, setPlayers] = useState<number>(LOBBY_SIZES[0])
  const [password, setPassword] = useState('')
  return (
    <form
      className="home-body form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onCreate(name.trim(), players, password)
      }}
    >
      <label>
        <span>{L('Lobi adı', 'Lobby name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
      </label>
      <div className="field">
        <span>{L('Lobi büyüklüğü', 'Lobby size')}</span>
        <div className="segmented choices" role="radiogroup" aria-label={L('Lobi büyüklüğü', 'Lobby size')}>
          {LOBBY_SIZES.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={players === size} className="btn small" onClick={() => setPlayers(size)}>
              {L(`${size} lord`, `${size} lords`)}
            </button>
          ))}
        </div>
      </div>
      <label>
        <span>{L('Şifre (isteğe bağlı)', 'Password (optional)')}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} autoComplete="new-password" />
        <small className="hint">{L('Şifre koyarsan yalnızca şifreyi bilenler katılabilir.', 'With a password, only those who know it can join.')}</small>
      </label>
      <p className="hint">{L('Sezon 2 hafta sürer. Harita yeni bir tohumdan üretilir.', 'A season lasts 2 weeks. The map is generated from a new seed.')}</p>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="warn" size={16} /> {error}
        </p>
      )}
      <div className="row spread">
        <button type="button" className="btn small" onClick={onCancel} disabled={busy !== null} data-why={L('Lobi açılıyor; bekle', 'The lobby is opening; please wait')}>
          {L('Vazgeç', 'Cancel')}
        </button>
        <button className="btn" disabled={busy !== null || !name.trim()} data-why={busy !== null ? L('Lobi açılıyor; bekle', 'The lobby is opening; please wait') : L('Lobiye bir ad ver', 'Give the lobby a name')}>
          {busy === 'create' ? L('Dünya oluşturuluyor…', 'Creating the world…') : L('Lobiyi aç', 'Open the lobby')}
        </button>
      </div>
    </form>
  )
}

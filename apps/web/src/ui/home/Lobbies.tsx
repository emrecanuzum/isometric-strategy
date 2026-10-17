import { LOBBY_SIZES } from '@game/shared'
import { useCallback, useEffect, useState } from 'react'
import { deleteLobby, listLobbies } from '../../net/online'
import type { LobbyListing } from '../../net/online'
import { Icon } from '../icons'

// The lobby browser: the open lobbies, joining one (with its password if it has one) and opening a new one.

const date = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })

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
        <button className="btn" onClick={() => setCreating(true)} disabled={busy !== null} data-why="Bir işlem sürüyor; bekle">
          <Icon name="plus" size={16} /> Lobi aç
        </button>
        <button className="btn small" onClick={refresh} disabled={busy !== null} data-why="Bir işlem sürüyor; bekle">
          Yenile
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="warn" size={16} /> {error}
        </p>
      )}
      {loadError && <p className="form-error">Lobiler yüklenemedi.</p>}
      {!lobbies && !loadError && <p className="hint">Lobiler yükleniyor…</p>}
      {lobbies?.length === 0 && <p className="hint">Şu an açık lobi yok. İlkini sen aç!</p>}
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
                    {lobby.owner ? `${lobby.owner} açtı · ` : ''}sezon {date(lobby.season_end)} biter
                  </small>
                </span>
                <span className="lobby-count" title="Lord sayısı">
                  <Icon name="people" size={16} /> {lobby.players}/{lobby.max_players}
                </span>
                {admin && (
                  <button
                    className={deleting === lobby.id ? 'btn small danger' : 'btn small'}
                    onClick={() => remove(lobby.id)}
                    onBlur={() => setDeleting(null)}
                    disabled={busy !== null}
                    data-why="Bir işlem sürüyor; bekle"
                    title="Lobiyi ve içindeki her şeyi sil"
                  >
                    {deleting === lobby.id ? 'Emin misin?' : 'Sil'}
                  </button>
                )}
                {lobby.joined ? (
                  <button className="btn small" onClick={() => onEnter(lobby, '')} disabled={busy !== null} data-why="Bir işlem sürüyor; bekle">
                    Devam et
                  </button>
                ) : (
                  <button
                    className="btn small"
                    disabled={full || busy !== null}
                    data-why={full ? 'Lobi dolu' : 'Bir işlem sürüyor; bekle'}
                    onClick={() => (locked ? (setAsking(asking === lobby.id ? null : lobby.id), setPassword('')) : onEnter(lobby, ''))}
                  >
                    {full ? 'Dolu' : 'Katıl'}
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
                    placeholder="Lobi şifresi"
                    aria-label="Lobi şifresi"
                    autoFocus
                    required
                  />
                  <button className="btn small" disabled={busy !== null} data-why="Bir işlem sürüyor; bekle">
                    {busy === lobby.id ? 'Bekle…' : 'Gir'}
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
        <span>Lobi adı</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
      </label>
      <div className="field">
        <span>Lobi büyüklüğü</span>
        <div className="segmented choices" role="radiogroup" aria-label="Lobi büyüklüğü">
          {LOBBY_SIZES.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={players === size} className="btn small" onClick={() => setPlayers(size)}>
              {size} lord
            </button>
          ))}
        </div>
      </div>
      <label>
        <span>Şifre (isteğe bağlı)</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} autoComplete="new-password" />
        <small className="hint">Şifre koyarsan yalnızca şifreyi bilenler katılabilir.</small>
      </label>
      <p className="hint">Sezon 2 hafta sürer. Harita yeni bir tohumdan üretilir.</p>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="warn" size={16} /> {error}
        </p>
      )}
      <div className="row spread">
        <button type="button" className="btn small" onClick={onCancel} disabled={busy !== null} data-why="Lobi açılıyor; bekle">
          Vazgeç
        </button>
        <button className="btn" disabled={busy !== null || !name.trim()} data-why={busy !== null ? 'Lobi açılıyor; bekle' : 'Lobiye bir ad ver'}>
          {busy === 'create' ? 'Dünya oluşturuluyor…' : 'Lobiyi aç'}
        </button>
      </div>
    </form>
  )
}

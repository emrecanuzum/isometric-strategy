import { useState } from 'react'
import { signIn, signUp } from '../../net/online'
import { Icon } from '../icons'

// Sign in or open an account with an email and a password.

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-posta ya da şifre hatalı.',
  'User already registered': 'Bu e-postayla zaten bir hesap var; giriş yap.',
  'Email not confirmed': 'E-postanı henüz onaylamadın; gelen kutuna bak.',
}
const explain = (e: unknown) => {
  const message = e instanceof Error ? e.message : ''
  if (message.includes('Password should be')) return 'Şifre en az 6 karakter olmalı.'
  if (message.includes('rate limit')) return 'Çok fazla deneme oldu; biraz sonra tekrar dene.'
  return MESSAGES[message] ?? 'Bir şeyler ters gitti; tekrar dene.'
}

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'up' && !/^[\p{L}\p{N}_. -]{3,20}$/u.test(username.trim())) {
      return setError('Kullanıcı adı 3–20 harf, rakam ya da _ . - olmalı.')
    }
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email.trim(), password)
      else if (await signUp(email.trim(), password, username.trim())) setSent(true)
      // A session arriving is picked up by the root screen.
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <section className="home-card frame">
        <header className="sheet-head">
          <Icon name="scroll" size={32} />
          <div>
            <h2>E-postanı onayla</h2>
            <small>{email} adresine bir bağlantı gönderdik</small>
          </div>
        </header>
        <div className="home-body">
          <p>Bağlantıya tıkladıktan sonra buradan giriş yapabilirsin.</p>
          <button className="btn wide" onClick={() => (setSent(false), setMode('in'))}>
            Girişe dön
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="home-card frame" aria-labelledby="auth-title">
      <div className="home-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'in'} className="btn small" onClick={() => (setMode('in'), setError(null))}>
          Giriş yap
        </button>
        <button role="tab" aria-selected={mode === 'up'} className="btn small" onClick={() => (setMode('up'), setError(null))}>
          Hesap oluştur
        </button>
      </div>
      <form className="home-body form" onSubmit={submit}>
        <h2 id="auth-title" className="visually-hidden">
          {mode === 'in' ? 'Giriş yap' : 'Hesap oluştur'}
        </h2>
        {mode === 'up' && (
          <label>
            <span>Kullanıcı adı</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="nickname" maxLength={20} required />
          </label>
        )}
        <label>
          <span>E-posta</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          <span>Şifre</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="warn" size={16} /> {error}
          </p>
        )}
        <button className="btn wide" disabled={busy} data-why="Sunucunun cevabı bekleniyor">
          {busy ? 'Bekle…' : mode === 'in' ? 'Giriş yap' : 'Hesabı oluştur'}
        </button>
      </form>
    </section>
  )
}

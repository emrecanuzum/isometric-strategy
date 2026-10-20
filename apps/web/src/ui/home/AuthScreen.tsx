import { useState } from 'react'
import { signIn, signUp } from '../../net/online'
import { Icon } from '../icons'
import { LanguageRow } from './SettingsPanel'
import { L } from '../../lib/i18n'

// Sign in or open an account with an email and a password.

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': L('E-posta ya da şifre hatalı.', 'Wrong email or password.'),
  'User already registered': L('Bu e-postayla zaten bir hesap var; giriş yap.', 'An account with this email already exists; sign in.'),
  'Email not confirmed': L('E-postanı henüz onaylamadın; gelen kutuna bak.', 'You have not confirmed your email yet; check your inbox.'),
}
const explain = (e: unknown) => {
  const message = e instanceof Error ? e.message : ''
  if (message.includes('Password should be')) return L('Şifre en az 6 karakter olmalı.', 'The password must be at least 6 characters.')
  if (message.includes('rate limit')) return L('Çok fazla deneme oldu; biraz sonra tekrar dene.', 'Too many attempts; try again in a little while.')
  return MESSAGES[message] ?? L('Bir şeyler ters gitti; tekrar dene.', 'Something went wrong; try again.')
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
      return setError(L('Kullanıcı adı 3–20 harf, rakam ya da _ . - olmalı.', 'The username must be 3–20 characters: letters, digits or _ . -'))
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
            <h2>{L('E-postanı onayla', 'Confirm your email')}</h2>
            <small>{L(`${email} adresine bir bağlantı gönderdik`, `We sent a link to ${email}`)}</small>
          </div>
        </header>
        <div className="home-body">
          <p>{L('Bağlantıya tıkladıktan sonra buradan giriş yapabilirsin.', 'Once you have clicked the link you can sign in here.')}</p>
          <button className="btn wide" onClick={() => (setSent(false), setMode('in'))}>
            {L('Girişe dön', 'Back to sign in')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="home-card frame" aria-labelledby="auth-title">
      <div className="home-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'in'} className="btn small" onClick={() => (setMode('in'), setError(null))}>
          {L('Giriş yap', 'Sign in')}
        </button>
        <button role="tab" aria-selected={mode === 'up'} className="btn small" onClick={() => (setMode('up'), setError(null))}>
          {L('Hesap oluştur', 'Create account')}
        </button>
      </div>
      <form className="home-body form" onSubmit={submit}>
        <h2 id="auth-title" className="visually-hidden">
          {mode === 'in' ? L('Giriş yap', 'Sign in') : L('Hesap oluştur', 'Create account')}
        </h2>
        {mode === 'up' && (
          <label>
            <span>{L('Kullanıcı adı', 'Username')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="nickname" maxLength={20} required />
          </label>
        )}
        <label>
          <span>{L('E-posta', 'Email')}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          <span>{L('Şifre', 'Password')}</span>
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
        <button className="btn wide" disabled={busy} data-why={L('Sunucunun cevabı bekleniyor', 'Waiting for the server')}>
          {busy ? L('Bekle…', 'Wait…') : mode === 'in' ? L('Giriş yap', 'Sign in') : L('Hesabı oluştur', 'Create account')}
        </button>
        <LanguageRow />
      </form>
    </section>
  )
}

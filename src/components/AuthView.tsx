import { FormEvent, useMemo, useState } from 'react'
import { FiDatabase, FiLock, FiLogIn, FiUserPlus } from 'react-icons/fi'
import useAppStore from '../store/appStore'

type AuthMode = 'login' | 'register'

const emptyForm = {
  username: '',
  email: '',
  password: '',
}

export default function AuthView() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const login = useAppStore(s => s.login)
  const register = useAppStore(s => s.register)
  const status = useAppStore(s => s.status)

  const isRegister = mode === 'register'
  const title = isRegister ? 'Create CatDB Account' : 'Sign in to CatDB'
  const helper = isRegister
    ? 'Register a workspace user stored in your PostgreSQL auth database.'
    : 'Use your username to unlock the database workspace.'

  const canSubmit = useMemo(() => {
    const hasPassword = form.password.length >= 8
    return isRegister
      ? hasPassword && form.username.trim().length >= 3 && form.email.trim().length > 0
      : hasPassword && form.username.trim().length > 0
  }, [form, isRegister])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    try {
      const ok = isRegister
        ? await register(form)
        : await login({ username: form.username, password: form.password })
      if (ok) setForm(emptyForm)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="auth-mark"><FiDatabase size={24} /></span>
          <div>
            <div className="auth-brand-name">CatDB</div>
            <div className="auth-brand-subtitle">PostgreSQL Authentication</div>
          </div>
        </div>

        <div className="auth-copy">
          <div className="auth-kicker">Secure workspace</div>
          <h1>{title}</h1>
          <p>{helper}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={!isRegister ? 'is-active' : ''}
              onClick={() => setMode('login')}
            >
              <FiLogIn size={16} />
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? 'is-active' : ''}
              onClick={() => setMode('register')}
            >
              <FiUserPlus size={16} />
              Register
            </button>
          </div>

          <label className="auth-field">
            <span>Username</span>
            <input
              value={form.username}
              onChange={event => setForm(current => ({ ...current, username: event.target.value }))}
              autoComplete="username"
              placeholder="sahar"
            />
          </label>

          {isRegister && (
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              placeholder="Minimum 8 characters"
            />
          </label>

          {status.error && <div className="auth-error">{status.message}</div>}

          <button className="auth-submit" type="submit" disabled={!canSubmit || submitting}>
            <FiLock size={16} />
            {submitting ? 'Please wait...' : isRegister ? 'Create account' : 'Login'}
          </button>
        </form>
      </section>
    </div>
  )
}

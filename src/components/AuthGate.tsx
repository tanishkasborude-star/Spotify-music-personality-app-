import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

interface AuthGateProps {
  onPreview: () => void
  onSignedIn: (session: Session) => void
  initialError?: string
}

export default function AuthGate({ onPreview, onSignedIn, initialError = '' }: AuthGateProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError('Configure Supabase in .env.local before creating an account or signing in.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'sign-in') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        if (data.session) onSignedIn(data.session)
        else setError('Supabase signed in without a session. Please try again.')
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email, password })
        if (authError) throw authError
        if (data.session) onSignedIn(data.session)
        else setNotice('Check your email to confirm your Soundprint account, then come back to sign in.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication did not complete.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <a className="brand auth-brand" href="#" aria-label="Soundprint home">
        <span className="brand-mark">s.</span><span>SOUNDPRINT</span>
      </a>
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="eyebrow"><span>✳</span> YOUR MUSIC, YOUR MIRROR</p>
        <h1 id="auth-title">{mode === 'sign-in' ? <>Come back to<br /><em>your sound.</em></> : <>Make room for<br /><em>your sound.</em></>}</h1>
        <p className="auth-description">Sign in to your Soundprint account, then link Spotify. Your Spotify authorization stays in this browser session and can be cleared at any time.</p>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('sign-in'); setError(''); setNotice('') }}>SIGN IN</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('sign-up'); setError(''); setNotice('') }}>CREATE ACCOUNT</button>
        </div>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">EMAIL</label>
          <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="auth-password">PASSWORD</label>
          <input id="auth-password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button button-primary auth-submit" type="submit" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'ONE MOMENT…' : mode === 'sign-in' ? 'SIGN IN TO SOUNDPRINT' : 'CREATE MY ACCOUNT'} <span aria-hidden="true">↗</span>
          </button>
        </form>
        {!isSupabaseConfigured && (
          <p className="auth-config-note">Account sign-in needs Supabase setup. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.</p>
        )}
        <div className="auth-divider"><span>OR EXPLORE FIRST</span></div>
        <button className="button button-outline auth-preview" type="button" onClick={onPreview}>TRY THE SAMPLE WITHOUT AN ACCOUNT <span aria-hidden="true">→</span></button>
        <p className="privacy-line auth-privacy"><span>✳</span> Your Spotify account is only linked after you sign in.</p>
      </section>
    </main>
  )
}

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, AlertCircle, Loader, Mail } from 'lucide-react'
import { authApi, getAuthError } from '../services/authApi'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) return
    setStatus('loading')
    authApi.verifyEmail(token)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/'), 2000)
      })
      .catch(err => {
        setStatus('error')
        setMessage(getAuthError(err))
      })
  }, [token, navigate])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
        <div className="card max-w-md w-full text-center space-y-4">
          <Mail size={40} className="mx-auto text-accent-500" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Check your email</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            We sent a verification link to your email address. Click the link to activate your account.
          </p>

          {/* ── Dev-mode notice ── */}
          <div
            className="text-left rounded-lg border p-3 text-xs space-y-1"
            style={{
              background: 'var(--color-surface-50, #fffbeb)',
              borderColor: '#fbbf24',
              color: 'var(--color-text-secondary)',
            }}
          >
            <p className="font-semibold" style={{ color: '#d97706' }}>
              ⚠️ Development mode — emails are not sent
            </p>
            <p>
              SMTP is not configured, so the verification link was <strong>not emailed</strong>.
              Instead, the token was printed to the <strong>backend console</strong> (look for{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>[DEV MODE] Verification token</code>).
            </p>
            <p>
              Copy the link from the console and open it in your browser to complete verification.
            </p>
            <p className="mt-1 border-t pt-1" style={{ borderColor: '#fbbf24' }}>
              To enable real email: add{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>SMTP_HOST</code>,{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>SMTP_USER</code>,{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>SMTP_PASSWORD</code>,{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>SMTP_PORT</code> and{' '}
              <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>SMTP_FROM</code>{' '}
              to <code className="px-1 rounded" style={{ background: 'var(--color-border)' }}>backend/.env</code>.
            </p>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Didn't receive it?{' '}
            <button
              className="text-accent-600 hover:underline"
              onClick={async () => {
                try { await authApi.resendVerify() } catch {/* ignore */}
              }}
            >
              Resend
            </button>
          </p>
          <Link to="/" className="text-sm text-accent-600 hover:underline block">Go to dashboard</Link>
        </div>
      </div>
    )
  }


  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
      <div className="card max-w-md w-full text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader size={40} className="mx-auto text-accent-500 animate-spin" />
            <p className="text-surface-600 dark:text-surface-300">Verifying your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={40} className="mx-auto text-emerald-500" />
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">Email verified!</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">Redirecting to dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={40} className="mx-auto text-red-500" />
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">Verification failed</h1>
            <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
            <p className="text-sm text-surface-500">
              The link may have expired.{' '}
              <Link to="/login" className="text-accent-600 hover:underline">Sign in</Link> to request a new one.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

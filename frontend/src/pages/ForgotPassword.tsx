import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { authApi, getAuthError } from '../services/authApi'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [devToken, setDevToken] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await authApi.forgotPassword(email)
      setSent(true)
      if (result.dev_token) setDevToken(result.dev_token)
    } catch (err) {
      setError(getAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
        <div className="card max-w-md w-full text-center space-y-4">
          <CheckCircle size={40} className="mx-auto text-emerald-500" />
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Check your email</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            If that address is registered, a reset link has been sent. Check your inbox.
          </p>

          {devToken && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚠ Dev Mode — Use this token:</p>
              <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 rounded p-2 break-all text-amber-900 dark:text-amber-200 select-all">
                {devToken}
              </code>
              <Link
                to={`/reset-password?token=${devToken}`}
                className="btn-primary text-sm text-center w-full mt-2 inline-block"
              >
                Reset Password Now
              </Link>
            </div>
          )}

          <Link to="/login" className="text-sm text-accent-600 hover:underline flex items-center justify-center gap-1">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <Mail size={36} className="mx-auto text-accent-500" />
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Reset your password</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="form-label">Email address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="form-input pl-9"
              />
            </div>
          </div>

          <button
            id="forgot-password-btn"
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : 'Send reset link'}
          </button>
        </form>

        <Link to="/login" className="text-sm text-accent-600 hover:underline flex items-center justify-center gap-1">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import { authApi, getAuthError } from '../services/authApi'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
        <div className="card max-w-md w-full text-center space-y-4">
          <AlertCircle size={36} className="mx-auto text-red-500" />
          <p className="text-surface-600 dark:text-surface-300">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-accent-600 hover:underline text-sm">Request a new link</Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(getAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
        <div className="card max-w-md w-full text-center space-y-4">
          <CheckCircle size={40} className="mx-auto text-emerald-500" />
          <h1 className="text-xl font-bold text-surface-900 dark:text-white">Password reset!</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">Redirecting to sign in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-1">
          <Lock size={32} className="mx-auto text-accent-500" />
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Set new password</h1>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="form-label">New password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reset-password"
                type={show ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="form-input pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="reset-confirm" className="form-label">Confirm new password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reset-confirm"
                type={show ? 'text' : 'password'}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="form-input pl-9"
              />
            </div>
            {confirm && confirm !== password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            id="reset-password-btn"
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}

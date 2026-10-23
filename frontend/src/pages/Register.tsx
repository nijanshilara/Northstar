import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Eye, EyeOff, Compass, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getAuthError } from '../services/authApi'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devToken, setDevToken] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const strength = (() => {
    const p = form.password
    if (!p) return 0
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  })()

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'][strength]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const result = await register(form.name, form.email, form.password)
      if (result.devToken) {
        setDevToken(result.devToken)
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  if (devToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
        <div className="card max-w-md w-full space-y-5 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Account created!</h1>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 text-left space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">⚠ Dev Mode — No SMTP configured</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Email sending is disabled. Use this token to verify your account manually:
            </p>
            <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 rounded p-2 break-all text-amber-900 dark:text-amber-200 select-all">
              {devToken}
            </code>
            <Link
              to={`/verify-email?token=${devToken}`}
              className="btn-primary text-sm text-center w-full mt-2 inline-block"
            >
              Verify Email Now
            </Link>
          </div>
          <Link to="/" className="text-sm text-accent-600 hover:underline">Continue to dashboard →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-body-bg)' }}>
      <div className="card max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center mx-auto shadow-md">
            <Compass size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Join Northstar</h1>
          <p className="text-sm font-medium text-accent-600 dark:text-accent-400">Your compass to everywhere.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="reg-name" className="form-label">Full name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={set('name')}
                placeholder="Your name"
                className="form-input pl-9"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="form-label">Email address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                className="form-input pl-9"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="form-label">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reg-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                className="form-input pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.password && (
              <div className="mt-1.5 space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor : 'bg-surface-200 dark:bg-surface-700'}`} />
                  ))}
                </div>
                <p className="text-xs text-surface-500">{strengthLabel} — needs uppercase and a number</p>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label htmlFor="reg-confirm" className="form-label">Confirm password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                id="reg-confirm"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={set('confirm')}
                placeholder="Repeat your password"
                className="form-input pl-9"
              />
            </div>
            {form.confirm && form.confirm !== form.password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            id="register-submit-btn"
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-surface-500 dark:text-surface-400">
          Already have an account?{' '}
          <Link to="/login" className="text-accent-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

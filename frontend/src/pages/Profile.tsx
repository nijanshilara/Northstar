import { useState } from 'react'
import { User, Mail, Lock, Trash2, CheckCircle, AlertCircle, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authApi, getAuthError } from '../services/authApi'
import { useNavigate } from 'react-router-dom'

type Section = 'profile' | 'password' | 'danger'

export default function Profile() {
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<Section>('profile')

  // --- Profile form ---
  const [name, setName] = useState(user?.name ?? '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    setProfileSaving(true)
    try {
      const updated = await authApi.updateProfile({ name })
      updateUser(updated)
      setProfileMsg({ type: 'ok', text: 'Profile updated.' })
    } catch (err) {
      setProfileMsg({ type: 'err', text: getAuthError(err) })
    } finally {
      setProfileSaving(false)
    }
  }

  // --- Password form ---
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const setPw = (k: keyof typeof pwForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPwForm(f => ({ ...f, [k]: e.target.value }))
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: 'err', text: 'New passwords do not match.' }); return }
    setPwSaving(true)
    try {
      await authApi.changePassword(pwForm.current, pwForm.next)
      setPwMsg({ type: 'ok', text: 'Password changed.' })
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg({ type: 'err', text: getAuthError(err) })
    } finally {
      setPwSaving(false)
    }
  }

  // --- Delete account ---
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    setDeleteErr('')
    try {
      await authApi.deleteAccount()
      await logout()
      navigate('/login')
    } catch (err) {
      setDeleteErr(getAuthError(err))
      setDeleting(false)
    }
  }

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'password', label: 'Password', icon: <Lock size={16} /> },
    { id: 'danger', label: 'Danger zone', icon: <Trash2 size={16} /> },
  ]

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Account</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Manage your account details and security</p>
      </div>

      {/* Email verification banner */}
      {!user.is_verified && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
          <Shield size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Email not verified</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Verify your email to unlock all features.</p>
          </div>
          <button
            className="text-xs text-amber-700 dark:text-amber-300 hover:underline font-medium"
            onClick={async () => {
              try { await authApi.resendVerify() } catch {/* ignore */}
            }}
          >
            Resend
          </button>
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-surface-200 dark:border-surface-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              section === tab.id
                ? 'border-accent-600 text-accent-700 dark:text-accent-400'
                : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile section */}
      {section === 'profile' && (
        <div className="card space-y-5">
          <h2 className="font-semibold text-surface-900 dark:text-white">Profile details</h2>

          {profileMsg && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              profileMsg.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
            }`}>
              {profileMsg.type === 'ok' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label htmlFor="profile-name" className="form-label">Full name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="form-input pl-9"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="form-input pl-9 opacity-60 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">Email cannot be changed.</p>
            </div>

            <button
              id="save-profile-btn"
              type="submit"
              disabled={profileSaving}
              className="btn-primary flex items-center gap-2"
            >
              {profileSaving
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Save changes'}
            </button>
          </form>
        </div>
      )}

      {/* Password section */}
      {section === 'password' && (
        <div className="card space-y-5">
          <h2 className="font-semibold text-surface-900 dark:text-white">Change password</h2>

          {pwMsg && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              pwMsg.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
            }`}>
              {pwMsg.type === 'ok' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={savePassword} className="space-y-4">
            {(['current', 'next', 'confirm'] as const).map(k => (
              <div key={k}>
                <label htmlFor={`pw-${k}`} className="form-label">
                  {k === 'current' ? 'Current password' : k === 'next' ? 'New password' : 'Confirm new password'}
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    id={`pw-${k}`}
                    type="password"
                    required
                    value={pwForm[k]}
                    onChange={setPw(k)}
                    className="form-input pl-9"
                  />
                </div>
              </div>
            ))}
            <button
              id="change-password-btn"
              type="submit"
              disabled={pwSaving}
              className="btn-primary flex items-center gap-2"
            >
              {pwSaving
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Change password'}
            </button>
          </form>
        </div>
      )}

      {/* Danger zone */}
      {section === 'danger' && (
        <div className="card border border-red-200 dark:border-red-800 space-y-4">
          <h2 className="font-semibold text-red-700 dark:text-red-400">Delete account</h2>
          <p className="text-sm text-surface-600 dark:text-surface-400">
            This permanently deletes your account and all associated data including trips, itineraries, expenses and history.
            <strong className="text-red-600 dark:text-red-400"> This cannot be undone.</strong>
          </p>

          {deleteErr && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {deleteErr}
            </div>
          )}

          <div>
            <label htmlFor="delete-confirm" className="form-label">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="form-input"
            />
          </div>

          <button
            id="delete-account-btn"
            onClick={deleteAccount}
            disabled={deleteConfirm !== 'DELETE' || deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {deleting
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <><Trash2 size={16} />Delete my account</>}
          </button>
        </div>
      )}
    </div>
  )
}

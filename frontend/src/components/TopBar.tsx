import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Menu, Compass, LogOut, UserCircle, LogIn, ChevronDown, History } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type TopBarProps = {
  onMenuToggle: () => void
  isDemoMode: boolean
  overallMode?: 'live' | 'hybrid' | 'demo'
}

export default function TopBar({ onMenuToggle, isDemoMode, overallMode = 'hybrid' }: TopBarProps) {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate and update anchored dropdown coordinates relative to viewport
  const updateMenuPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
      })
    }
  }

  // Handle positioning, scroll/resize tracking, outside click, and Escape key dismissal
  useEffect(() => {
    if (!menuOpen) return

    updateMenuPosition()

    const handleScrollOrResize = () => updateMenuPosition()
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="relative z-30 flex items-center justify-between border-b px-6 py-3 h-14 flex-shrink-0"
      style={{
        background: 'var(--color-card-bg)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="btn-ghost rounded-lg p-2"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <Compass size={20} className="text-accent-600" />
        <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Northstar
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {overallMode === 'live' ? (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
            🟢 Live Mode
          </span>
        ) : overallMode === 'hybrid' ? (
          <Link
            to="/settings"
            className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 hover:opacity-80 transition-opacity"
            title="Open-Meteo & local database are live. AI is in fallback mode. Click to view details."
          >
            ⚡ Hybrid Mode
          </Link>
        ) : isDemoMode ? (
          <span className="badge-demo">Demo Mode</span>
        ) : null}

        {/* Authenticated: user menu */}
        {isAuthenticated && user ? (
          <div className="relative">
            <button
              ref={buttonRef}
              id="user-menu-btn"
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors cursor-pointer"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              {/* Avatar initials */}
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>
                {user.name.split(' ')[0]}
              </span>
              <ChevronDown size={14} className="text-surface-400" />
            </button>

            {/* Dropdown — rendered via React portal directly to document.body to prevent stacking context or card clipping */}
            {menuOpen && createPortal(
              <div
                ref={menuRef}
                id="profile-dropdown-portal"
                role="menu"
                aria-label="User profile menu"
                className="fixed w-56 rounded-xl shadow-2xl border py-1.5 transition-all animate-fade-in"
                style={{
                  top: `${menuPos.top}px`,
                  right: `${menuPos.right}px`,
                  backgroundColor: 'var(--color-card-bg, #ffffff)',
                  borderColor: 'var(--color-border, #e2e8f0)',
                  zIndex: 999999,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--color-border, #e2e8f0)' }}>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {user.name}
                  </p>
                  <p className="text-xs truncate font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    {user.email}
                  </p>
                  {!user.is_verified && (
                    <span className="inline-block mt-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                      ⚠ Email not verified
                    </span>
                  )}
                </div>

                <div className="py-1">
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-100 dark:hover:bg-slate-700"
                    style={{ color: 'var(--color-text-primary)' }}
                    role="menuitem"
                  >
                    <UserCircle size={16} className="text-accent-600 dark:text-accent-400" />
                    Account & Profile
                  </Link>

                  <Link
                    to="/history"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-100 dark:hover:bg-slate-700"
                    style={{ color: 'var(--color-text-primary)' }}
                    role="menuitem"
                  >
                    <History size={16} className="text-accent-600 dark:text-accent-400" />
                    History
                  </Link>
                </div>

                <div className="border-t my-1" style={{ borderColor: 'var(--color-border, #e2e8f0)' }} />

                <button
                  id="logout-btn"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                  role="menuitem"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>,
              document.body
            )}
          </div>
        ) : (
          /* Unauthenticated: Sign in button */
          <Link
            to="/login"
            id="topbar-signin-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-200 transition-colors"
          >
            <LogIn size={15} />
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
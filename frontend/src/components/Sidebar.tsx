import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Briefcase, Compass, Plane, Hotel, Bus,
  CalendarDays, PiggyBank, CloudSun, Receipt, Bot,
  ShieldCheck, Settings, ChevronLeft, ChevronRight,
  Sparkles, Zap, History, UserCircle, Camera, ArrowLeftRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface NavSection {
  id: string
  label: string
  icon: React.ReactNode
  path: string
  badge?: string
  requiresAuth?: boolean
}

const NAV_SECTIONS: NavSection[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} />, path: '/' },
  { id: 'trips', label: 'My Trips', icon: <Briefcase size={18} />, path: '/trips' },
  { id: 'capsules', label: 'Memory Capsules', icon: <Camera size={18} />, path: '/capsules' },
  { id: 'explore', label: 'Explore', icon: <Compass size={18} />, path: '/explore' },
  { id: 'flights', label: 'Flights', icon: <Plane size={18} />, path: '/flights' },
  { id: 'hotels', label: 'Hotels', icon: <Hotel size={18} />, path: '/hotels' },
  { id: 'transport', label: 'Transport', icon: <Bus size={18} />, path: '/transport' },
  { id: 'itinerary', label: 'Itinerary', icon: <CalendarDays size={18} />, path: '/itinerary' },
  { id: 'budget', label: 'Budget & Savings', icon: <PiggyBank size={18} />, path: '/budget' },
  { id: 'weather', label: 'Weather', icon: <CloudSun size={18} />, path: '/weather' },
  { id: 'splitwise', label: 'Splitwise', icon: <Receipt size={18} />, path: '/splitwise' },
  { id: 'currency', label: 'Currency Converter', icon: <ArrowLeftRight size={18} />, path: '/currency' },
  { id: 'assistant', label: 'AI Assistant', icon: <Bot size={18} />, path: '/ai-assistant', badge: 'AI' },
  { id: 'safety', label: 'Safety & Emergency', icon: <ShieldCheck size={18} />, path: '/safety' },
  { id: 'history', label: 'History', icon: <History size={18} />, path: '/history', requiresAuth: true },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} />, path: '/settings' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  currentPath: string
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { isAuthenticated, user } = useAuth()
  const [comingSoon, setComingSoon] = useState<string | null>(null)

  const showComingSoon = (name: string) => {
    setComingSoon(name)
    setTimeout(() => setComingSoon(null), 2500)
  }

  const visibleSections = NAV_SECTIONS.filter(s =>
    !s.requiresAuth || isAuthenticated
  )

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 248 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="sidebar-container relative flex flex-col h-full border-r z-20 overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Compass size={18} className="text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="min-w-0"
            >
              <p className="sidebar-brand-title text-sm font-bold tracking-tight truncate">Northstar</p>
              <p className="sidebar-brand-subtitle text-[11px] truncate font-medium">Your compass to everywhere</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Special buttons — Trip Lab + Live Mode */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 flex gap-2">
          <button
            id="trip-lab-btn"
            onClick={() => showComingSoon('Trip Lab')}
            className="sidebar-action-btn flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg
                       text-xs font-medium transition-colors duration-150"
            title="Trip Lab — Compare alternative trip scenarios (Phase 4)"
          >
            <Sparkles size={12} />
            Trip Lab
          </button>
          <button
            id="live-mode-btn"
            onClick={() => showComingSoon('Live Mode')}
            className="sidebar-action-btn-live flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg
                       text-xs font-medium transition-colors duration-150"
            title="Live Mode — Manage today's schedule (Phase 4)"
          >
            <Zap size={12} />
            Live Mode
          </button>
        </div>
      )}
      {/* Coming Soon toast */}
      <AnimatePresence>
        {comingSoon && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mx-3 mb-1 px-3 py-2 rounded-lg text-xs text-center font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            {comingSoon} — Coming soon!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {visibleSections.map(section => (
          <NavLink
            key={section.id}
            to={section.path}
            end={section.path === '/'}
            id={`nav-${section.id}`}
            className={({ isActive }) =>
              isActive ? 'nav-item-active' : 'nav-item'
            }
            title={collapsed ? section.label : undefined}
          >
            <span className="flex-shrink-0">{section.icon}</span>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="truncate flex-1"
                >
                  {section.label}
                </motion.span>
              )}
            </AnimatePresence>
            {section.badge && !collapsed && (
              <span className="badge-accent text-xs px-1.5 py-0">{section.badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile link at the bottom */}
      {isAuthenticated && (
        <div className="px-2 pb-2">
          <NavLink
            to="/profile"
            id="nav-profile"
            className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
            title={collapsed ? 'Profile' : undefined}
          >
            <div className="w-5 h-5 rounded-full bg-accent-600 flex items-center justify-center flex-shrink-0">
              <UserCircle size={14} className="text-white" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="min-w-0 flex-1"
                >
                  <p className="sidebar-profile-name text-xs font-semibold truncate">{user?.name ?? 'Profile'}</p>
                  <p className="sidebar-profile-email text-xs truncate font-medium">{user?.email ?? ''}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </NavLink>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          id="sidebar-toggle-btn"
          onClick={onToggle}
          className="sidebar-toggle-btn w-full flex items-center justify-center py-2 rounded-lg transition-colors duration-150"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </motion.aside>
  )
}

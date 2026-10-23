import { useState, useEffect, useCallback } from 'react'
import {
  History as HistoryIcon, Search, Star, StarOff, Trash2, RefreshCw,
  MapPin, Calendar, Route, Heart, AlertCircle, Inbox
} from 'lucide-react'
import { historyApi, type HistoryItem, getAuthError } from '../services/authApi'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

const EVENT_ICONS: Record<string, React.ReactNode> = {
  search: <Search size={14} />,
  itinerary_generated: <Route size={14} />,
  trip_created: <Calendar size={14} />,
  trip_viewed: <MapPin size={14} />,
  favourite: <Heart size={14} />,
}

const EVENT_LABELS: Record<string, string> = {
  search: 'Search',
  itinerary_generated: 'Itinerary',
  trip_created: 'Trip created',
  trip_viewed: 'Trip viewed',
  favourite: 'Favourite',
}

const FILTERS = ['All', 'search', 'itinerary_generated', 'trip_created', 'trip_viewed', 'favourite', 'Saved']

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 30) return new Date(iso).toLocaleDateString()
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

export default function HistoryPage() {
  const { isAuthenticated } = useAuth()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Parameters<typeof historyApi.list>[0] = { limit: 200 }
      if (filter !== 'All' && filter !== 'Saved') params.event_type = filter
      if (filter === 'Saved') params.saved_only = true
      setItems(await historyApi.list(params))
    } catch (err) {
      setError(getAuthError(err))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i =>
    !search || i.label.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSave = async (id: number) => {
    try {
      const updated = await historyApi.toggleSave(id)
      setItems(prev => prev.map(i => i.id === id ? updated : i))
    } catch {/* ignore */}
  }

  const deleteItem = async (id: number) => {
    try {
      await historyApi.delete(id)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {/* ignore */}
  }

  const clearAll = async () => {
    setClearing(true)
    try {
      await historyApi.clear()
      setItems([])
      setConfirmClear(false)
    } catch {/* ignore */}
    finally { setClearing(false) }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <HistoryIcon size={40} className="text-surface-400" />
        <h2 className="text-xl font-semibold text-surface-900 dark:text-white">Sign in to view your history</h2>
        <p className="text-sm text-surface-500">Your searches and saved itineraries will appear here after you sign in.</p>
        <Link to="/login" className="btn-primary">Sign in</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <HistoryIcon size={24} /> History
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Your searches, generated itineraries and saved trips
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="btn-ghost p-2 rounded-lg"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {items.length > 0 && !confirmClear && (
            <button
              onClick={() => setConfirmClear(true)}
              className="btn-ghost text-red-500 hover:text-red-700 text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg"
            >
              <Trash2 size={14} /> Clear all
            </button>
          )}
          {confirmClear && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-surface-600 dark:text-surface-300">Clear all history?</span>
              <button
                onClick={clearAll}
                disabled={clearing}
                className="text-red-600 hover:underline font-medium"
              >
                {clearing ? 'Clearing…' : 'Yes, clear'}
              </button>
              <button onClick={() => setConfirmClear(false)} className="text-surface-500 hover:underline">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          placeholder="Search history…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input pl-9 w-full"
          id="history-search"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-accent-600 border-accent-600 text-white'
                : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-accent-400'
            }`}
          >
            {f === 'All' || f === 'Saved' ? f : (EVENT_LABELS[f] ?? f)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse h-16 bg-surface-100 dark:bg-surface-800" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Inbox size={36} className="text-surface-300 dark:text-surface-600" />
          <p className="text-surface-500 dark:text-surface-400 text-sm">
            {search || filter !== 'All' ? 'No matching history items.' : 'No history yet. Start planning a trip!'}
          </p>
        </div>
      )}

      {/* History list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              className="card flex items-center gap-3 py-3 px-4 group hover:shadow-md transition-shadow"
            >
              {/* Type icon */}
              <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center text-accent-600 dark:text-accent-400 flex-shrink-0">
                {EVENT_ICONS[item.event_type] ?? <HistoryIcon size={14} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{item.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-surface-400 dark:text-surface-500">
                    {EVENT_LABELS[item.event_type] ?? item.event_type}
                  </span>
                  <span className="text-xs text-surface-300 dark:text-surface-600">·</span>
                  <span className="text-xs text-surface-400 dark:text-surface-500">{relative(item.created_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => toggleSave(item.id)}
                  title={item.is_saved ? 'Unsave' : 'Save'}
                  className={`p-1.5 rounded-lg transition-colors ${
                    item.is_saved
                      ? 'text-amber-500 hover:text-amber-600'
                      : 'text-surface-400 hover:text-amber-500'
                  }`}
                >
                  {item.is_saved ? <Star size={15} fill="currentColor" /> : <StarOff size={15} />}
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  title="Delete"
                  className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Saved badge */}
              {item.is_saved && (
                <Star size={13} className="text-amber-400 flex-shrink-0 fill-current ml-1" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

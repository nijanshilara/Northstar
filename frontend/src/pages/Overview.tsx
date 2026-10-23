import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, CalendarDays, PiggyBank, Receipt, Compass, Camera,
  ChevronRight, Sparkles, Loader2, CheckCircle2, AlertCircle,
  MapPin, Clock, ArrowRight,
} from 'lucide-react'
import { listTrips, seedDemoData, getErrorMessage, getItineraryBudget, type BudgetBreakdown } from '../services/api'
import type { Trip } from '../types'
import { formatDate, daysUntil, STATUS_CLASSES } from '../utils/format'
import CurrencyAmount from '../components/CurrencyAmount'

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color, to,
}: {
  label: string; value: string | number | React.ReactNode; sub?: string
  icon: React.ReactNode; color: string; to: string
}) {
  return (
    <Link to={to} className="card-hover flex items-start gap-4 group" id={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold text-surface-900 tabular-nums">{value}</div>
        <p className="text-sm font-medium text-surface-700">{label}</p>
        {sub && <p className="text-xs text-surface-400 mt-0.5 truncate">{sub}</p>}
      </div>
      <ChevronRight size={16} className="text-surface-300 group-hover:text-accent-500 mt-1 transition-colors flex-shrink-0" />
    </Link>
  )
}

// ── Next Trip Card ─────────────────────────────────────────────────────────

function NextTripCard({ trip }: { trip: Trip }) {
  const [budget, setBudget] = useState<BudgetBreakdown | null>(null)
  const [budgetLoading, setBudgetLoading] = useState(true)

  useEffect(() => {
    let active = true
    getItineraryBudget(trip.id)
      .then(res => {
        if (active) setBudget(res.data)
      })
      .catch(() => {
        if (active) setBudget(null)
      })
      .finally(() => {
        if (active) setBudgetLoading(false)
      })
    return () => { active = false }
  }, [trip.id])

  const days = daysUntil(trip.departure_date)
  const daysLabel =
    days === 0 ? 'Today!' :
    days === 1 ? 'Tomorrow' :
    days < 0  ? `${Math.abs(days)} days ago` :
    `In ${days} days`

  const budgetCap = trip.budget_minor > 0 ? trip.budget_minor : (budget?.budget_cap_minor ?? 0)
  const totalSpent = budget?.actual_spent_minor && budget.actual_spent_minor > 0
    ? budget.actual_spent_minor
    : (budget?.total_minor ?? 0)
  const remaining = budgetCap > 0 ? budgetCap - totalSpent : null
  const isOver = remaining !== null && remaining < 0

  return (
    <div className="card flex flex-col gap-4 border border-surface-200 dark:border-slate-800 shadow-sm hover:shadow transition-shadow" id="next-trip-card">
      {/* Top Header: Badge, Title & Countdown */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400 flex items-center gap-1">
              <Compass size={13} className="text-accent-500" />
              Next Expedition
            </span>
            <span className="text-xs text-surface-400">·</span>
            <span className="text-xs font-semibold text-accent-700 dark:text-accent-300 bg-accent-50 dark:bg-accent-950/40 px-2 py-0.5 rounded-full border border-accent-200 dark:border-accent-800">
              {daysLabel}
            </span>
          </div>
          <h2 className="text-xl font-bold text-surface-900 dark:text-white leading-tight">{trip.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {trip.is_demo && <span className="badge-demo text-xs">DEMO DATA</span>}
          <span className={`badge border text-xs ${STATUS_CLASSES[trip.status]}`}>
            {trip.status}
          </span>
        </div>
      </div>

      {/* Route & Dates & Duration */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-slate-800/40 p-3 rounded-xl border border-surface-100 dark:border-slate-700/60">
        <span className="flex items-center gap-1.5 font-medium">
          <MapPin size={15} className="text-accent-500 flex-shrink-0" />
          <span className="text-surface-900 dark:text-white font-semibold">{trip.origin}</span>
          <span className="text-surface-400">→</span>
          <span className="text-surface-900 dark:text-white font-semibold">{trip.destination}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays size={15} className="text-accent-500 flex-shrink-0" />
          {formatDate(trip.departure_date)} — {formatDate(trip.return_date)}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-surface-500">
          <Clock size={14} className="text-accent-500 flex-shrink-0" />
          {trip.num_days} day{trip.num_days !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Financials & Direct Itinerary Link */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-100 dark:border-slate-800 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-surface-400 block mb-0.5">Total Budget</span>
            {budgetCap > 0 ? (
              <CurrencyAmount
                amount={budgetCap}
                currency={trip.currency}
                isMinor={true}
                className="font-bold text-surface-800 dark:text-surface-100 text-sm"
              />
            ) : (
              <span className="font-bold text-surface-800 dark:text-surface-100 text-sm">Unset</span>
            )}
          </div>
          <div className="h-7 w-[1px] bg-surface-200 dark:bg-slate-700" />
          <div>
            <span className="text-surface-400 block mb-0.5">Budget Remaining</span>
            {budgetLoading ? (
              <span className="text-surface-400 text-xs">Calculating…</span>
            ) : remaining !== null ? (
              <CurrencyAmount
                amount={Math.abs(remaining)}
                currency={trip.currency}
                isMinor={true}
                prefix={isOver ? '- ' : ''}
                suffix={isOver ? ' (Over)' : ''}
                className={`font-bold text-sm ${isOver ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
              />
            ) : (
              <span className="text-surface-500 text-xs">No expenses yet</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/budget?tripId=${trip.id}`}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            title="Inspect detailed budget and expenses"
          >
            <PiggyBank size={14} />
            <span>Budget</span>
          </Link>
          <Link
            to={`/itinerary?tripId=${trip.id}`}
            id="next-trip-view-itinerary-btn"
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
            title="Open itinerary plan for this trip"
          >
            <Compass size={14} />
            <span>View Itinerary</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Quick Links ────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'My Trips',    to: '/trips',      icon: <Briefcase size={18} />,   color: 'bg-accent-50 text-accent-600' },
  { label: 'Capsules',    to: '/capsules',   icon: <Camera size={18} />,      color: 'bg-rose-50 text-rose-600' },
  { label: 'Itinerary',  to: '/itinerary',  icon: <CalendarDays size={18} />, color: 'bg-indigo-50 text-indigo-600' },
  { label: 'Budget',     to: '/budget',     icon: <PiggyBank size={18} />,    color: 'bg-emerald-50 text-emerald-600' },
  { label: 'Splitwise',  to: '/splitwise',  icon: <Receipt size={18} />,      color: 'bg-orange-50 text-orange-600' },
  { label: 'Explore',    to: '/explore',    icon: <Compass size={18} />,      color: 'bg-purple-50 text-purple-600' },
]

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
  onSeed, seeding, seedMsg,
}: {
  onSeed: () => void; seeding: boolean; seedMsg: { ok: boolean; text: string } | null
}) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 gap-4 text-center" id="empty-state">
      <div className="w-16 h-16 rounded-2xl bg-accent-50 flex items-center justify-center">
        <Briefcase size={28} className="text-accent-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-surface-900">No trips yet</h2>
        <p className="text-sm text-surface-500 mt-1 max-w-xs mx-auto">
          Create your first trip or load demo data to explore the app.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/trips" className="btn-primary" id="create-first-trip-btn">
          + New Trip
        </Link>
        <button
          id="seed-demo-btn"
          onClick={onSeed}
          disabled={seeding}
          className="btn-secondary flex items-center gap-2"
        >
          {seeding ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} className="text-accent-500" />
          )}
          {seeding ? 'Loading demo…' : 'Load demo data'}
        </button>
      </div>
      {seedMsg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${seedMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {seedMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {seedMsg.text}
        </div>
      )}
    </div>
  )
}

// ── Overview page ──────────────────────────────────────────────────────────

export default function Overview() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadTrips = () => {
    setLoading(true)
    setError(null)
    listTrips()
      .then(res => setTrips(res.data))
      .catch(e => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTrips() }, [])

  const handleSeed = () => {
    setSeeding(true)
    setSeedMsg(null)
    seedDemoData()
      .then(() => {
        setSeedMsg({ ok: true, text: 'Demo data loaded! Refreshing…' })
        setTimeout(() => { loadTrips(); setSeedMsg(null) }, 1000)
      })
      .catch(e => setSeedMsg({ ok: false, text: getErrorMessage(e) }))
      .finally(() => setSeeding(false))
  }

  // Derive stats
  const upcoming = trips
    .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    .sort((a, b) => new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime())
  const nextTrip = upcoming[0] ?? null
  const targetBudgetTrip = nextTrip ?? (trips.length > 0 ? trips[0] : null)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="page-title">Welcome to Northstar</h1>
        <p className="page-subtitle">Your compass to everywhere · Travel planning dashboard</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} />
          <span>Could not reach the backend: {error}</span>
          <button onClick={loadTrips} className="ml-auto text-red-600 hover:underline text-xs">Retry</button>
        </div>
      )}

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Trips" value={trips.length}
            sub={upcoming.length > 0 ? `${upcoming.length} upcoming` : 'Plan your first!'}
            icon={<Briefcase size={20} className="text-accent-600" />}
            color="bg-accent-50" to="/trips"
          />
          <StatCard
            label="Upcoming" value={upcoming.length}
            sub={nextTrip ? `Next: ${nextTrip.destination}` : 'Nothing planned yet'}
            icon={<CalendarDays size={20} className="text-indigo-600" />}
            color="bg-indigo-50" to="/trips"
          />
          <StatCard
            label={targetBudgetTrip ? "Trip Budget" : "Budget"}
            value={targetBudgetTrip && targetBudgetTrip.budget_minor > 0 ? (
              <CurrencyAmount
                amount={targetBudgetTrip.budget_minor}
                currency={targetBudgetTrip.currency}
                isMinor={true}
                className="text-2xl font-bold text-surface-900 tabular-nums"
              />
            ) : '—'}
            sub={targetBudgetTrip ? (trips.length > 1 ? `${targetBudgetTrip.name} · ${trips.length} trips` : targetBudgetTrip.name) : 'No trips yet'}
            icon={<PiggyBank size={20} className="text-emerald-600" />}
            color="bg-emerald-50"
            to={targetBudgetTrip ? `/budget?tripId=${targetBudgetTrip.id}` : '/budget'}
          />
          <StatCard
            label="Explore" value="5 Ideas"
            sub="Demo destinations ready"
            icon={<Compass size={20} className="text-purple-600" />}
            color="bg-purple-50" to="/explore"
          />
        </div>
      )}

      {/* Next trip or empty state */}
      {!loading && (
        nextTrip
          ? <NextTripCard trip={nextTrip} />
          : <EmptyState onSeed={handleSeed} seeding={seeding} seedMsg={seedMsg} />
      )}

      {/* Quick links */}
      <div>
        <p className="text-sm font-medium text-surface-500 mb-3">Quick navigation</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map(l => (
            <Link
              key={l.to}
              to={l.label === 'Budget' && targetBudgetTrip ? `/budget?tripId=${targetBudgetTrip.id}` : l.to}
              id={`quick-link-${l.label.toLowerCase()}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm transition-all duration-150 ${l.color}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent trips list */}
      {!loading && trips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-surface-500">Recent trips</p>
            <Link to="/trips" className="text-xs text-accent-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {trips.slice(0, 5).map(trip => {
              const days = daysUntil(trip.departure_date)
              return (
                <div key={trip.id} className="card py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-surface-900 truncate">{trip.name}</p>
                      {trip.is_demo && <span className="badge-demo text-xs">DEMO</span>}
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {trip.origin} → {trip.destination} · {formatDate(trip.departure_date)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`badge border text-xs ${STATUS_CLASSES[trip.status]}`}>{trip.status}</span>
                    <p className="text-xs text-surface-400 mt-1">
                      {days >= 0 ? `in ${days}d` : `${Math.abs(days)}d ago`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
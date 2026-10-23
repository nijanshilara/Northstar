import { useEffect, useState } from 'react'
import {
  CalendarDays, MapPin, Clock, Lock, Unlock, Loader2,
  AlertCircle, ChevronDown, Info, CheckCircle2,
  Wand2, RefreshCw, TriangleAlert, PiggyBank, X,
  Edit2, Check, Wallet, ArrowRight, Sparkles, ShieldCheck,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  listTrips, listActivities, toggleLock, getErrorMessage,
  generateItinerary, getItinerary, replanItinerary, updateTrip, getItineraryBudget,
  type BudgetBreakdown, type DaySchedule,
} from '../services/api'
import type { Trip, Activity } from '../types'
import {
  formatDate, formatTime, formatDuration, formatMoney,
  CATEGORY_CLASSES,
} from '../utils/format'

// ── Replan modal ────────────────────────────────────────────────────────────

function ReplanModal({
  activity,
  onClose,
  onReplan,
}: {
  activity: Activity
  onClose: () => void
  onReplan: (reason: string, delayMinutes: number) => void
}) {
  const [reason, setReason] = useState<'closure' | 'delay' | 'cancellation'>('closure')
  const [delay, setDelay] = useState(60)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onReplan(reason, reason === 'delay' ? delay : 0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-surface-900">Report Disruption</h2>
            <p className="text-xs text-surface-500 mt-0.5 truncate max-w-xs">{activity.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Disruption type</label>
            <select
              id="replan-reason"
              className="input"
              value={reason}
              onChange={e => setReason(e.target.value as typeof reason)}
            >
              <option value="closure">Venue closed / unavailable</option>
              <option value="delay">Activity delayed</option>
              <option value="cancellation">Cancelled (remove & find alternative)</option>
            </select>
          </div>

          {reason === 'delay' && (
            <div>
              <label className="label">Delay duration (minutes)</label>
              <input
                id="replan-delay"
                type="number"
                className="input"
                min={15}
                max={480}
                step={15}
                value={delay}
                onChange={e => setDelay(Number(e.target.value))}
              />
            </div>
          )}

          <div className="text-xs text-surface-500 p-3 rounded-lg bg-amber-50 border border-amber-200 flex gap-2">
            <TriangleAlert size={13} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <span>
              Locked activities on this day will be preserved. The algorithm will find
              a suitable replacement tailored to your destination.
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            id="confirm-replan-btn"
            className="btn-primary flex-1"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Replan Day
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Activity row ────────────────────────────────────────────────────────────

function ActivityRow({
  activity, onToggleLock, onReportDisruption,
}: {
  activity: Activity
  onToggleLock: (id: number) => void
  onReportDisruption: (a: Activity) => void
}) {
  const [locking, setLocking] = useState(false)
  const catClass = CATEGORY_CLASSES[activity.category] ?? 'bg-surface-50 text-surface-500'

  const handleLock = async () => {
    setLocking(true)
    try { await toggleLock(activity.id); onToggleLock(activity.id) }
    catch { /* visual only */ }
    finally { setLocking(false) }
  }

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-150
        ${activity.is_locked
          ? 'bg-surface-50 border-surface-200 opacity-90'
          : 'bg-white border-surface-200 hover:border-accent-200 hover:shadow-card'}`}
      id={`activity-${activity.id}`}
    >
      {/* Time column */}
      <div className="flex-shrink-0 w-16 text-right pt-0.5">
        <p className="text-xs font-semibold text-surface-700">{formatTime(activity.start_time)}</p>
        {activity.end_time && (
          <p className="text-xs text-surface-400">{formatTime(activity.end_time)}</p>
        )}
      </div>

      {/* Dot */}
      <div className="flex flex-col items-center flex-shrink-0 mt-1.5">
        <div className={`w-2.5 h-2.5 rounded-full border-2 ${activity.is_locked
          ? 'bg-surface-300 border-surface-300' : 'bg-accent-500 border-accent-500'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-surface-900">{activity.name}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catClass}`}>
                {activity.category}
              </span>
              {activity.is_confirmed && (
                <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 size={11} /> Confirmed
                </span>
              )}
            </div>
            {activity.location && (
              <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1">
                <MapPin size={11} /> {activity.location}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Disruption report */}
            {!activity.is_locked && (
              <button
                id={`disrupt-btn-${activity.id}`}
                onClick={() => onReportDisruption(activity)}
                className="p-1.5 rounded-lg text-surface-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                title="Report disruption (closure / delay)"
              >
                <TriangleAlert size={13} />
              </button>
            )}
            {/* Lock */}
            <button
              id={`lock-btn-${activity.id}`}
              onClick={handleLock}
              disabled={locking}
              className={`p-1.5 rounded-lg transition-colors duration-150
                ${activity.is_locked
                  ? 'text-surface-400 hover:text-accent-600 hover:bg-accent-50'
                  : 'text-surface-300 hover:text-accent-600 hover:bg-accent-50'}`}
              title={activity.is_locked ? 'Unlock' : 'Lock to itinerary'}
            >
              {locking
                ? <Loader2 size={14} className="animate-spin" />
                : activity.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-surface-500">
          <span className="flex items-center gap-1"><Clock size={11} /> {formatDuration(activity.duration_minutes)}</span>
          {activity.cost_minor > 0 && (
            <span className="font-medium text-surface-700">{formatMoney(activity.cost_minor, activity.currency)}</span>
          )}
          {activity.opening_hours && (
            <span className="flex items-center gap-1"><Info size={11} /> {activity.opening_hours}</span>
          )}
          {activity.booking_required && (
            <span className="text-amber-600 font-medium">Booking required</span>
          )}
        </div>

        {activity.recommendation_reason && (
          <p className="text-xs text-accent-600 mt-1">{activity.recommendation_reason}</p>
        )}
      </div>
    </div>
  )
}

// ── Day section ─────────────────────────────────────────────────────────────

function DaySection({
  dayNumber,
  dateStr,
  theme,
  status,
  unfilledReason,
  activities,
  tripCurrency,
  onToggleLock,
  onReportDisruption,
}: {
  dayNumber: number
  dateStr: string
  theme?: string
  status?: 'scheduled' | 'partial' | 'unfilled'
  unfilledReason?: string
  activities: Activity[]
  tripCurrency?: string
  onToggleLock: (id: number) => void
  onReportDisruption: (a: Activity) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const dayDate = new Date(dateStr)
  const dayLabel = !isNaN(dayDate.getTime())
    ? dayDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : dateStr
  const totalCost = activities.reduce((s, a) => s + a.cost_minor, 0)
  const currency = activities[0]?.currency ?? tripCurrency ?? 'INR'
  const isScheduled = status === 'scheduled' || (!status && activities.length >= 2)
  const isPartial = status === 'partial' || (!status && activities.length === 1)

  return (
    <div className="space-y-2 border border-surface-200 dark:border-slate-800 rounded-2xl p-4 bg-white/70 dark:bg-slate-900/60 shadow-sm" id={`day-${dayNumber}`}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between py-1 group text-left"
        id={`day-toggle-${dayNumber}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent-600 flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0">
            {dayNumber}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-surface-900 dark:text-slate-100">Day {dayNumber}</p>
              <span className="text-xs text-surface-400 dark:text-slate-500">• {dayLabel}</span>
              {theme && (
                <span className="text-xs font-medium text-accent-700 dark:text-accent-300 italic truncate max-w-sm">
                  “{theme}”
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {isScheduled ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 size={10} /> Scheduled ({activities.length} {activities.length === 1 ? 'place' : 'places'})
                </span>
              ) : isPartial ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <TriangleAlert size={10} /> Partial ({activities.length} {activities.length === 1 ? 'place' : 'places'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <Info size={10} /> Unfilled (0 places)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {totalCost > 0 && (
            <span className="text-xs font-semibold text-surface-700 dark:text-slate-300">
              {formatMoney(totalCost, currency)}
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-surface-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-2 pt-2">
          {activities.length > 0 ? (
            activities.map(a => (
              <ActivityRow
                key={a.id}
                activity={a}
                onToggleLock={onToggleLock}
                onReportDisruption={onReportDisruption}
              />
            ))
          ) : (
            <div
              className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5"
              id={`day-${dayNumber}-empty`}
            >
              <div className="flex items-center gap-2">
                <Info size={14} className="text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  No activities planned for Day {dayNumber}
                </p>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 pl-5">
                <strong>Status Reason:</strong> {unfilledReason || 'Insufficient remaining budget or candidate places for this day.'}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-5">
                Note: This day remains firmly in your trip calendar. You can increase the trip budget or unlock optional activities to schedule more places, or manually add custom activities.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Budget bar ──────────────────────────────────────────────────────────────

function BudgetBar({
  budget,
  currency,
  trip,
  onBudgetUpdated,
}: {
  budget: BudgetBreakdown
  currency: string
  trip?: Trip
  onBudgetUpdated: (updatedTrip: Trip, newBudget: BudgetBreakdown) => void
}) {
  const [editing, setEditing] = useState(false)
  const currentMajor = trip && trip.budget_minor > 0
    ? (trip.budget_minor / 100).toString()
    : budget.budget_cap_minor > 0
      ? (budget.budget_cap_minor / 100).toString()
      : ''
  const [amountStr, setAmountStr] = useState(currentMajor)
  const [selectedCurrency, setSelectedCurrency] = useState(currency || 'INR')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (trip) {
      setAmountStr(trip.budget_minor > 0 ? (trip.budget_minor / 100).toString() : '')
      setSelectedCurrency(trip.currency || 'INR')
    }
  }, [trip])

  const categories = Object.entries(budget.by_category).sort((a, b) => b[1] - a[1])
  const budgetCap = trip?.budget_minor ?? budget.budget_cap_minor
  const remaining = budgetCap > 0 ? budgetCap - budget.total_minor : 0
  const isOver = budgetCap > 0 && budget.total_minor > budgetCap
  const overAmount = isOver ? budget.total_minor - budgetCap : 0

  const handleSave = async () => {
    if (!trip) return
    const val = parseFloat(amountStr)
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid positive number for the budget')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const budgetMinor = Math.round(val * 100)
      const res = await updateTrip(trip.id, {
        budget_minor: budgetMinor,
        currency: selectedCurrency,
      })
      const bRes = await getItineraryBudget(trip.id)
      onBudgetUpdated(res.data, bRes.data)
      setEditing(false)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const applyPreset = (amt: number) => {
    setAmountStr(amt.toString())
  }

  return (
    <div className="card space-y-4 border border-surface-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm" id="itinerary-budget-section">
      {/* Header with Title and Edit Trigger */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center">
            <PiggyBank size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-surface-900 dark:text-slate-100">Trip Budget & Expenses</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent-100 dark:bg-accent-950/60 text-accent-700 dark:text-accent-300">
                User-Controlled
              </span>
            </div>
            <p className="text-xs text-surface-500 dark:text-slate-400">
              {trip?.num_travellers && trip.num_travellers > 1
                ? `${trip.num_travellers} travellers · Per-person breakdown available`
                : 'Solo trip budget'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => { setEditing(true); setError(null) }}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              id="edit-budget-btn"
            >
              <Edit2 size={13} />
              <span>Edit Budget</span>
            </button>
          ) : (
            <button
              onClick={() => { setEditing(false); setError(null) }}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Inline Budget Editor */}
      {editing && (
        <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-slate-900/60 border border-surface-200 dark:border-slate-700 space-y-3 animate-fade-in" id="budget-edit-form">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-surface-700 dark:text-slate-200 flex items-center gap-1.5">
              <Wallet size={13} /> Set Trip Budget
            </span>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <span>Quick Presets:</span>
              {[5000, 12500, 50000].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-2 py-0.5 rounded-md border border-surface-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-accent-600 dark:text-accent-400 font-medium hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
                >
                  ₹{preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCurrency}
              onChange={e => setSelectedCurrency(e.target.value)}
              className="input w-24 text-xs font-medium"
              aria-label="Currency"
            >
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[160px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-surface-400">
                {selectedCurrency === 'INR' ? '₹' : selectedCurrency}
              </span>
              <input
                id="itinerary-budget-input"
                type="number"
                min="0"
                step="100"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="e.g. 25000"
                className="input pl-7 text-sm font-semibold"
                autoFocus
              />
            </div>
            <button
              id="save-budget-btn"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              <span>{saving ? 'Saving…' : 'Save Budget'}</span>
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 font-medium">{error}</p>
          )}
        </div>
      )}

      {/* Summary Cards: Cap, Spend, Remaining */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-surface-50 dark:bg-slate-900/40 border border-surface-200 dark:border-slate-700/80">
          <span className="text-[11px] font-medium text-surface-500 dark:text-slate-400 block">Total Budget Cap</span>
          <p className="text-base font-bold text-surface-900 dark:text-slate-100 mt-0.5" id="total-budget-display">
            {budgetCap > 0 ? formatMoney(budgetCap, currency) : 'Unset'}
          </p>
          {trip && trip.num_travellers > 1 && budgetCap > 0 && (
            <span className="text-[11px] text-surface-500 dark:text-slate-400">
              {formatMoney(Math.round(budgetCap / trip.num_travellers), currency)} / person
            </span>
          )}
        </div>

        <div className="p-3 rounded-xl bg-surface-50 dark:bg-slate-900/40 border border-surface-200 dark:border-slate-700/80">
          <span className="text-[11px] font-medium text-surface-500 dark:text-slate-400 block">Estimated Spend</span>
          <p className="text-base font-bold text-surface-900 dark:text-slate-100 mt-0.5" id="total-spend-display">
            {formatMoney(budget.total_minor, currency)}
          </p>
          {trip && trip.num_travellers > 1 && (
            <span className="text-[11px] text-surface-500 dark:text-slate-400">
              {formatMoney(Math.round(budget.total_minor / trip.num_travellers), currency)} / person
            </span>
          )}
        </div>

        <div className={`p-3 rounded-xl border ${
          isOver
            ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
            : budgetCap > 0
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
              : 'bg-surface-50 dark:bg-slate-900/40 border-surface-200 dark:border-slate-700/80'
        }`}>
          <span className="text-[11px] font-medium text-surface-500 dark:text-slate-400 block">
            {isOver ? 'Over Budget By' : budgetCap > 0 ? 'Remaining Balance' : 'Status'}
          </span>
          <p className={`text-base font-bold mt-0.5 ${
            isOver
              ? 'text-red-600 dark:text-red-400'
              : budgetCap > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-surface-700 dark:text-slate-300'
          }`} id="budget-status-display">
            {isOver
              ? `+${formatMoney(overAmount, currency)}`
              : budgetCap > 0
                ? formatMoney(remaining, currency)
                : 'Within budget'}
          </p>
          <span className="text-[11px] text-surface-500 dark:text-slate-400">
            {budgetCap > 0
              ? `${Math.round(Math.min(100, (budget.total_minor / budgetCap) * 100))}% of budget allocated`
              : 'No cap set'}
          </span>
        </div>
      </div>

      {/* Actual spend banner if Splitwise expenses exist */}
      {budget.actual_spent_minor && budget.actual_spent_minor > 0 ? (
        <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-surface-50 dark:bg-slate-900/40 border border-surface-200 dark:border-slate-700/80 text-surface-600 dark:text-slate-300">
          <span>Actual Splitwise Expenses: <strong className="text-surface-900 dark:text-slate-100">{formatMoney(budget.actual_spent_minor, currency)}</strong> (recorded spending)</span>
          <Link to={`/budget?tripId=${trip?.id}`} className="text-accent-600 dark:text-accent-400 hover:underline flex items-center gap-1 font-medium">
            View Budget & Savings <ArrowRight size={12} />
          </Link>
        </div>
      ) : null}

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-semibold text-surface-700 dark:text-slate-300">Category Breakdown</p>
          <div className="flex flex-wrap gap-2">
            {categories.map(([cat, minor]) => {
              const catPct = budget.total_minor > 0 ? Math.round((minor / budget.total_minor) * 100) : 0
              return (
                <div key={cat} className="flex items-center gap-1.5 text-xs bg-surface-50 dark:bg-slate-700/50 px-2.5 py-1 rounded-lg border border-surface-200 dark:border-slate-700">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_CLASSES[cat] ?? 'bg-surface-200 text-surface-700'}`}>
                    {cat}
                  </span>
                  <span className="font-semibold text-surface-800 dark:text-slate-200">{formatMoney(minor, currency)}</span>
                  <span className="text-surface-400 text-[10px]">({catPct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Practical Cost Reduction Advice when Over Budget */}
      {isOver && (
        <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-3" id="over-budget-warning">
          <TriangleAlert size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div className="space-y-1">
            <p className="font-semibold">
              Estimated spend exceeds your trip budget by {formatMoney(overAmount, currency)}.
            </p>
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Practical ways to reduce expenses:
              <br />• Unlock optional paid sightseeing and regenerate to pick free cultural walks and parks.
              <br />• Choose local public transit or shared shuttles over private cabs.
              <br />• Click <strong>Edit Budget</strong> above to increase the trip budget to match your itinerary needs.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Itinerary page ──────────────────────────────────────────────────────────

export default function Itinerary() {
  const [searchParams] = useSearchParams()
  const paramTripId = searchParams.get('tripId')

  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [daysSchedule, setDaysSchedule] = useState<DaySchedule[]>([])
  const [calendarComplete, setCalendarComplete] = useState<boolean>(true)
  const [scheduleComplete, setScheduleComplete] = useState<boolean>(false)
  const [aiEnhanced, setAiEnhanced] = useState<boolean>(false)
  const [aiUnavailableReason, setAiUnavailableReason] = useState<string | null>(null)
  const [budget, setBudget] = useState<BudgetBreakdown | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [changes, setChanges] = useState<string[]>([])

  const [loadingTrips, setLoadingTrips] = useState(true)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [errorTrips, setErrorTrips] = useState<string | null>(null)
  const [errorActivities, setErrorActivities] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const [replanTarget, setReplanTarget] = useState<Activity | null>(null)

  // ── Load trips ──────────────────────────────────────────────────────────
  useEffect(() => {
    listTrips()
      .then(r => {
        setTrips(r.data)
        if (r.data.length > 0) {
          const match = paramTripId ? r.data.find(t => t.id === Number(paramTripId)) : null
          setSelectedTripId(match ? match.id : r.data[0].id)
        }
      })
      .catch(e => setErrorTrips(getErrorMessage(e)))
      .finally(() => setLoadingTrips(false))
  }, [paramTripId])

  // ── Load activities and budget when trip changes ────────────────────────
  useEffect(() => {
    if (!selectedTripId) return
    setLoadingActivities(true)
    setErrorActivities(null)
    setBudget(null)
    setWarnings([])
    setChanges([])
    setDaysSchedule([])
    Promise.all([
      getItinerary(selectedTripId).catch(() => null),
      getItineraryBudget(selectedTripId).catch(() => null),
    ])
      .then(([itinRes, bRes]) => {
        if (itinRes && itinRes.data) {
          setActivities(itinRes.data.activities || [])
          setBudget(itinRes.data.budget)
          setWarnings(itinRes.data.warnings || [])
          if (itinRes.data.days) setDaysSchedule(itinRes.data.days)
          setCalendarComplete(itinRes.data.calendar_complete ?? true)
          setScheduleComplete(itinRes.data.schedule_complete ?? ((itinRes.data.activities || []).length > 0))
          setAiEnhanced(itinRes.data.ai_enhanced ?? false)
          setAiUnavailableReason(itinRes.data.ai_unavailable_reason ?? null)
        } else {
          listActivities(selectedTripId)
            .then(actRes => setActivities(actRes.data))
            .catch(e => setErrorActivities(getErrorMessage(e)))
          if (bRes) setBudget(bRes.data)
        }
      })
      .catch(e => setErrorActivities(getErrorMessage(e)))
      .finally(() => setLoadingActivities(false))
  }, [selectedTripId])

  // ── Generate itinerary ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedTripId || generating) return
    setGenerating(true)
    setGenError(null)
    setChanges([])
    try {
      const r = await generateItinerary(selectedTripId, { overwrite_unlocked: true, use_ai: true })
      setActivities(r.data.activities || [])
      setBudget(r.data.budget)
      setWarnings(r.data.warnings || [])
      if (r.data.days) setDaysSchedule(r.data.days)
      setCalendarComplete(r.data.calendar_complete ?? true)
      setScheduleComplete(r.data.schedule_complete ?? ((r.data.activities || []).length > 0))
      setAiEnhanced(r.data.ai_enhanced ?? false)
      setAiUnavailableReason(r.data.ai_unavailable_reason ?? null)
    } catch (e) {
      setGenError(getErrorMessage(e))
    } finally {
      setGenerating(false)
    }
  }

  // ── Replan ─────────────────────────────────────────────────────────────
  const handleReplan = async (reason: string, delayMinutes: number) => {
    if (!selectedTripId || !replanTarget) return
    setGenError(null)
    try {
      const r = await replanItinerary(selectedTripId, {
        activity_name: replanTarget.name,
        day_number: replanTarget.day_number,
        reason,
        delay_minutes: delayMinutes,
      })
      setActivities(r.data.activities || [])
      setBudget(r.data.budget)
      setWarnings(r.data.warnings || [])
      setChanges(r.data.changes || [])
      const itinRes = await getItinerary(selectedTripId).catch(() => null)
      if (itinRes?.data?.days) {
        setDaysSchedule(itinRes.data.days)
        setScheduleComplete(itinRes.data.schedule_complete ?? true)
      }
    } catch (e) {
      setGenError(getErrorMessage(e))
    } finally {
      setReplanTarget(null)
    }
  }

  // ── Toggle lock (local optimistic update) ──────────────────────────────
  const handleToggleLock = (id: number) =>
    setActivities(prev => prev.map(a => a.id === id ? { ...a, is_locked: !a.is_locked } : a))

  // ── Construct effectiveDays (100% calendar coverage for trip dates) ───────
  const selectedTrip = trips.find(t => t.id === selectedTripId)
  const totalTripDays = selectedTrip ? Math.max(1, selectedTrip.num_days || 1) : 0
  const depDateStr = selectedTrip?.departure_date || new Date().toISOString().slice(0, 10)

  const scheduleMap = new Map<number, DaySchedule>()
  for (const ds of daysSchedule) {
    scheduleMap.set(ds.day_number, ds)
  }

  const byDay: Record<number, Activity[]> = {}
  for (const a of activities) {
    if (!byDay[a.day_number]) byDay[a.day_number] = []
    byDay[a.day_number].push(a)
  }

  const effectiveDays: Array<{
    dayNumber: number
    dateStr: string
    theme?: string
    status: 'scheduled' | 'partial' | 'unfilled'
    unfilledReason?: string
    activities: Activity[]
  }> = []

  for (let d = 1; d <= totalTripDays; d++) {
    const fromSchedule = scheduleMap.get(d)
    const dayActs = byDay[d] || []
    let dateStr = fromSchedule?.date
    if (!dateStr) {
      const base = new Date(depDateStr)
      base.setDate(base.getDate() + d - 1)
      dateStr = base.toISOString().slice(0, 10)
    }
    const theme = fromSchedule?.theme
    const status: 'scheduled' | 'partial' | 'unfilled' = fromSchedule?.status
      ? fromSchedule.status
      : dayActs.length >= 2
        ? 'scheduled'
        : dayActs.length === 1
          ? 'partial'
          : 'unfilled'
    const unfilledReason = fromSchedule?.unfilled_reason || (dayActs.length === 0 ? 'No activities planned yet' : undefined)

    effectiveDays.push({
      dayNumber: d,
      dateStr,
      theme,
      status,
      unfilledReason,
      activities: dayActs,
    })
  }

  const totalCost = activities.reduce((s, a) => s + a.cost_minor, 0)
  const plannedDaysCount = effectiveDays.filter(d => d.activities.length > 0).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Replan modal */}
      {replanTarget && (
        <ReplanModal
          activity={replanTarget}
          onClose={() => setReplanTarget(null)}
          onReplan={handleReplan}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Itinerary</h1>
          <p className="page-subtitle">Destination-specific schedule & calendar coverage</p>
        </div>
        {selectedTripId && (
          <button
            id="generate-itinerary-btn"
            className="btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating
              ? <><Loader2 size={15} className="animate-spin" /> Generating Itinerary…</>
              : <><Wand2 size={15} /> Generate Itinerary</>}
          </button>
        )}
      </div>

      {/* Status Bar: Calendar completeness, activity status, and AI status */}
      {selectedTrip && (
        <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-2xl bg-surface-50 dark:bg-slate-900/60 border border-surface-200 dark:border-slate-800 text-xs" id="itinerary-status-bar">
          <span className="font-semibold text-surface-700 dark:text-slate-300">Coverage:</span>
          {/* Calendar badge */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 font-medium border border-emerald-200 dark:border-emerald-800" id="calendar-complete-badge">
            <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
            {calendarComplete ? 'Calendar Complete' : 'Calendar Projected'} ({effectiveDays.length}/{totalTripDays} Days)
          </span>

          {/* Schedule completeness badge */}
          {activities.length > 0 ? (
            (scheduleComplete && effectiveDays.every(d => d.status === 'scheduled')) ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 font-medium border border-emerald-200 dark:border-emerald-800" id="schedule-complete-badge">
                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                Activity Schedule Complete (All Days Planned)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 font-medium border border-amber-200 dark:border-amber-800" id="schedule-partial-badge">
                <TriangleAlert size={13} className="text-amber-600 dark:text-amber-400" />
                Partially Filled ({plannedDaysCount} of {totalTripDays} Days Planned)
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700" id="schedule-unplanned-badge">
              <Info size={13} className="text-slate-500" />
              Calendar Initialized (Awaiting Generation)
            </span>
          )}

          {/* AI Status badge */}
          {aiEnhanced ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 font-medium border border-purple-200 dark:border-purple-800" id="ai-status-badge">
              <Sparkles size={13} className="text-purple-600 dark:text-purple-400" />
              AI Enhanced Themes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium border border-slate-200 dark:border-slate-700" id="ai-status-badge" title={aiUnavailableReason || 'Deterministic engine guarantees all calendar days without AI reliance'}>
              <ShieldCheck size={13} className="text-slate-500" />
              Deterministic Destination Baseline (AI Offline)
            </span>
          )}
        </div>
      )}

      {/* Generating in-progress banner */}
      {generating && (
        <div className="p-4 rounded-xl bg-accent-50/80 dark:bg-accent-950/30 border border-accent-200 dark:border-accent-900/60 flex items-center gap-3 animate-pulse" id="generating-status-banner">
          <Loader2 size={18} className="animate-spin text-accent-600 dark:text-accent-400 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-accent-900 dark:text-accent-200">
              Generating Destination Itinerary…
            </p>
            <p className="text-xs text-accent-700 dark:text-accent-400">
              Analysing local heritage sites, weather forecast, and travel pace for {selectedTrip?.destination || 'your destination'}.
            </p>
          </div>
        </div>
      )}

      {/* Generation error */}
      {genError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 gap-3" id="gen-error">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <span className="truncate">{genError}</span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-secondary text-xs py-1 px-3 bg-white hover:bg-red-50 text-red-700 border-red-300 flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Trip selector */}
      {loadingTrips ? (
        <div className="skeleton h-10 w-64 rounded-lg" />
      ) : errorTrips ? (
        <div className="flex items-center gap-2 text-sm text-red-600 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle size={15} /> {errorTrips}
        </div>
      ) : trips.length === 0 ? (
        <div className="card text-center py-16 space-y-3">
          <CalendarDays size={36} className="text-surface-300 mx-auto" />
          <p className="text-sm font-medium text-surface-600">No trips yet</p>
          <p className="text-xs text-surface-400">Create a trip on the My Trips page first.</p>
        </div>
      ) : (
        <>
          {/* Trip picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="trip-select" className="text-sm font-medium text-surface-700">Trip:</label>
            <select
              id="trip-select"
              className="input max-w-xs"
              value={selectedTripId ?? ''}
              onChange={e => setSelectedTripId(Number(e.target.value))}
            >
              {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {selectedTrip && (
              <div className="flex items-center gap-3 text-xs text-surface-500 flex-wrap">
                <span className="flex items-center gap-1"><MapPin size={12} /> {selectedTrip.origin} → {selectedTrip.destination}</span>
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  {formatDate(selectedTrip.departure_date)} — {formatDate(selectedTrip.return_date)}
                </span>
                <span>{selectedTrip.num_days} days</span>
              </div>
            )}
          </div>

          {/* Changes ribbon (after replan) */}
          {changes.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1" id="replan-changes">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                <RefreshCw size={12} /> Replanning applied
              </p>
              {changes.map((c, i) => <p key={i} className="text-xs text-emerald-700 pl-4">• {c}</p>)}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1" id="schedule-warnings">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <TriangleAlert size={12} /> Schedule notices
              </p>
              {warnings.map((w, i) => <p key={i} className="text-xs text-amber-700 pl-4">• {w}</p>)}
            </div>
          )}

          {/* Budget breakdown */}
          {budget && (
            <BudgetBar
              budget={budget}
              currency={selectedTrip?.currency ?? 'INR'}
              trip={selectedTrip}
              onBudgetUpdated={(updatedTrip, newBudget) => {
                setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t))
                setBudget(newBudget)
              }}
            />
          )}

          {/* Quick stats */}
          {!loadingActivities && activities.length > 0 && !budget && (
            <div className="flex flex-wrap gap-4 p-4 rounded-xl bg-accent-50 border border-accent-100 text-sm">
              <span className="font-medium text-accent-800">
                {activities.length} activities across {plannedDaysCount} of {effectiveDays.length} days planned
              </span>
              {totalCost > 0 && (
                <span className="text-accent-700">
                  Estimated cost: <strong>{formatMoney(totalCost, activities[0]?.currency ?? 'INR')}</strong>
                </span>
              )}
            </div>
          )}

          {/* Lock info */}
          <div className="flex items-start gap-2 text-xs text-surface-500 p-3 rounded-lg bg-surface-50 border border-surface-200">
            <Lock size={13} className="flex-shrink-0 mt-0.5 text-surface-400" />
            <span>
              <strong>Lock</strong> keeps an activity fixed when you regenerate. <strong>Generate Itinerary</strong> builds a
              destination-aware schedule adapted to your destination, travel pace, and weather forecast, respecting locked activities. Use the <TriangleAlert size={11} className="inline" /> button
              on any unlocked activity to report a closure or delay and let the algorithm replan around it.
            </span>
          </div>

          {/* Loading */}
          {loadingActivities && (
            <div className="flex items-center gap-2 text-sm text-surface-500">
              <Loader2 size={16} className="animate-spin" /> Loading activities…
            </div>
          )}

          {/* Error */}
          {errorActivities && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              <AlertCircle size={15} /> {errorActivities}
            </div>
          )}

          {/* Empty — no activities generated yet */}
          {!loadingActivities && !errorActivities && activities.length === 0 && daysSchedule.length === 0 && selectedTrip && (
            <div className="card text-center py-20 space-y-4" id="itinerary-empty">
              <div className="w-14 h-14 rounded-2xl bg-accent-50 flex items-center justify-center mx-auto">
                <Wand2 size={24} className="text-accent-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-700">No itinerary yet for this trip</p>
                <p className="text-xs text-surface-400 max-w-xs mx-auto mt-1">
                  Click <strong>Generate Itinerary</strong> above to build a day-by-day schedule based on
                  your travel preferences and destination.
                </p>
              </div>
              <button
                id="generate-empty-btn"
                className="btn-primary mx-auto"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating
                  ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                  : <><Wand2 size={15} /> Generate Itinerary</>}
              </button>
            </div>
          )}

          {/* Day sections (all calendar dates rendered deterministically) */}
          {!loadingActivities && (activities.length > 0 || daysSchedule.length > 0) && selectedTrip && (
            <div className="space-y-6" id="itinerary-days-container">
              {effectiveDays.map(d => (
                <DaySection
                  key={d.dayNumber}
                  dayNumber={d.dayNumber}
                  dateStr={d.dateStr}
                  theme={d.theme}
                  status={d.status}
                  unfilledReason={d.unfilledReason}
                  activities={d.activities}
                  tripCurrency={selectedTrip.currency}
                  onToggleLock={handleToggleLock}
                  onReportDisruption={setReplanTarget}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
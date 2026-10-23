import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  DollarSign, TrendingUp, PieChart, Plus, Trash2, Calculator,
  Wallet, Edit3, Check, Loader2, AlertCircle, TriangleAlert,
  ArrowRight, Briefcase, Users, CalendarDays,
} from 'lucide-react'
import { listTrips, updateTrip, getItineraryBudget, type BudgetBreakdown } from '../services/api'
import type { Trip } from '../types'
import { formatMoney } from '../utils/format'
import { computeBudgetMetrics, validateBudgetInput } from '../utils/budgetUtils'

interface BudgetItem {
  id: number
  category: string
  label: string
  planned: number
  actual: number
}

const CATEGORIES = [
  { key: 'flights', label: 'Flights', emoji: '✈️' },
  { key: 'accommodation', label: 'Accommodation', emoji: '🏨' },
  { key: 'food', label: 'Food & Dining', emoji: '🍽️' },
  { key: 'activities', label: 'Activities', emoji: '🎭' },
  { key: 'transport', label: 'Local Transport', emoji: '🚕' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { key: 'insurance', label: 'Travel Insurance', emoji: '🛡️' },
  { key: 'other', label: 'Other', emoji: '📦' },
]

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AED']
const PRESET_AMOUNTS = [5000, 12500, 50000]

function CategoryEmoji({ catKey }: { catKey: string }) {
  const cat = CATEGORIES.find(c => c.key === catKey)
  return <span>{cat?.emoji ?? '📦'}</span>
}

export default function Budget() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tripIdParam = searchParams.get('tripId')

  // Backend trips state
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [tripError, setTripError] = useState<string | null>(null)

  // Itinerary budget data from backend
  const [itineraryBudget, setItineraryBudget] = useState<BudgetBreakdown | null>(null)

  // Budget cap editor state
  const [isEditingCap, setIsEditingCap] = useState(false)
  const [editCapMajor, setEditCapMajor] = useState<string>('')
  const [selectedCurrency, setSelectedCurrency] = useState<string>('INR')
  const [savingCap, setSavingCap] = useState(false)
  const [saveCapError, setSaveCapError] = useState<string | null>(null)

  // Trip-specific custom line items (persisted per trip in localStorage)
  const [items, setItems] = useState<BudgetItem[]>([])

  // New item form
  const [newCat, setNewCat] = useState('other')
  const [newLabel, setNewLabel] = useState('')
  const [newPlanned, setNewPlanned] = useState('')

  // 1. Load trips on mount
  useEffect(() => {
    setLoadingTrips(true)
    setTripError(null)
    listTrips()
      .then(res => {
        const fetched = res.data
        setTrips(fetched)
        if (fetched.length > 0) {
          // If query param matches a trip, select it; otherwise default to first trip
          const matched = tripIdParam ? fetched.find(t => t.id === Number(tripIdParam)) : null
          const initial = matched ? matched.id : fetched[0].id
          setSelectedTripId(initial)
        }
      })
      .catch(err => {
        setTripError(err.message || 'Could not load trips from backend')
      })
      .finally(() => setLoadingTrips(false))
  }, [])

  // Sync selected trip when query param changes
  useEffect(() => {
    if (trips.length > 0 && tripIdParam) {
      const id = Number(tripIdParam)
      if (trips.some(t => t.id === id) && id !== selectedTripId) {
        setSelectedTripId(id)
      }
    }
  }, [tripIdParam, trips, selectedTripId])

  // Current selected trip
  const selectedTrip = useMemo(() => {
    return trips.find(t => t.id === selectedTripId) ?? null
  }, [trips, selectedTripId])

  // Sync edit form state when selected trip changes
  useEffect(() => {
    if (selectedTrip) {
      setEditCapMajor(String(selectedTrip.budget_minor / 100))
      setSelectedCurrency(selectedTrip.currency || 'INR')
      setIsEditingCap(false)
      setSaveCapError(null)

      // Fetch live itinerary budget for this trip from backend
      getItineraryBudget(selectedTrip.id)
        .then(res => setItineraryBudget(res.data))
        .catch(() => setItineraryBudget(null))

      // Load custom items for this trip
      try {
        const key = `ai_travel_budget_items_${selectedTrip.id}`
        const saved = localStorage.getItem(key)
        if (saved) {
          setItems(JSON.parse(saved))
        } else {
          setItems([])
        }
      } catch {
        setItems([])
      }
    }
  }, [selectedTrip])

  // Save custom items for current trip
  const saveCustomItems = (newItems: BudgetItem[]) => {
    setItems(newItems)
    if (selectedTrip) {
      try {
        localStorage.setItem(`ai_travel_budget_items_${selectedTrip.id}`, JSON.stringify(newItems))
      } catch {
        // ignore
      }
    }
  }

  // Handle trip selector change
  const handleSelectTrip = (id: number) => {
    setSelectedTripId(id)
    setSearchParams({ tripId: String(id) })
  }

  // Save Trip Budget Cap directly to backend
  const handleSaveBudgetCap = async () => {
    if (!selectedTrip) return
    const validation = validateBudgetInput(editCapMajor)
    if (!validation.valid || validation.minor === undefined) {
      setSaveCapError(validation.error || 'Invalid budget input.')
      return
    }

    setSavingCap(true)
    setSaveCapError(null)
    const newBudgetMinor = validation.minor

    try {
      const res = await updateTrip(selectedTrip.id, {
        budget_minor: newBudgetMinor,
        currency: selectedCurrency.toUpperCase(),
      })
      const updatedTrip = res.data

      // Update local trips state so everything synchronizes immediately
      setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t))
      setIsEditingCap(false)

      // Re-fetch itinerary budget breakdown with the new cap
      const bRes = await getItineraryBudget(selectedTrip.id)
      setItineraryBudget(bRes.data)
    } catch (err: any) {
      setSaveCapError(err?.response?.data?.detail ?? err.message ?? 'Failed to update trip budget.')
    } finally {
      setSavingCap(false)
    }
  }

  // Calculations for current trip
  const tripBudgetCapMinor = selectedTrip ? selectedTrip.budget_minor : 0
  const tripCurrency = selectedTrip ? selectedTrip.currency || 'INR' : 'INR'

  // Custom items planned & actual
  const customPlannedMajor = items.reduce((s, i) => s + (Number(i.planned) || 0), 0)
  const customActualMajor = items.reduce((s, i) => s + (Number(i.actual) || 0), 0)

  // Itinerary planned & actual
  const itineraryPlannedMinor = itineraryBudget?.total_minor ?? 0
  const itineraryActualMinor = itineraryBudget?.actual_spent_minor ?? 0

  const {
    totalPlannedMinor,
    totalActualMinor,
    remainingActualMinor,
    remainingPlannedMinor,
    isOverActual,
    isOverPlanned,
    overActualAmountMinor,
    overPlannedAmountMinor,
    actualUsedPct,
    plannedUsedPct,
  } = useMemo(() => {
    return computeBudgetMetrics(
      tripBudgetCapMinor,
      itineraryPlannedMinor,
      itineraryActualMinor,
      customPlannedMajor,
      customActualMajor,
    )
  }, [tripBudgetCapMinor, itineraryPlannedMinor, itineraryActualMinor, customPlannedMajor, customActualMajor])

  const actualColor = isOverActual ? '#ef4444' : actualUsedPct > 80 ? '#f97316' : '#22c55e'
  const plannedColor = isOverPlanned ? '#ef4444' : plannedUsedPct > 80 ? '#f97316' : '#8b5cf6'

  // Item management
  const updateItem = (id: number, field: 'planned' | 'actual', val: string) => {
    const n = parseFloat(val) || 0
    const updated = items.map(item => item.id === id ? { ...item, [field]: n } : item)
    saveCustomItems(updated)
  }

  const removeItem = (id: number) => {
    saveCustomItems(items.filter(i => i.id !== id))
  }

  const addItem = () => {
    if (!newLabel.trim()) return
    const updated = [...items, {
      id: Date.now(),
      category: newCat,
      label: newLabel.trim(),
      planned: parseFloat(newPlanned) || 0,
      actual: 0,
    }]
    saveCustomItems(updated)
    setNewLabel('')
    setNewPlanned('')
  }

  // Empty state if no trips exist
  if (!loadingTrips && trips.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 gap-4 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-950/40 flex items-center justify-center">
          <Wallet size={28} className="text-accent-600 dark:text-accent-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-900 dark:text-slate-100">No Trips Found</h2>
          <p className="text-sm text-surface-500 dark:text-slate-400 mt-1">
            Create your first trip or seed sample data on the Overview page to set and manage a persistent trip budget.
          </p>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Link to="/trips" className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
            <Plus size={14} /> Create a Trip
          </Link>
          <Link to="/" className="btn-secondary text-xs py-2 px-4">
            Go to Overview
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Trip Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <Calculator size={22} style={{ color: 'var(--color-accent)' }} />
            Trip Budget & Savings
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            One persistent, trip-specific source of truth across Overview, Itinerary, and Budget.
          </p>
        </div>

        {/* Trip Selector Dropdown */}
        {trips.length > 0 && (
          <div
            className="flex items-center gap-2 p-2 rounded-xl border transition-all hover:border-surface-300 dark:hover:border-slate-600 focus-within:ring-2 focus-within:ring-accent-500/30 focus-within:border-accent-500 shadow-sm"
            style={{
              background: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <Briefcase size={16} className="text-accent-600 dark:text-accent-400 flex-shrink-0" />
            <select
              id="budget-trip-selector"
              className="bg-transparent text-sm font-semibold text-surface-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-2 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
              style={{ color: 'var(--color-text-primary)' }}
              value={selectedTripId ?? ''}
              onChange={e => handleSelectTrip(Number(e.target.value))}
              aria-label="Select trip for budget and savings"
            >
              {trips.map(t => (
                <option
                  key={t.id}
                  value={t.id}
                  className="bg-white text-surface-900 dark:bg-slate-800 dark:text-slate-100 font-medium py-1"
                >
                  {t.name} — {formatMoney(t.budget_minor, t.currency)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tripError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={16} />
          <span>{tripError}</span>
        </div>
      )}

      {/* Selected Trip Details Bar */}
      {selectedTrip && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-accent-50/60 dark:bg-accent-950/20 border border-accent-200/60 dark:border-accent-900/40 px-4 py-2.5 rounded-xl">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold text-accent-900 dark:text-accent-200">
              {selectedTrip.name}
            </span>
            <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
              <CalendarDays size={13} className="text-accent-500" />
              {selectedTrip.num_days} day{selectedTrip.num_days !== 1 ? 's' : ''} ({selectedTrip.destination})
            </span>
            {selectedTrip.num_travellers > 1 && (
              <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
                <Users size={13} className="text-accent-500" />
                {selectedTrip.num_travellers} travellers (
                {formatMoney(Math.round(selectedTrip.budget_minor / selectedTrip.num_travellers), tripCurrency)}/person)
              </span>
            )}
          </div>

          <Link
            to={`/itinerary`}
            className="text-accent-700 dark:text-accent-300 hover:underline flex items-center gap-1 font-medium"
          >
            View Itinerary <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Primary Summary Cards (Cap, Estimated, Actual, Remaining Actual, Remaining Estimated) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Budget Cap (Persistent Source of Truth) */}
        <div
          className="p-4 rounded-xl border flex flex-col justify-between"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-500/10">
                <DollarSign size={17} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Budget Cap</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400" id="total-budget-cap-display">
                  {formatMoney(tripBudgetCapMinor, tripCurrency)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsEditingCap(!isEditingCap)}
              className="p-1.5 rounded-lg border border-surface-200 dark:border-slate-700 hover:bg-surface-100 dark:hover:bg-slate-800 transition-colors text-surface-600 dark:text-slate-300"
              title="Edit Budget Cap"
              id="btn-edit-budget-cap"
            >
              <Edit3 size={13} />
            </button>
          </div>
          <span className="text-[10px] text-surface-400 dark:text-slate-500 mt-2">
            Trip limit in database
          </span>
        </div>

        {/* Card 2: Estimated Itinerary Costs */}
        <div
          className="p-4 rounded-xl border flex flex-col justify-between"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500/10">
              <Briefcase size={17} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Estimated Costs</p>
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400" id="estimated-costs-display">
                {formatMoney(totalPlannedMinor, tripCurrency)}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-surface-400 dark:text-slate-500 mt-2">
            Scheduled activities (estimates)
          </span>
        </div>

        {/* Card 3: Actual Recorded Spend */}
        <div
          className="p-4 rounded-xl border flex flex-col justify-between"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `${actualColor}22` }}
            >
              <TrendingUp size={17} style={{ color: actualColor }} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Actual Spent</p>
              <p className="text-lg font-bold" style={{ color: actualColor }} id="actual-spent-display">
                {formatMoney(totalActualMinor, tripCurrency)}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-surface-400 dark:text-slate-500 mt-2">
            Splitwise / recorded expenses
          </span>
        </div>

        {/* Card 4: Remaining After Actual Spend */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between ${
            isOverActual
              ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/60'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              isOverActual ? 'bg-red-500/20 text-red-600' : 'bg-emerald-500/20 text-emerald-600'
            }`}>
              <PieChart size={17} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {isOverActual ? 'Over Actual Budget' : 'Remaining (Actual)'}
              </p>
              <p className={`text-lg font-bold ${
                isOverActual ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              }`} id="remaining-actual-display">
                {isOverActual ? `+${formatMoney(overActualAmountMinor, tripCurrency)}` : formatMoney(remainingActualMinor, tripCurrency)}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-surface-400 dark:text-slate-500 mt-2">
            {isOverActual ? 'Exceeds budget cap' : 'Cash available right now'}
          </span>
        </div>

        {/* Card 5: Remaining After Estimated Spend */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between ${
            isOverPlanned
              ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
              : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              isOverPlanned ? 'bg-amber-500/20 text-amber-600' : 'bg-indigo-500/20 text-indigo-600'
            }`}>
              <Calculator size={17} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {isOverPlanned ? 'Over Planned Cap' : 'Remaining (Estimated)'}
              </p>
              <p className={`text-lg font-bold ${
                isOverPlanned ? 'text-amber-700 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'
              }`} id="remaining-estimated-display">
                {isOverPlanned ? `+${formatMoney(overPlannedAmountMinor, tripCurrency)}` : formatMoney(remainingPlannedMinor, tripCurrency)}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-surface-400 dark:text-slate-500 mt-2">
            {isOverPlanned ? 'Planned costs exceed cap' : 'Projected after all activities'}
          </span>
        </div>
      </div>

      {/* Inline Budget Cap Editor */}
      {isEditingCap && selectedTrip && (
        <div
          className="p-5 rounded-2xl border space-y-4 animate-fade-in"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          id="budget-cap-editor-panel"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              <Edit3 size={16} className="text-accent-500" />
              Update Persistent Budget for "{selectedTrip.name}"
            </div>
            <button
              onClick={() => setIsEditingCap(false)}
              className="text-xs text-surface-400 hover:text-surface-700 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Total Budget ({selectedCurrency})
              </label>
              <input
                type="number"
                min="0"
                step="500"
                className="w-full px-3 py-2 rounded-xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-accent-500"
                style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                value={editCapMajor}
                onChange={e => setEditCapMajor(e.target.value)}
                placeholder="e.g. 50000"
                id="input-edit-budget-major"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Currency
              </label>
              <select
                className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                value={selectedCurrency}
                onChange={e => setSelectedCurrency(e.target.value)}
                id="select-edit-budget-currency"
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c} className="bg-white text-surface-900 dark:bg-slate-800 dark:text-slate-100">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-surface-400 dark:text-slate-500">Quick Presets:</span>
            {PRESET_AMOUNTS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setEditCapMajor(String(preset))}
                className="px-2.5 py-1 rounded-lg border border-surface-200 dark:border-slate-700 bg-surface-50 dark:bg-slate-800 text-surface-700 dark:text-slate-300 hover:border-accent-400 transition-colors"
              >
                {selectedCurrency === 'INR' ? `₹${preset.toLocaleString()}` : `${selectedCurrency} ${preset.toLocaleString()}`}
              </button>
            ))}
          </div>

          {saveCapError && (
            <p className="text-xs text-red-500 font-medium">{saveCapError}</p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSaveBudgetCap}
              disabled={savingCap}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              id="btn-save-budget-cap"
            >
              {savingCap ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{savingCap ? 'Saving to Database…' : 'Save Budget to Trip'}</span>
            </button>
            <span className="text-xs text-surface-400 dark:text-slate-500">
              Updates Overview, Itinerary, and trips in database.
            </span>
          </div>
        </div>
      )}

      {/* Dual Progress Bars: Actual Spending vs Cap, and Planned Allocation vs Cap */}
      <div
        className="p-5 rounded-xl border space-y-4"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Budget Tracking & Utilization
          </span>
          <span className="text-xs text-surface-400 dark:text-slate-500">
            Comparing actual spending and planned estimates against the budget cap
          </span>
        </div>

        <div className="space-y-3.5">
          {/* Bar 1: Actual Spend */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                <TrendingUp size={13} style={{ color: actualColor }} />
                <span>Actual Spending (Splitwise / Recorded Expenses)</span>
              </span>
              <span className="font-bold" style={{ color: actualColor }} id="actual-spent-percent">
                {actualUsedPct.toFixed(1)}% spent ({formatMoney(totalActualMinor, tripCurrency)} of {formatMoney(tripBudgetCapMinor, tripCurrency)})
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${actualUsedPct}%`, background: actualColor }}
              />
            </div>
          </div>

          {/* Bar 2: Planned Allocation */}
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                <Briefcase size={13} style={{ color: plannedColor }} />
                <span>Planned Estimates (Itinerary Activities + Line Items)</span>
              </span>
              <span className="font-bold" style={{ color: plannedColor }} id="planned-spent-percent">
                {plannedUsedPct.toFixed(1)}% allocated ({formatMoney(totalPlannedMinor, tripCurrency)} of {formatMoney(tripBudgetCapMinor, tripCurrency)})
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${plannedUsedPct}%`, background: plannedColor }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-2 border-t flex-wrap gap-2" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <span>
            Actual cash remaining: <strong className={isOverActual ? 'text-red-500' : 'text-emerald-500'}>
              {isOverActual ? `Over by ${formatMoney(overActualAmountMinor, tripCurrency)}` : formatMoney(remainingActualMinor, tripCurrency)}
            </strong>
          </span>
          <span>
            Projected remaining after all activities: <strong className={isOverPlanned ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}>
              {isOverPlanned ? `Exceeded by ${formatMoney(overPlannedAmountMinor, tripCurrency)}` : formatMoney(remainingPlannedMinor, tripCurrency)}
            </strong>
          </span>
        </div>
      </div>

      {/* Alert if actual expenses exceed budget */}
      {isOverActual && (
        <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-3" id="over-actual-alert">
          <TriangleAlert size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div className="space-y-1">
            <p className="font-semibold">
              Actual recorded expenses exceed the budget cap by {formatMoney(overActualAmountMinor, tripCurrency)}.
            </p>
            <p className="text-[11px] text-red-600 dark:text-red-400">
              You have already spent more money than your set budget limit. Review group expenses or update your trip budget cap.
            </p>
          </div>
        </div>
      )}

      {/* Advisory if planned itinerary exceeds budget, but actual expenses do not */}
      {isOverPlanned && !isOverActual && (
        <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3" id="over-planned-notice">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <div className="space-y-1">
            <p className="font-semibold">
              Planned itinerary estimates exceed the budget cap by {formatMoney(overPlannedAmountMinor, tripCurrency)}.
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Note: These are estimates for scheduled activities, not money already spent. You have {formatMoney(remainingActualMinor, tripCurrency)} in actual unspent funds. Consider removing optional itinerary activities or increasing your budget.
            </p>
          </div>
        </div>
      )}

      {/* Category Breakdown (Live Itinerary + Custom Items) */}
      <div
        className="p-5 rounded-xl border"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <h2 className="text-sm font-semibold mb-3 flex items-center justify-between" style={{ color: 'var(--color-text-primary)' }}>
          <span>Spending by Category</span>
          <span className="text-xs font-normal text-surface-400 dark:text-slate-500">
            Itinerary activities & line items
          </span>
        </h2>

        {itineraryBudget && Object.keys(itineraryBudget.by_category).length > 0 ? (
          <div className="space-y-2.5">
            {Object.entries(itineraryBudget.by_category).map(([cat, minor]) => {
              const catPct = totalPlannedMinor > 0 ? Math.round((minor / totalPlannedMinor) * 100) : 0
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="capitalize">{cat}</span>
                    <span className="font-medium">
                      {formatMoney(minor, tripCurrency)} ({catPct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, catPct)}%`, background: 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-surface-400 dark:text-slate-500 italic">
            No itinerary activities scheduled yet for this trip. Generate an itinerary or add custom items below.
          </p>
        )}
      </div>

      {/* Trip Custom Items Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Custom Line Items for "{selectedTrip?.name}"
          </h3>
          <span className="text-xs text-surface-400 dark:text-slate-500">
            Saved specifically for this trip
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-50, transparent)' }}>
                {['Category', 'Item Description', `Planned (${tripCurrency})`, `Actual (${tripCurrency})`, ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-surface-400 dark:text-slate-500 italic">
                    No custom line items added yet for this trip. Add an item below.
                  </td>
                </tr>
              ) : (
                items.map((item, i) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: i < items.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        <CategoryEmoji catKey={item.category} />
                        {CATEGORIES.find(c => c.key === item.category)?.label ?? item.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)' }}>
                      {item.label}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min="0"
                        className="w-24 px-2 py-1 rounded border text-sm"
                        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                        value={item.planned || ''}
                        onChange={e => updateItem(item.id, 'planned', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min="0"
                        className="w-24 px-2 py-1 rounded border text-sm"
                        style={{
                          background: 'var(--color-card-bg)',
                          borderColor: 'var(--color-border)',
                          color: item.actual > item.planned && item.planned > 0 ? '#ef4444' : 'var(--color-text-primary)',
                        }}
                        value={item.actual || ''}
                        onChange={e => updateItem(item.id, 'actual', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400 hover:text-red-600"
                        aria-label={`Remove ${item.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add row */}
        <div
          className="px-4 py-3 border-t flex flex-wrap gap-2 items-center"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <select
            className="px-2 py-1.5 rounded-lg border text-sm [color-scheme:light] dark:[color-scheme:dark]"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
          >
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key} className="bg-white text-surface-900 dark:bg-slate-800 dark:text-slate-100">
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          <input
            className="px-2 py-1.5 rounded-lg border text-sm flex-1 min-w-32"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            placeholder="Item description (e.g. Travel insurance, Souvenirs)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <input
            type="number"
            min="0"
            className="px-2 py-1.5 rounded-lg border text-sm w-28"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            placeholder="Amount"
            value={newPlanned}
            onChange={e => setNewPlanned(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        💡 Your trip budget cap is stored persistently in the database and synchronized with Overview, Itinerary, and MyTrips. For shared group bill-splitting, use the Splitwise page.
      </p>
    </div>
  )
}
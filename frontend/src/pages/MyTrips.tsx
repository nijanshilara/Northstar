import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, Plus, X, ChevronRight, ChevronLeft,
  Loader2, AlertCircle, Trash2, MapPin, CalendarDays,
  Users, PiggyBank, Compass, CheckCircle2,
} from 'lucide-react'
import { listTrips, createTrip, deleteTrip, getErrorMessage } from '../services/api'
import type { Trip, TripCreate, TravelStyle } from '../types'
import { formatMoney, formatDate, daysUntil, STATUS_CLASSES } from '../utils/format'
import DestinationInput from '../components/DestinationInput'
import CurrencyAmount from '../components/CurrencyAmount'
import { useCurrency } from '../context/CurrencyContext'


// ── Constants ──────────────────────────────────────────────────────────────

const TRAVEL_STYLES: { value: TravelStyle; label: string; emoji: string }[] = [
  { value: 'outgoing',       label: 'Social',        emoji: '🎉' },
  { value: 'leisurely',      label: 'Leisurely',     emoji: '😌' },
  { value: 'adventure',      label: 'Adventure',     emoji: '🧗' },
  { value: 'luxury',         label: 'Luxury',        emoji: '✨' },
  { value: 'budget',         label: 'Budget',        emoji: '💰' },
  { value: 'solo',           label: 'Solo',          emoji: '🧍' },
  { value: 'romantic',       label: 'Romantic',      emoji: '💑' },
  { value: 'family',         label: 'Family',        emoji: '👨‍👩‍👧' },
  { value: 'group',          label: 'Group',         emoji: '👥' },
  { value: 'cultural',       label: 'Cultural',      emoji: '🏛️' },
  { value: 'food_nightlife', label: 'Food & Nights', emoji: '🍜' },
  { value: 'nature_wellness',label: 'Nature',        emoji: '🌿' },
]

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'CHF', 'JPY', 'THB']

// ── Multi-step form state ──────────────────────────────────────────────────

interface FormData {
  // Step 1 — Where & When
  name: string
  origin: string
  destination: string
  departure_date: string
  return_date: string
  // Step 2 — Travellers & Budget
  num_travellers: number
  budget_major: string    // user enters in major units (₹)
  currency: string
  // Step 3 — Preferences
  travel_styles: TravelStyle[]
  accommodation_pref: string
  transport_pref: string
  food_pref: string
  must_visit: string
  avoid: string
  walking_tolerance: number
  travel_pace: number
  notes: string
}

const defaultForm = (): FormData => ({
  name: '',
  origin: '',
  destination: '',
  departure_date: '',
  return_date: '',
  num_travellers: 1,
  budget_major: '',
  currency: 'INR',
  travel_styles: [],
  accommodation_pref: '',
  transport_pref: '',
  food_pref: '',
  must_visit: '',
  avoid: '',
  walking_tolerance: 5,
  travel_pace: 5,
  notes: '',
})

// ── Step 1 — Where & When ──────────────────────────────────────────────────

function Step1({
  form, onChange, errors,
}: {
  form: FormData
  onChange: (k: keyof FormData, v: string | number | TravelStyle[]) => void
  errors: Partial<Record<keyof FormData, string>>
}) {
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="trip-name">Trip name *</label>
        <input
          id="trip-name"
          className={`input ${errors.name ? 'border-red-400 ring-1 ring-red-300' : ''}`}
          value={form.name}
          onChange={e => onChange('name', e.target.value)}
          placeholder="e.g. Goa Beach Getaway"
          maxLength={200}
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-20">
        <div>
          <label className="label" htmlFor="trip-origin">From *</label>
          <DestinationInput
            id="trip-origin"
            className={`input ${errors.origin ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            value={form.origin}
            onChange={val => onChange('origin', val)}
            placeholder="Mumbai"
          />
          {errors.origin && <p className="text-xs text-red-500 mt-1">{errors.origin}</p>}
        </div>
        <div>
          <label className="label" htmlFor="trip-dest">To *</label>
          <DestinationInput
            id="trip-dest"
            className={`input ${errors.destination ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            value={form.destination}
            onChange={val => onChange('destination', val)}
            placeholder="Goa"
          />
          {errors.destination && <p className="text-xs text-red-500 mt-1">{errors.destination}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div>
          <label className="label" htmlFor="trip-departure">Departure *</label>
          <input
            id="trip-departure"
            type="date"
            className={`input ${errors.departure_date ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            value={form.departure_date}
            min={today}
            onChange={e => onChange('departure_date', e.target.value)}
          />
          {errors.departure_date && <p className="text-xs text-red-500 mt-1">{errors.departure_date}</p>}
        </div>
        <div>
          <label className="label" htmlFor="trip-return">Return *</label>
          <input
            id="trip-return"
            type="date"
            className={`input ${errors.return_date ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            value={form.return_date}
            min={form.departure_date || today}
            onChange={e => onChange('return_date', e.target.value)}
          />
          {errors.return_date && <p className="text-xs text-red-500 mt-1">{errors.return_date}</p>}
        </div>
      </div>

      {form.departure_date && form.return_date && form.return_date >= form.departure_date && (
        <p className="text-xs text-accent-600 font-medium">
          📅 {Math.max(1, Math.round((new Date(form.return_date).getTime() - new Date(form.departure_date).getTime()) / 86400000) + 1)} days
        </p>
      )}
    </div>
  )
}

// ── Step 2 — Travellers & Budget ───────────────────────────────────────────

function Step2({
  form, onChange, errors,
}: {
  form: FormData
  onChange: (k: keyof FormData, v: string | number | TravelStyle[]) => void
  errors: Partial<Record<keyof FormData, string>>
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="trip-travellers">Number of travellers *</label>
        <input
          id="trip-travellers"
          type="number"
          min={1} max={50}
          className={`input ${errors.num_travellers ? 'border-red-400 ring-1 ring-red-300' : ''}`}
          value={form.num_travellers}
          onChange={e => onChange('num_travellers', Math.max(1, parseInt(e.target.value) || 1))}
        />
        {errors.num_travellers && <p className="text-xs text-red-500 mt-1">{errors.num_travellers}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="trip-budget">Total budget</label>
          <input
            id="trip-budget"
            type="number"
            min={0}
            className={`input ${errors.budget_major ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            value={form.budget_major}
            onChange={e => onChange('budget_major', e.target.value)}
            placeholder="0 = unset"
          />
          {errors.budget_major && <p className="text-xs text-red-500 mt-1">{errors.budget_major}</p>}
        </div>
        <div>
          <label className="label" htmlFor="trip-currency">Currency</label>
          <select
            id="trip-currency"
            className="input"
            value={form.currency}
            onChange={e => onChange('currency', e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {form.budget_major && Number(form.budget_major) > 0 && (
        <p className="text-xs text-accent-600 font-medium">
          💰 {formatMoney(Math.round(Number(form.budget_major) * 100), form.currency)} total
          {form.num_travellers > 1 && ` · ${formatMoney(Math.round((Number(form.budget_major) * 100) / form.num_travellers), form.currency)}/person`}
        </p>
      )}
    </div>
  )
}

// ── Step 3 — Preferences ──────────────────────────────────────────────────

function Step3({
  form, onChange,
}: {
  form: FormData
  onChange: (k: keyof FormData, v: string | number | TravelStyle[]) => void
}) {
  const toggleStyle = (s: TravelStyle) => {
    const next = form.travel_styles.includes(s)
      ? form.travel_styles.filter(x => x !== s)
      : [...form.travel_styles, s]
    onChange('travel_styles', next)
  }

  return (
    <div className="space-y-4">
      {/* Travel styles */}
      <div>
        <label className="label">Travel style (pick any)</label>
        <div className="flex flex-wrap gap-2">
          {TRAVEL_STYLES.map(s => {
            const active = form.travel_styles.includes(s.value)
            return (
              <button
                key={s.value}
                type="button"
                id={`style-${s.value}`}
                onClick={() => toggleStyle(s.value)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-all duration-150
                  ${active ? 'bg-accent-600 text-white border-accent-600' : 'bg-white text-surface-600 border-surface-200 hover:border-accent-300'}`}
              >
                <span>{s.emoji}</span>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="pref-accommodation">Accommodation preference</label>
          <input id="pref-accommodation" className="input" value={form.accommodation_pref} onChange={e => onChange('accommodation_pref', e.target.value)} placeholder="Hotel, hostel, Airbnb…" />
        </div>
        <div>
          <label className="label" htmlFor="pref-transport">Transport preference</label>
          <input id="pref-transport" className="input" value={form.transport_pref} onChange={e => onChange('transport_pref', e.target.value)} placeholder="Train, taxi, rental…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="pref-food">Food preference</label>
          <input id="pref-food" className="input" value={form.food_pref} onChange={e => onChange('food_pref', e.target.value)} placeholder="Seafood, vegetarian…" />
        </div>
        <div>
          <label className="label" htmlFor="pref-must">Must-visit places</label>
          <input id="pref-must" className="input" value={form.must_visit} onChange={e => onChange('must_visit', e.target.value)} placeholder="Beach, old town…" />
        </div>
      </div>

      {/* Walking & pace sliders */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="label">Walking tolerance: {form.walking_tolerance}/10</label>
          <input type="range" min={1} max={10} value={form.walking_tolerance}
            onChange={e => onChange('walking_tolerance', Number(e.target.value))}
            className="w-full accent-accent-600" />
          <div className="flex justify-between text-xs text-surface-400 mt-0.5">
            <span>Minimal</span><span>Avid walker</span>
          </div>
        </div>
        <div>
          <label className="label">Travel pace: {form.travel_pace}/10</label>
          <input type="range" min={1} max={10} value={form.travel_pace}
            onChange={e => onChange('travel_pace', Number(e.target.value))}
            className="w-full accent-accent-600" />
          <div className="flex justify-between text-xs text-surface-400 mt-0.5">
            <span>Relaxed</span><span>Packed</span>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="trip-notes">Additional notes</label>
        <textarea id="trip-notes" className="input resize-none" rows={2}
          value={form.notes} onChange={e => onChange('notes', e.target.value)}
          placeholder="Anything else to keep in mind…" />
      </div>
    </div>
  )
}

// ── New Trip Modal ─────────────────────────────────────────────────────────

const STEPS = ['Where & When', 'Travellers & Budget', 'Preferences']

function NewTripModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (trip: Trip) => void
}) {
  const { preferredCurrency } = useCurrency()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(() => ({
    ...defaultForm(),
    currency: preferredCurrency || 'INR',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const onChange = (k: keyof FormData, v: string | number | TravelStyle[]) =>
    setForm(f => ({ ...f, [k]: v }))

  const validateStep = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (step === 0) {
      if (!form.name.trim()) e.name = 'Trip name is required'
      if (!form.origin.trim()) e.origin = 'Origin is required'
      if (!form.destination.trim()) e.destination = 'Destination is required'
      if (!form.departure_date) e.departure_date = 'Departure date is required'
      if (!form.return_date) e.return_date = 'Return date is required'
      if (form.departure_date && form.return_date && form.return_date < form.departure_date)
        e.return_date = 'Return must be on or after departure'
    }
    if (step === 1) {
      if (form.num_travellers < 1) e.num_travellers = 'At least 1 traveller'
      if (form.budget_major && Number(form.budget_major) < 0)
        e.budget_major = 'Budget cannot be negative'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (validateStep()) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)

  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: TripCreate = {
        name: form.name.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        departure_date: form.departure_date,
        return_date: form.return_date,
        num_travellers: form.num_travellers,
        budget_minor: form.budget_major ? Math.round(Number(form.budget_major) * 100) : 0,
        currency: form.currency,
        travel_styles: form.travel_styles.length > 0 ? form.travel_styles : undefined,
        accommodation_pref: form.accommodation_pref.trim() || undefined,
        transport_pref: form.transport_pref.trim() || undefined,
        food_pref: form.food_pref.trim() || undefined,
        must_visit: form.must_visit.trim() || undefined,
        avoid: form.avoid.trim() || undefined,
        walking_tolerance: form.walking_tolerance,
        travel_pace: form.travel_pace,
        notes: form.notes.trim() || undefined,
      }
      const res = await createTrip(payload)
      onCreated(res.data)
    } catch (e) {
      setSubmitError(getErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" id="new-trip-modal" data-modal>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <div>
            <h2 className="text-base font-semibold text-surface-900">New Trip</h2>
            <p className="text-xs text-surface-400">{STEPS[step]}</p>
          </div>
          <button id="close-modal-btn" onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-6 pt-4">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors duration-200
              ${i <= step ? 'bg-accent-600' : 'bg-surface-200'}`} />
          ))}
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <Step1 form={form} onChange={onChange} errors={errors} />}
          {step === 1 && <Step2 form={form} onChange={onChange} errors={errors} />}
          {step === 2 && <Step3 form={form} onChange={onChange} />}
          {submitError && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle size={15} />
              {submitError}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-100">
          {step > 0 ? (
            <button id="form-back-btn" onClick={back} className="btn-secondary">
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <button id="form-cancel-btn" onClick={onClose} className="btn-ghost">Cancel</button>
          )}

          {step < STEPS.length - 1 ? (
            <button id="form-next-btn" onClick={next} className="btn-primary">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              id="form-submit-btn"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {submitting ? 'Saving…' : 'Create trip'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Trip card ──────────────────────────────────────────────────────────────

function TripCard({
  trip, onDelete,
}: {
  trip: Trip; onDelete: (id: number) => void
}) {
  const days = daysUntil(trip.departure_date)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Delete "${trip.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteTrip(trip.id)
      onDelete(trip.id)
    } catch {
      alert('Could not delete trip. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="card group flex flex-col gap-3 hover:shadow-card-hover transition-shadow duration-200" id={`trip-card-${trip.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-surface-900 truncate">{trip.name}</h3>
            {trip.is_demo && <span className="badge-demo text-xs">DEMO</span>}
          </div>
          <p className="text-xs text-surface-400 mt-0.5 flex items-center gap-1">
            <MapPin size={11} /> {trip.origin} → {trip.destination}
          </p>
        </div>
        <span className={`badge border flex-shrink-0 text-xs ${STATUS_CLASSES[trip.status]}`}>
          {trip.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <CalendarDays size={12} />
          {formatDate(trip.departure_date)} — {formatDate(trip.return_date)}
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} />
          {trip.num_travellers} traveller{trip.num_travellers !== 1 ? 's' : ''}
        </span>
        <Link
          to={`/budget?tripId=${trip.id}`}
          className="flex items-center gap-1 hover:text-accent-600 transition-colors"
          title="View or set budget for this trip"
        >
          <PiggyBank size={12} className="flex-shrink-0" />
          {trip.budget_minor > 0 ? (
            <CurrencyAmount
              amount={trip.budget_minor}
              currency={trip.currency}
              isMinor={true}
              inline={true}
              className="font-medium text-xs text-surface-600 dark:text-surface-300"
            />
          ) : (
            'Set budget'
          )}
        </Link>
        <span className="flex items-center gap-1">
          <Compass size={12} />
          {trip.num_days} day{trip.num_days !== 1 ? 's' : ''}
        </span>
      </div>

      {trip.travel_styles && (
        <div className="flex flex-wrap gap-1">
          {trip.travel_styles.split(',').map(s => (
            <span key={s} className="badge-accent text-xs">{s.replace('_', ' ')}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-surface-100">
        <span className="text-xs font-medium text-accent-600">
          {days >= 0 ? `in ${days} day${days !== 1 ? 's' : ''}` : `${Math.abs(days)} days ago`}
        </span>
        <button
          id={`delete-trip-${trip.id}`}
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost text-red-400 hover:text-red-600 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete trip"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// ── MyTrips page ───────────────────────────────────────────────────────────

export default function MyTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    listTrips()
      .then(r => setTrips(r.data))
      .catch(e => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreated = (trip: Trip) => {
    setTrips(prev => [trip, ...prev])
    setShowModal(false)
  }

  const handleDelete = (id: number) =>
    setTrips(prev => prev.filter(t => t.id !== id))

  return (
    <div className="space-y-6 animate-fade-in">
      {showModal && (
        <NewTripModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Trips</h1>
          <p className="page-subtitle">{trips.length} trip{trips.length !== 1 ? 's' : ''} total</p>
        </div>
        <button id="new-trip-btn" onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> New Trip
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs hover:underline">Retry</button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && trips.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 text-center gap-4" id="trips-empty">
          <div className="w-14 h-14 rounded-2xl bg-accent-50 flex items-center justify-center">
            <Briefcase size={26} className="text-accent-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-surface-900">No trips yet</h2>
            <p className="text-sm text-surface-500 mt-1">Create your first trip to get started.</p>
          </div>
          <button id="empty-new-trip-btn" onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> New Trip
          </button>
        </div>
      )}

      {/* Trip grid */}
      {!loading && trips.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(t => (
            <TripCard key={t.id} trip={t} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
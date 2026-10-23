/**
 * Formatting utilities — currency, dates, durations.
 * Used across Overview, MyTrips, Itinerary, and Splitwise.
 */

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  '₹': 'INR',
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
}

const CURRENCY_LOCALE_MAP: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  SGD: 'en-SG',
  AED: 'en-AE',
}

/** Convert minor currency units (e.g. paise, cents) to human-readable string. */
export function formatMoney(minor: number, currency: string = 'INR'): string {
  const safeMinor = typeof minor === 'number' && !isNaN(minor) ? minor : 0
  const major = safeMinor / 100
  const normalized = CURRENCY_SYMBOL_MAP[currency] ?? (currency && currency.length === 3 ? currency.toUpperCase() : 'INR')
  const locale = CURRENCY_LOCALE_MAP[normalized] ?? 'en-US'

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 0,
    }).format(major)
  } catch {
    return `${normalized} ${Math.round(major).toLocaleString()}`
  }
}

/** Format an ISO date string or Date object to a readable locale date. */
export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Return how many days until a date (negative = past). */
export function daysUntil(d: string): number {
  const target = new Date(d)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}

/** Convert "HH:MM" string to 12-hour display. */
export function formatTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Human-friendly duration: "1 h 30 min", "45 min", "2 h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Status badge colours (Tailwind classes). */
export const STATUS_CLASSES: Record<string, string> = {
  planning:  'bg-blue-50 text-blue-700 border-blue-200',
  booked:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  active:    'bg-accent-50 text-accent-700 border-accent-200',
  completed: 'bg-surface-100 text-surface-500 border-surface-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

/** Category colours for activities. */
export const CATEGORY_CLASSES: Record<string, string> = {
  sightseeing:   'bg-purple-50 text-purple-700',
  food:          'bg-orange-50 text-orange-700',
  nightlife:     'bg-pink-50 text-pink-700',
  adventure:     'bg-red-50 text-red-700',
  wellness:      'bg-green-50 text-green-700',
  culture:       'bg-indigo-50 text-indigo-700',
  nature:        'bg-emerald-50 text-emerald-700',
  shopping:      'bg-yellow-50 text-yellow-700',
  transport:     'bg-gray-50 text-gray-600',
  accommodation: 'bg-blue-50 text-blue-700',
  rest:          'bg-surface-50 text-surface-500',
  other:         'bg-surface-50 text-surface-500',
}

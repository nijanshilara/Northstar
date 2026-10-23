// ── Trip types ──────────────────────────────────────────────────────────────

export type TripStatus = 'planning' | 'booked' | 'active' | 'completed' | 'cancelled'

export type TravelStyle =
  | 'outgoing' | 'leisurely' | 'adventure' | 'luxury' | 'budget'
  | 'solo' | 'romantic' | 'family' | 'group' | 'cultural'
  | 'food_nightlife' | 'nature_wellness'

export interface Trip {
  id: number
  name: string
  origin: string
  destination: string
  departure_date: string
  return_date: string
  num_days: number
  num_travellers: number
  budget_minor: number
  budget_major: number
  currency: string
  status: TripStatus
  is_demo: boolean
  travel_styles: string | null
  accommodation_pref: string | null
  transport_pref: string | null
  food_pref: string | null
  must_visit: string | null
  avoid: string | null
  walking_tolerance: number
  travel_pace: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TripCreate {
  name: string
  origin: string
  destination: string
  departure_date: string
  return_date: string
  num_travellers?: number
  budget_minor?: number
  currency?: string
  travel_styles?: TravelStyle[]
  accommodation_pref?: string
  transport_pref?: string
  food_pref?: string
  must_visit?: string
  avoid?: string
  walking_tolerance?: number
  travel_pace?: number
  notes?: string
}

// ── Activity types ─────────────────────────────────────────────────────────

export type ActivityCategory =
  | 'sightseeing' | 'food' | 'nightlife' | 'adventure' | 'wellness'
  | 'culture' | 'nature' | 'shopping' | 'transport' | 'accommodation'
  | 'rest' | 'other'

export interface Activity {
  id: number
  trip_id: number
  day_number: number
  name: string
  category: ActivityCategory
  location: string | null
  latitude: number | null
  longitude: number | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  cost_minor: number
  cost_major: number
  currency: string
  is_locked: boolean
  is_confirmed: boolean
  notes: string | null
  recommendation_reason: string | null
  booking_required: boolean
  opening_hours: string | null
  created_at: string
}

// ── Expense types ──────────────────────────────────────────────────────────

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares'

export interface GroupMember {
  id: number
  group_id: number
  name: string
  email: string | null
  is_active?: boolean
}

export interface ExpenseGroup {
  id: number
  trip_id: number | null
  name: string
  currency: string
  created_at: string
  members: GroupMember[]
}

export interface ExpenseShare {
  id: number
  expense_id: number
  member_id: number
  share_minor: number
}

export interface Expense {
  id: number
  group_id: number
  paid_by_id: number
  description: string
  amount_minor: number
  amount_major: number
  currency: string
  category: string
  split_method: SplitMethod
  expense_date: string
  notes: string | null
  created_at: string
  shares: ExpenseShare[]
}

export interface MemberBalance {
  member_id: number
  member_name: string
  total_paid_minor: number
  total_owed_minor: number
  net_minor: number
}

export interface Settlement {
  from_member_id: number
  from_member_name: string
  to_member_id: number
  to_member_name: string
  amount_minor: number
  currency: string
}

export interface SettlementPlan {
  group_id: number
  currency: string
  balances: MemberBalance[]
  settlements: Settlement[]
  total_expenses_minor: number
}

// ── Demo types ─────────────────────────────────────────────────────────────

export interface DemoDestination {
  id: number
  name: string
  country: string
  category: string
  avg_budget_per_day_inr: number
  best_months: string[]
  highlights: string[]
  image_placeholder: string
}

export interface ServiceStatus {
  name: string
  status: 'connected' | 'not_configured' | 'external_search_only' | 'unavailable'
  type: 'live' | 'fallback' | 'redirect' | 'database' | 'guides'
  provider: string
  is_live: boolean
  details: string
  setup_guide?: string | null
}

export interface IntegrationsStatus {
  overall_mode: 'live' | 'hybrid' | 'demo'
  summary: string
  demo_mode: boolean
  services: Record<string, ServiceStatus>
}

export interface DemoStatus {
  demo_mode: boolean
  overall_mode?: 'live' | 'hybrid' | 'demo'
  message: string
}

// ── API generic ────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string
}

// ── Currency Converter types ────────────────────────────────────────────────

export interface CurrencyConversionResult {
  from: string
  to: string
  amount: number
  converted_amount: number
  rate: number
  inverse_rate: number
  date: string
  provider: string
  is_cached: boolean
  is_stale: boolean
  warning?: string | null
  note?: string | null
  disclaimer: string
}

export interface CurrencyListResponse {
  currencies: Record<string, string>
  popular: string[]
  provider: string
  cached: boolean
}

export interface CurrencyRatesResponse {
  base: string
  date: string
  rates: Record<string, number>
  provider: string
  is_cached: boolean
  is_stale: boolean
  warning?: string | null
  note?: string | null
}

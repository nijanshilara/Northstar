/**
 * api.ts — Single source of truth for all backend API calls.
 * All calls go through /api (proxied to http://localhost:8000 by Vite).
 */

import axios from 'axios'
import type {
  Trip, TripCreate, Activity, ExpenseGroup,
  Expense, SettlementPlan, DemoStatus, DemoDestination,
  IntegrationsStatus,
  CurrencyConversionResult, CurrencyListResponse, CurrencyRatesResponse,
} from '../types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
})

// ── Health ─────────────────────────────────────────────────────────────────

export const getHealth = () =>
  api.get<{ status: string; demo_mode: boolean; version: string }>('/health')

// ── Trips ──────────────────────────────────────────────────────────────────

export const listTrips = () => api.get<Trip[]>('/trips/')
export const getTrip = (id: number) => api.get<Trip>(`/trips/${id}`)
export const createTrip = (data: TripCreate) => api.post<Trip>('/trips/', data)
export const updateTrip = (id: number, data: Partial<TripCreate>) =>
  api.patch<Trip>(`/trips/${id}`, data)
export const deleteTrip = (id: number) => api.delete(`/trips/${id}`)

// ── Activities ─────────────────────────────────────────────────────────────

export const listActivities = (tripId: number) =>
  api.get<Activity[]>(`/activities/trip/${tripId}`)
export const createActivity = (data: Partial<Activity>) =>
  api.post<Activity>('/activities/', data)
export const toggleLock = (id: number) => api.patch(`/activities/${id}/lock`)
export const deleteActivity = (id: number) => api.delete(`/activities/${id}`)

// ── Expense Groups ─────────────────────────────────────────────────────────

export const listGroups = () => api.get<ExpenseGroup[]>('/expenses/groups')
export const getGroup = (id: number) => api.get<ExpenseGroup>(`/expenses/groups/${id}`)
export const createGroup = (data: {
  name: string; currency?: string; trip_id?: number
  members: { name: string; email?: string }[]
}) => api.post<ExpenseGroup>('/expenses/groups', data)

// ── Expenses ───────────────────────────────────────────────────────────────

export const listExpenses = (groupId: number) =>
  api.get<Expense[]>(`/expenses/groups/${groupId}/expenses`)
export const createExpense = (data: Omit<Partial<Expense>, 'shares'> & {
  group_id: number
  paid_by_id: number
  participant_ids?: number[]
  shares?: { member_id: number; share_minor: number }[]
}) => api.post<Expense>('/expenses/', data)

export const updateExpense = (expenseId: number, data: Omit<Partial<Expense>, 'shares'> & {
  participant_ids?: number[]
  shares?: { member_id: number; share_minor: number }[]
}) => api.put<Expense>(`/expenses/${expenseId}`, data)

export const deleteExpense = (expenseId: number) =>
  api.delete<{ status: string; id: number }>(`/expenses/${expenseId}`)

// ── Groups & Settlements ───────────────────────────────────────────────────

export const addMemberToGroup = (groupId: number, data: { name: string; email?: string }) =>
  api.post<import('../types').GroupMember>(`/expenses/groups/${groupId}/members`, data)

export const deleteGroup = (groupId: number, force: boolean = false) =>
  api.delete<{ status: string; id: number; name: string }>(`/expenses/groups/${groupId}${force ? '?force=true' : ''}`)

export const leaveGroup = (groupId: number, memberId: number) =>
  api.post<{ status: string; member_id: number; group_id: number }>(`/expenses/groups/${groupId}/leave`, { member_id: memberId })

export const settleDebt = (groupId: number, data: { from_member_id: number; to_member_id: number; amount_minor: number; notes?: string }) =>
  api.post<Expense>(`/expenses/groups/${groupId}/settle`, data)

export const getSettlements = (groupId: number) =>
  api.get<SettlementPlan>(`/expenses/groups/${groupId}/settlements`)

// ── Demo ───────────────────────────────────────────────────────────────────

export const getDemoStatus = () => api.get<DemoStatus>('/demo/status')
export const getIntegrationsStatus = () => api.get<IntegrationsStatus>('/integrations/status')
export const seedDemoData = () => api.post('/demo/seed')
export const getDemoDestinations = () =>
  api.get<{ is_demo: boolean; destinations: DemoDestination[] }>('/demo/destinations')

// ── Itinerary generation (Phase 2) ─────────────────────────────────────────

export interface BudgetBreakdown {
  by_category: Record<string, number>
  total_minor: number
  budget_cap_minor: number
  over_budget: boolean
  over_budget_by_minor: number
  currency?: string
  actual_spent_minor?: number
  remaining_minor?: number
  remaining_actual_minor?: number
  over_actual_by_minor?: number
}

export interface DaySchedule {
  day_number: number
  date: string
  theme?: string
  status: 'scheduled' | 'partial' | 'unfilled'
  unfilled_reason?: string
  activities: import('../types').Activity[]
}

export interface GenerateItineraryResponse {
  trip_id: number
  activities: import('../types').Activity[]
  budget: BudgetBreakdown
  warnings: string[]
  is_demo: boolean
  days?: DaySchedule[]
  calendar_complete?: boolean
  schedule_complete?: boolean
  ai_enhanced?: boolean
  ai_unavailable_reason?: string
}

export interface ReplanResponse {
  trip_id: number
  activities: import('../types').Activity[]
  budget: BudgetBreakdown
  changes: string[]
  warnings: string[]
}

export const generateItinerary = (
  tripId: number,
  opts: { overwrite_unlocked?: boolean; use_ai?: boolean } = {},
) => api.post<GenerateItineraryResponse>(`/itinerary/${tripId}/generate`, opts, {
  timeout: 30_000,
})

export const getItinerary = (tripId: number) =>
  api.get<GenerateItineraryResponse>(`/itinerary/${tripId}`)

export const replanItinerary = (
  tripId: number,
  payload: { activity_name: string; day_number: number; reason: string; delay_minutes?: number },
) => api.post<ReplanResponse>(`/itinerary/${tripId}/replan`, payload)

export const getItineraryBudget = (tripId: number) =>
  api.get<BudgetBreakdown>(`/itinerary/${tripId}/budget`)

// ── Currency Converter ─────────────────────────────────────────────────────

export const getCurrencies = () =>
  api.get<CurrencyListResponse>('/currency/currencies')

export const convertCurrency = (from: string, to: string, amount: number) =>
  api.get<CurrencyConversionResult>('/currency/convert', {
    params: { from, to, amount },
  })

export const getRates = (base: string = 'USD') =>
  api.get<CurrencyRatesResponse>('/currency/rates', {
    params: { base },
  })

// ── Error helper ───────────────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
      return 'The itinerary request took longer than expected while assembling destination data. Please click Retry.'
    }
    return error.response?.data?.detail ?? error.message ?? 'An error occurred'
  }
  if (error instanceof Error) return error.message
  return 'An unknown error occurred'
}

/**
 * authApi.ts — All authentication API calls.
 * Separate from the main api.ts to keep concerns clean.
 * Uses axios with withCredentials:true so httpOnly cookies are sent.
 */

import axios from 'axios'
import { API_BASE } from './api'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,   // ← essential for cookie-based auth
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
})

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  name: string
  email: string
  is_verified: boolean
  theme: string | null
  palette: string | null
  custom_accent: string | null
  created_at: string
}

export interface HistoryItem {
  id: number
  event_type: string
  label: string
  payload: string | null
  is_saved: boolean
  trip_id: number | null
  created_at: string
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export const authApi = {
  register: async (name: string, email: string, password: string) => {
    const r = await api.post<{
      message: string
      user: User
      email_dev_mode: boolean
      dev_verification_token?: string
    }>('/auth/register', { name, email, password })
    return r.data
  },

  login: async (email: string, password: string) => {
    const r = await api.post<{ message: string; user: User }>('/auth/login', { email, password })
    return r.data
  },

  logout: async () => {
    await api.post('/auth/logout')
  },

  me: async (): Promise<User> => {
    const r = await api.get<User>('/auth/me')
    return r.data
  },

  refresh: async (): Promise<User> => {
    const r = await api.post<{ user: User }>('/auth/refresh')
    return r.data.user
  },

  verifyEmail: async (token: string) => {
    const r = await api.post<{ message: string; user: User }>('/auth/verify-email', { token })
    return r.data
  },

  resendVerify: async () => {
    const r = await api.post<{
      message: string; email_dev_mode: boolean; dev_verification_token?: string
    }>('/auth/resend-verify')
    return r.data
  },

  forgotPassword: async (email: string) => {
    const r = await api.post<{ message: string; dev_token?: string }>('/auth/forgot-password', { email })
    return r.data
  },

  resetPassword: async (token: string, newPassword: string) => {
    const r = await api.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    })
    return r.data
  },

  updateProfile: async (data: { name?: string; theme?: string; palette?: string; custom_accent?: string }) => {
    const r = await api.patch<User>('/auth/profile', data)
    return r.data
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const r = await api.post<{ message: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return r.data
  },

  deleteAccount: async () => {
    const r = await api.delete<{ message: string }>('/auth/account')
    return r.data
  },
}

// ── History endpoints ──────────────────────────────────────────────────────────

export const historyApi = {
  list: async (params?: { event_type?: string; saved_only?: boolean; limit?: number; offset?: number }) => {
    const r = await api.get<HistoryItem[]>('/history/', { params })
    return r.data
  },

  add: async (data: {
    event_type: string
    label: string
    payload?: string
    is_saved?: boolean
    trip_id?: number
  }) => {
    const r = await api.post<HistoryItem>('/history/', data)
    return r.data
  },

  toggleSave: async (id: number) => {
    const r = await api.patch<HistoryItem>(`/history/${id}/save`)
    return r.data
  },

  delete: async (id: number) => {
    await api.delete(`/history/${id}`)
  },

  clear: async () => {
    const r = await api.delete<{ message: string }>('/history/?confirm=true')
    return r.data
  },
}

// ── Error helper ───────────────────────────────────────────────────────────────

export function getAuthError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (Array.isArray(detail)) {
      // Pydantic validation errors
      return detail.map((e: { msg: string }) => e.msg).join('; ')
    }
    return detail ?? error.message ?? 'An error occurred'
  }
  if (error instanceof Error) return error.message
  return 'An unknown error occurred'
}

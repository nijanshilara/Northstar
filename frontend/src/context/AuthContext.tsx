/**
 * AuthContext — manages the authenticated user state globally.
 *
 * Uses httpOnly cookies set by the backend (access_token + refresh_token).
 * axios is configured with withCredentials:true so cookies are sent automatically.
 * No passwords or tokens are stored in localStorage.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, type User } from '../services/authApi'

interface AuthState {
  user: User | null
  loading: boolean           // initial /me check in progress
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<{ devToken?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
  })

  /** Fetch the current user from the backend (reads access_token cookie). */
  const refreshUser = useCallback(async () => {
    try {
      const user = await authApi.me()
      setState({ user, loading: false, isAuthenticated: true })
    } catch {
      setState({ user: null, loading: false, isAuthenticated: false })
    }
  }, [])

  // On mount, check if we already have a valid session
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const { user } = await authApi.login(email, password)
    setState({ user, loading: false, isAuthenticated: true })
  }

  const register = async (name: string, email: string, password: string) => {
    const data = await authApi.register(name, email, password)
    setState({ user: data.user, loading: false, isAuthenticated: true })
    return { devToken: data.dev_verification_token }
  }

  const logout = async () => {
    await authApi.logout()
    setState({ user: null, loading: false, isAuthenticated: false })
  }

  const updateUser = (user: User) => {
    setState(s => ({ ...s, user }))
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

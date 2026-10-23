import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
}

/**
 * Redirects unauthenticated users to /login, preserving the intended destination
 * via location.state.from so the login page can redirect back after sign-in.
 */
export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    // Avoid flash-redirect while the initial /me check is in progress
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="w-8 h-8 border-4 border-accent-300 border-t-accent-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}

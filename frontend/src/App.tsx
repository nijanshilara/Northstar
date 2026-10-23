import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Public auth pages
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

// App pages (public-access but auth-aware)
import Overview from './pages/Overview'
import MyTrips from './pages/MyTrips'
import Explore from './pages/Explore'
import Flights from './pages/Flights'
import Hotels from './pages/Hotels'
import Transport from './pages/Transport'
import Itinerary from './pages/Itinerary'
import Budget from './pages/Budget'
import Weather from './pages/Weather'
import Splitwise from './pages/Splitwise'
import CurrencyConverter from './pages/CurrencyConverter'
import AIAssistant from './pages/AIAssistant'
import Safety from './pages/Safety'
import Settings from './pages/Settings'

// Auth-required pages
import Profile from './pages/Profile'
import HistoryPage from './pages/History'
import Capsules from './pages/Capsules'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* ── Public auth routes (no sidebar) ── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* ── App routes (with sidebar layout) ── */}
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Overview />} />
              <Route path="trips" element={<MyTrips />} />
              <Route path="explore" element={<Explore />} />
              <Route path="flights" element={<Flights />} />
              <Route path="hotels" element={<Hotels />} />
              <Route path="transport" element={<Transport />} />
              <Route path="itinerary" element={<Itinerary />} />
              <Route path="budget" element={<Budget />} />
              <Route path="weather" element={<Weather />} />
              <Route path="splitwise" element={<Splitwise />} />
              <Route path="currency" element={<CurrencyConverter />} />
              <Route path="ai-assistant" element={<AIAssistant />} />
              <Route path="safety" element={<Safety />} />
              <Route path="settings" element={<Settings />} />

              {/* Memory Capsules accessible with guest overview and auth-protected content */}
              <Route path="capsules" element={<Capsules />} />
              <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}


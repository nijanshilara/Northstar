import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar.tsx'
import DemoBanner from '../components/DemoBanner.tsx'
import FloatingChatbot from '../components/FloatingChatbot.tsx'
import { getIntegrationsStatus } from '../services/api'

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [overallMode, setOverallMode] = useState<'live' | 'hybrid' | 'demo'>('hybrid')
  const [summary, setSummary] = useState<string>('')
  const [isDemoMode, setIsDemoMode] = useState(true)
  const location = useLocation()

  useEffect(() => {
    getIntegrationsStatus()
      .then(res => {
        setOverallMode(res.data.overall_mode)
        setSummary(res.data.summary)
        setIsDemoMode(res.data.demo_mode)
      })
      .catch(() => {
        setOverallMode('hybrid')
        setIsDemoMode(true)
      })
  }, [])

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        currentPath={location.pathname}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onMenuToggle={() => setSidebarCollapsed(c => !c)}
          isDemoMode={isDemoMode}
          overallMode={overallMode}
        />

        <DemoBanner overallMode={overallMode} summary={summary} />

        <main className="min-w-0 flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>

        {/* Global Floating AI Assistant Chatbot */}
        <FloatingChatbot />
      </div>
    </div>
  )
}


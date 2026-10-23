import { useState } from 'react'
import { Info, X, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

interface DemoBannerProps {
  overallMode?: 'live' | 'hybrid' | 'demo'
  summary?: string
}

export default function DemoBanner({ overallMode = 'hybrid', summary }: DemoBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const isLive = overallMode === 'live'

  return (
    <aside
      role="status"
      aria-label="Integration mode status banner"
      className="px-4 py-2 text-xs flex items-center justify-between gap-3 border-b transition-colors select-none"
      style={{
        background: isLive
          ? 'var(--color-surface-50, #f0fdf4)'
          : 'var(--color-surface-50, #fffbeb)',
        borderColor: isLive ? '#bbf7d0' : '#fde68a',
        color: isLive ? '#166534' : '#92400e',
      }}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {isLive ? (
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
        ) : (
          <Info size={15} className="text-amber-600 flex-shrink-0" />
        )}
        <span className="font-semibold">
          {isLive ? 'Live Mode Active:' : 'Hybrid Mode:'}
        </span>
        <span className="opacity-90">
          {summary ||
            (isLive
              ? 'Open-Meteo weather forecasts, Gemini AI Assistant, and trip storage are live.'
              : 'Open-Meteo weather & local database are live. AI Assistant is in fallback mode. Flights and hotels use verified direct links.')}
        </span>
        <Link
          to="/settings"
          className="font-medium underline hover:opacity-80 inline-flex items-center gap-0.5 ml-1"
        >
          View Integration Status
        </Link>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
        title="Dismiss notice"
        aria-label="Dismiss banner"
      >
        <X size={14} />
      </button>
    </aside>
  )
}
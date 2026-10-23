import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Sun, Moon, Palette as PaletteIcon, Check, Droplets,
  CloudSun, Bot, Plane, Hotel, Database, RefreshCw,
  CheckCircle2, AlertTriangle, Key, ShieldCheck, Navigation,
  Coins, ExternalLink
} from 'lucide-react'
import { useTheme, type Theme, type Palette } from '../context/ThemeContext'
import { useCurrency, POPULAR_CURRENCIES, SUPPORTED_CURRENCIES } from '../context/CurrencyContext'
import CurrencyAmount from '../components/CurrencyAmount'
import { getIntegrationsStatus } from '../services/api'
import type { IntegrationsStatus } from '../types'

// ── Theme option definitions ────────────────────────────────────────────────

interface ThemeOption {
  id: Theme
  label: string
  description: string
  icon: React.ReactNode
  preview: React.ReactNode
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Clean light backgrounds with dark, readable text.',
    icon: <Sun size={18} />,
    preview: (
      <div className="w-full h-16 rounded-lg overflow-hidden border border-slate-200 flex">
        <div className="w-7 bg-white border-r border-slate-100 flex flex-col gap-1 p-1">
          <div className="h-1.5 w-4 rounded bg-slate-200" />
          <div className="h-1.5 w-4 rounded bg-teal-400/70" />
          <div className="h-1.5 w-4 rounded bg-slate-100" />
        </div>
        <div className="flex-1 bg-slate-50 p-2 flex flex-col gap-1.5">
          <div className="h-2 w-14 rounded bg-slate-400" />
          <div className="h-6 w-full rounded-lg bg-white border border-slate-200" />
          <div className="flex gap-1">
            <div className="h-3 w-10 rounded bg-teal-500" />
            <div className="h-3 w-8 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Dark surfaces with accessible contrast for low-light use.',
    icon: <Moon size={18} />,
    preview: (
      <div className="w-full h-16 rounded-lg overflow-hidden border border-slate-700 flex">
        <div className="w-7 bg-slate-900 border-r border-slate-700 flex flex-col gap-1 p-1">
          <div className="h-1.5 w-4 rounded bg-slate-600" />
          <div className="h-1.5 w-4 rounded bg-teal-500/70" />
          <div className="h-1.5 w-4 rounded bg-slate-700" />
        </div>
        <div className="flex-1 bg-slate-900 p-2 flex flex-col gap-1.5">
          <div className="h-2 w-14 rounded bg-slate-400" />
          <div className="h-6 w-full rounded-lg bg-slate-800 border border-slate-700" />
          <div className="flex gap-1">
            <div className="h-3 w-10 rounded bg-teal-600" />
            <div className="h-3 w-8 rounded bg-slate-700" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'colourful',
    label: 'Colourful',
    description: 'A vibrant travel-inspired theme with customisable palette.',
    icon: <PaletteIcon size={18} />,
    preview: (
      <div className="w-full h-16 rounded-lg overflow-hidden border border-indigo-200 flex">
        <div className="w-7 flex flex-col gap-1 p-1" style={{ background: 'linear-gradient(180deg,#0c4a6e,#164e63)' }}>
          <div className="h-1.5 w-4 rounded" style={{ background: 'rgba(125,211,252,0.5)' }} />
          <div className="h-1.5 w-4 rounded bg-white/30" />
          <div className="h-1.5 w-4 rounded bg-white/15" />
        </div>
        <div className="flex-1 p-2 flex flex-col gap-1.5" style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f7fa,#ecfeff)' }}>
          <div className="h-2 w-14 rounded" style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)' }} />
          <div className="h-6 w-full rounded-xl bg-white/80 border border-cyan-200" />
          <div className="flex gap-1">
            <div className="h-3 w-10 rounded" style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)' }} />
            <div className="h-3 w-8 rounded bg-white border border-cyan-200" />
          </div>
        </div>
      </div>
    ),
  },
]

// ── Palette definitions ─────────────────────────────────────────────────────

interface PaletteOption {
  id: string
  name: string
  swatches: string[]
  description: string
}

const PALETTE_OPTIONS: PaletteOption[] = [
  {
    id: 'ocean',
    name: 'Ocean Breeze',
    description: 'Teal, turquoise and deep blue — inspired by the sea.',
    swatches: ['#0891b2', '#06b6d4', '#0e7490', '#164e63'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Coral, orange, warm pink and purple.',
    swatches: ['#f97316', '#fb923c', '#db2777', '#be185d'],
  },
  {
    id: 'tropical',
    name: 'Tropical',
    description: 'Emerald, aqua, lime accents and ocean blue.',
    swatches: ['#10b981', '#06b6d4', '#34d399', '#0891b2'],
  },
  {
    id: 'lavender',
    name: 'Lavender Dream',
    description: 'Lavender, violet and soft cool purples.',
    swatches: ['#7c3aed', '#a78bfa', '#6d28d9', '#8b5cf6'],
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Rose pink, berry and muted blush.',
    swatches: ['#e11d48', '#fb7185', '#be185d', '#fda4af'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green, sage and earthy neutrals.',
    swatches: ['#166534', '#15803d', '#4ade80', '#86efac'],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Pick your own accent colour.',
    swatches: [],
  },
]

// ── Settings page ───────────────────────────────────────────────────────────

export default function Settings() {
  const { theme, setTheme, palette, setPalette, customAccent, setCustomAccent } = useTheme()
  const { preferredCurrency, setPreferredCurrency, showConvertedPrices, setShowConvertedPrices } = useCurrency()
  const [integrations, setIntegrations] = useState<IntegrationsStatus | null>(null)
  const [loadingIntegrations, setLoadingIntegrations] = useState(false)

  const fetchIntegrations = () => {
    setLoadingIntegrations(true)
    getIntegrationsStatus()
      .then(res => setIntegrations(res.data))
      .catch(() => {})
      .finally(() => setLoadingIntegrations(false))
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your Northstar preferences and view integration status.</p>
        </div>
      </div>

      {/* ── API Integrations & Service Status ──────────────────────────────── */}
      <section className="card space-y-5" aria-labelledby="integrations-heading">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 id="integrations-heading" className="section-heading flex items-center gap-2">
              <ShieldCheck size={18} className="text-accent-600" />
              API Integrations & Operational Status
            </h2>
            <p className="section-subtext mt-0.5">
              Honest, real-time status of external data sources and travel services.
            </p>
          </div>
          <button
            onClick={fetchIntegrations}
            disabled={loadingIntegrations}
            className="btn-ghost flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-100 cursor-pointer"
            title="Refresh integration status"
          >
            <RefreshCw size={13} className={loadingIntegrations ? 'animate-spin' : ''} />
            {loadingIntegrations ? 'Checking…' : 'Refresh Status'}
          </button>
        </div>

        {/* Overall Status Banner */}
        {integrations && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              integrations.overall_mode === 'live'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {integrations.overall_mode === 'live' ? (
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              )}
              <span>{integrations.summary}</span>
            </div>
            <span className="font-semibold uppercase text-[10px] px-2 py-0.5 rounded-full bg-white/70">
              {integrations.overall_mode}
            </span>
          </div>
        )}

        {/* Services Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Weather */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CloudSun size={18} className="text-amber-500" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Weather Forecasts</span>
              </div>
              <span className="badge badge-success text-xs font-semibold px-2.5 py-0.5">
                Connected · Live
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Open-Meteo free API is active. Real 7-day temperature, rain, wind, UV and sunrise/sunset forecasts.
            </p>
          </div>

          {/* AI Assistant */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-accent-600 dark:text-teal-400" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">AI Travel Assistant</span>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                integrations?.services?.ai?.is_live
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
              }`}>
                {integrations?.services?.ai?.is_live ? 'Connected · Live' : 'Fallback Mode'}
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              {integrations?.services?.ai?.details || 'Set GEMINI_API_KEY in backend/.env for live generative AI.'}
            </p>
          </div>

          {/* Flights */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Plane size={18} className="text-blue-500 dark:text-blue-400" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Flight Search</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800">
                External Search Links
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Direct pre-filled links to Google Flights, Skyscanner & MakeMyTrip. No mock prices or fake bookings.
            </p>
          </div>

          {/* Hotels */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Hotel size={18} className="text-purple-500 dark:text-purple-400" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Hotels & Stays</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800">
                External Search Links
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Direct pre-filled searches on Booking.com, Airbnb & Agoda. Real-time availability verified on provider sites.
            </p>
          </div>

          {/* Ground Transit */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation size={18} className="text-teal-600 dark:text-teal-400" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Ground Transport</span>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800">
                Transit Navigation Links
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Deep navigation links to Google Maps Transit, IRCTC Trains, and local ride booking services.
            </p>
          </div>

          {/* Database */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Local Database</span>
              </div>
              <span className="badge badge-success text-xs font-semibold px-2.5 py-0.5">
                Connected · SQLite
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Real local persistence. User accounts, custom trips, itineraries, capsules, and expenses persist in <code className="bg-surface-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs font-mono">travel_guide.db</code>.
            </p>
          </div>

          {/* Currency Rates */}
          <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 flex flex-col justify-between gap-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-amber-500" />
                <span className="font-semibold text-sm text-surface-900 dark:text-slate-100">Currency Converter</span>
              </div>
              <span className="badge badge-success text-xs font-semibold px-2.5 py-0.5">
                Connected · ECB
              </span>
            </div>
            <p className="text-xs text-surface-700 dark:text-slate-200 leading-relaxed">
              Real-time European Central Bank rates via Frankfurter API. Hourly updates cached locally for instant inline price conversions.
            </p>
            <div className="pt-1">
              <Link
                to="/currency"
                className="text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline inline-flex items-center gap-1"
              >
                Open Currency Converter <ExternalLink size={11} />
              </Link>
            </div>
          </div>
        </div>

        {/* Gemini API Key Instructions box */}
        {!integrations?.services?.ai?.is_live && (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-xs space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
              <Key size={15} />
              <span>How to Activate Live Gemini AI (Free)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-amber-800 dark:text-amber-300 leading-relaxed">
              <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google AI Studio</a> and generate a free API key.</li>
              <li>Open your project folder and locate or create <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">backend/.env</code> (you can copy from <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">backend/.env.example</code>).</li>
              <li>Add the line: <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded font-mono">GEMINI_API_KEY=your_copied_api_key_here</code></li>
              <li>Save the file and click <strong>Refresh Status</strong> above to activate live AI assistance immediately!</li>
            </ol>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              💡 <em>Never share your secret API key or commit it to GitHub. It is read strictly by the backend server.</em>
            </p>
          </div>
        )}
      </section>

      {/* ── Appearance: Theme selector ──────────────────────────────────────── */}
      <section className="card space-y-5" aria-labelledby="appearance-heading">
        <div>
          <h2 id="appearance-heading" className="section-heading flex items-center gap-2">
            <PaletteIcon size={16} className="text-accent-600" />
            Appearance
          </h2>
          <p className="section-subtext mt-0.5">
            Choose a theme. Applied immediately across all pages and remembered in this browser.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Theme selection">
          {THEME_OPTIONS.map(opt => {
            const isActive = theme === opt.id
            return (
              <button
                key={opt.id}
                id={`theme-${opt.id}`}
                role="radio"
                aria-checked={isActive}
                onClick={() => setTheme(opt.id)}
                className={[
                  'relative text-left rounded-xl border-2 p-3 transition-all duration-200 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  isActive
                    ? 'border-accent-500 bg-accent-50 shadow-sm'
                    : 'border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm',
                ].join(' ')}
              >
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
                    <Check size={11} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <div className="mb-3">{opt.preview}</div>
                <div className="flex items-center gap-2">
                  <span className={isActive ? 'text-accent-600' : 'text-surface-500'}>{opt.icon}</span>
                  <span className={`text-sm font-semibold ${isActive ? 'text-accent-700' : 'text-surface-800'}`}>
                    {opt.label}
                  </span>
                </div>
                <p className="section-subtext mt-1 leading-relaxed">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Colourful palette selector (visible only when colourful is active) ─ */}
      {theme === 'colourful' && (
        <section className="card space-y-5" aria-labelledby="palette-heading">
          <div>
            <h2 id="palette-heading" className="section-heading flex items-center gap-2">
              <Droplets size={16} className="text-accent-600" />
              Choose Your Colour Palette
            </h2>
            <p className="section-subtext mt-0.5">
              Changes are applied instantly across every page, including sidebar, buttons, badges and links.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Colour palette selection">
            {PALETTE_OPTIONS.map(opt => {
              const isActive = palette === opt.id
              return (
                <button
                  key={opt.id}
                  id={`palette-${opt.id}`}
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setPalette(opt.id as Palette)}
                  className={[
                    'relative text-left rounded-xl border-2 p-3 transition-all duration-200 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    isActive
                      ? 'border-accent-500 bg-accent-50 shadow-md'
                      : 'border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm',
                  ].join(' ')}
                >
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </div>
                  )}

                  {/* Swatches */}
                  <div className="flex gap-1 mb-2.5">
                    {opt.id === 'custom' ? (
                      <div
                        className="h-6 w-6 rounded-full border-2 border-surface-200"
                        style={{ background: customAccent }}
                        title="Custom colour"
                      />
                    ) : (
                      opt.swatches.map((c, i) => (
                        <div
                          key={i}
                          className="h-5 w-5 rounded-full border border-white/60 shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))
                    )}
                  </div>

                  <p className={`text-xs font-semibold ${isActive ? 'text-accent-700' : 'text-surface-800'}`}>
                    {opt.name}
                  </p>
                  <p className="section-subtext mt-0.5 leading-snug text-[10px]">{opt.description}</p>
                </button>
              )
            })}
          </div>

          {/* Custom colour picker (only when custom palette is active) */}
          {palette === 'custom' && (
            <div className="border-t border-surface-100 pt-4 space-y-3">
              <label htmlFor="custom-accent-picker" className="label">
                Custom Accent Colour
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="custom-accent-picker"
                  type="color"
                  value={customAccent}
                  onChange={e => setCustomAccent(e.target.value)}
                  className="h-10 w-20 rounded-lg border border-surface-200 bg-white cursor-pointer p-1"
                  aria-label="Pick accent colour"
                />
                <div>
                  <p className="text-sm font-medium text-surface-800">{customAccent.toUpperCase()}</p>
                  <p className="section-subtext">
                    Sidebar, buttons, links and badges use this colour automatically. Text contrast is enforced.
                  </p>
                </div>
              </div>
              <p className="section-subtext text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                <strong>Tip:</strong> Choose a mid-to-dark colour for best contrast. Very light colours may produce low-contrast text in some areas.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Persistence note ─────────────────────────────────────────────────── */}
      <section className="card space-y-2" aria-labelledby="persistence-heading">
        <h2 id="persistence-heading" className="section-heading">Preference Storage</h2>
        <div className="section-subtext space-y-1">
          <p>Preferences are saved in your browser's <code className="bg-surface-100 px-1 py-0.5 rounded text-[11px]">localStorage</code> and never sent to any server:</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li><code className="bg-surface-100 px-1 rounded text-[11px]">ai-travel-theme</code> — active theme (light / dark / colourful)</li>
            <li><code className="bg-surface-100 px-1 rounded text-[11px]">ai-travel-palette</code> — active colourful palette</li>
            <li><code className="bg-surface-100 px-1 rounded text-[11px]">ai-travel-custom-accent</code> — custom hex colour (if used)</li>
          </ul>
          <p className="mt-2">When Phase 4 user accounts are added, these preferences will sync across devices via the backend profile API.</p>
        </div>
      </section>

      {/* ── Global Currency & Price Display ──────────────────────────────── */}
      <section className="card space-y-4" aria-labelledby="currency-heading" id="currency-preferences-section">
        <div className="flex items-center justify-between pb-3 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 id="currency-heading" className="section-heading flex items-center gap-2">
              <Coins size={18} className="text-accent-600" />
              Global Currency & Price Display
            </h2>
            <p className="section-subtext">
              Set your preferred currency for automatic inline price conversions across trips, itineraries, budgets, and expenses.
            </p>
          </div>
          <Link
            to="/profile?tab=preferences"
            className="text-xs font-medium text-accent-600 hover:underline"
          >
            Manage in Profile →
          </Link>
        </div>

        <div className="space-y-4">
          {/* Preferred Currency Select */}
          <div className="space-y-1.5">
            <label htmlFor="settings-preferred-currency" className="label font-medium text-xs">
              Preferred Currency
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                id="settings-preferred-currency"
                value={preferredCurrency}
                onChange={e => setPreferredCurrency(e.target.value)}
                className="input max-w-xs text-sm font-semibold cursor-pointer"
              >
                <optgroup label="Popular Currencies">
                  {POPULAR_CURRENCIES.map(code => {
                    const item = SUPPORTED_CURRENCIES.find(c => c.code === code)
                    return (
                      <option key={`pop-${code}`} value={code}>
                        {code} — {item?.name || code} ({item?.symbol || code})
                      </option>
                    )
                  })}
                </optgroup>
                <optgroup label="All Supported Currencies">
                  {SUPPORTED_CURRENCIES.filter(c => !POPULAR_CURRENCIES.includes(c.code)).map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name} ({c.symbol})
                    </option>
                  ))}
                </optgroup>
              </select>

              <span className="text-xs text-surface-400">
                Default: <strong>INR (₹)</strong>
              </span>
            </div>
          </div>

          {/* Inline Equivalent Toggle */}
          <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="settings-toggle-converted-prices"
                checked={showConvertedPrices}
                onChange={e => setShowConvertedPrices(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-semibold text-surface-900 dark:text-slate-100 block">
                  Show equivalent prices in my preferred currency
                </span>
                <span className="text-[11px] text-surface-500 dark:text-slate-400 leading-normal block mt-0.5">
                  When viewing items priced in foreign currencies (e.g. €120), displays the converted amount (≈ ₹12,750 INR) underneath. Enabled by default.
                </span>
              </div>
            </label>
          </div>

          {/* Interactive Live Preview */}
          <div className="p-3 rounded-xl border border-surface-100 dark:border-surface-700/80 bg-white dark:bg-slate-900/40 text-xs flex items-center justify-between gap-4">
            <span className="text-surface-500 dark:text-slate-400">Live Preview:</span>
            <div className="text-right">
              <CurrencyAmount
                amount={120}
                currency="EUR"
                isMinor={false}
                className="font-bold text-sm text-surface-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
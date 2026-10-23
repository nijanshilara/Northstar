import { useState } from 'react'
import {
  Wind, Droplets, Sun, Sunrise, Sunset, AlertCircle, AlertTriangle,
  CloudRain, Info, Clock, Thermometer, MapPin, RefreshCw,
} from 'lucide-react'
import DestinationInput, { type DestinationSuggestion } from '../components/DestinationInput'
import { API_BASE } from '../services/api'
import {
  formatDestinationTime,
  formatDestinationHour,
  formatDestinationDate,
  isDestinationToday,
  getUvInfo,
} from '../utils/weatherUtils'

interface CurrentWeather {
  time?: string
  temperature_c: number | null
  apparent_temp_c: number | null
  humidity_pct: number | null
  precipitation_mm: number | null
  wind_kmh: number | null
  is_day: boolean
  weather_code: number
  condition: string
  emoji: string
}

interface HourlyForecast {
  time: string
  temp_c: number | null
  precipitation_probability: number | null
  weather_code: number
  condition: string
  emoji: string
}

interface DayForecast {
  date: string
  temp_max_c: number | null
  temp_min_c: number | null
  precipitation_mm: number | null
  precipitation_probability_max?: number | null
  wind_kmh: number | null
  uv_index: number | null
  condition: string
  emoji: string
  sunrise: string | null
  sunset: string | null
}

interface ForecastData {
  error: string | null
  city_name: string
  admin1?: string
  country: string
  lat?: number
  lon?: number
  timezone?: string
  current?: CurrentWeather
  hourly?: HourlyForecast[]
  days: DayForecast[]
  fetched_at?: string
  cached?: boolean
  is_stale?: boolean
  warning?: string | null
  source?: string
  data_type?: string
  disclaimer?: string
}

const POPULAR_DESTINATIONS = [
  'Goa', 'Mumbai', 'New Delhi', 'Tokyo', 'Paris', 'London', 'Bali', 'New York', 'Dubai', 'Singapore',
]

export default function Weather() {
  const [city, setCity] = useState('')
  const [selectedCoords, setSelectedCoords] = useState<{ lat?: number; lon?: number; name?: string } | null>(null)
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWeather = async (targetCity?: string, lat?: number, lon?: number) => {
    const q = (targetCity ?? city).trim()
    if (!q && (lat === undefined || lon === undefined)) return

    setLoading(true)
    setError(null)

    try {
      let url = `${API_BASE}/weather?`
      const params = new URLSearchParams()
      if (lat !== undefined && lon !== undefined) {
        params.set('lat', lat.toString())
        params.set('lon', lon.toString())
        if (q) params.set('city', q)
      } else {
        params.set('city', q)
      }
      url += params.toString()

      const res = await fetch(url)
      if (!res.ok) throw new Error(`Weather service error (${res.status})`)
      const data: ForecastData = await res.json()
      if (data.error) {
        setError(data.error)
        setForecast(null)
      } else {
        setForecast(data)
        if (q) setCity(q)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch weather forecast'
      if (forecast) {
        // Fallback: keep previous forecast visible but clearly marked as stale
        setForecast(prev => prev ? ({
          ...prev,
          is_stale: true,
          cached: true,
          warning: `Live refresh failed (${msg}). Displaying previously loaded forecast.`,
        }) : null)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSuggestion = (s: DestinationSuggestion) => {
    const label = s.name
    setCity(label)
    setSelectedCoords({ lat: s.latitude, lon: s.longitude, name: s.name })
    fetchWeather(s.name, s.latitude, s.longitude)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedCoords && selectedCoords.name?.toLowerCase() === city.trim().toLowerCase()) {
      fetchWeather(city, selectedCoords.lat, selectedCoords.lon)
    } else {
      fetchWeather(city)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-slate-100 flex items-center gap-2">
          🌤️ Live Destination Weather
        </h1>
        <p className="mt-1 text-sm text-surface-600 dark:text-slate-400">
          Current conditions, 24-hour trends and 7-day numerical forecast powered by{' '}
          <a
            href="https://open-meteo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-accent-600 dark:text-accent-400 hover:opacity-80"
          >
            Open-Meteo
          </a>
          . Uses precise destination coordinates and destination local timezones.
        </p>
      </div>

      {/* Search Input with Autocomplete */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 relative z-30"
        style={{ maxWidth: 540 }}
      >
        <div className="flex-1 relative">
          <DestinationInput
            value={city}
            onChange={val => {
              setCity(val)
              setSelectedCoords(null)
            }}
            onSelect={handleSelectSuggestion}
            placeholder="Search worldwide city, town, or region…"
            className="w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm input bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 text-surface-900 dark:text-slate-100"
          />
        </div>

        <button
          type="submit"
          id="weather-search-btn"
          disabled={loading || !city.trim()}
          className="btn-primary py-2.5 px-5 text-sm font-semibold flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Fetching…</span>
            </>
          ) : (
            <span>Search</span>
          )}
        </button>
      </form>

      {/* Quick pick popular destinations */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-surface-500 dark:text-slate-400 mr-1">Popular:</span>
        {POPULAR_DESTINATIONS.map(d => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setCity(d)
              setSelectedCoords(null)
              fetchWeather(d)
            }}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 text-surface-700 dark:text-slate-300 hover:border-accent-400 hover:text-accent-600 dark:hover:text-accent-400 shadow-2xs"
          >
            {d}
          </button>
        ))}
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-start justify-between gap-3 p-4 rounded-xl border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 animate-fade-in" id="weather-error">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Weather Lookup Issue</p>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchWeather()}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 hover:bg-red-200 transition-colors flex items-center gap-1 flex-shrink-0"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Stale Data / Advisory Banner */}
      {forecast && (forecast.is_stale || forecast.warning) && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 animate-fade-in">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold">Notice: Cached Forecast Displayed</p>
            <p className="text-amber-700 dark:text-amber-300">
              {forecast.warning || 'Live weather update could not be completed; showing cached forecast data.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading Skeleton during fetch */}
      {loading && !forecast && (
        <div className="p-8 rounded-2xl border bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 text-center animate-pulse space-y-3">
          <RefreshCw size={24} className="animate-spin mx-auto text-accent-600" />
          <p className="text-sm font-semibold text-surface-700 dark:text-slate-300">Fetching live weather from Open-Meteo…</p>
          <p className="text-xs text-surface-500 dark:text-slate-400">Resolving worldwide coordinates and destination forecast.</p>
        </div>
      )}

      {/* Weather Content */}
      {forecast && !error && (
        <div className="space-y-5 animate-fade-in">
          {/* Current Weather Hero Card */}
          <div
            className="p-5 rounded-2xl border bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 shadow-sm space-y-4"
            id="weather-current-card"
          >
            {/* Top row: City title + status badges */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-surface-900 dark:text-slate-100 flex items-center gap-2">
                  <MapPin size={20} className="text-accent-600" />
                  {forecast.city_name}
                  {forecast.admin1 ? `, ${forecast.admin1}` : ''}
                  {forecast.country ? ` · ${forecast.country}` : ''}
                </h2>
                <div className="flex items-center gap-3 text-xs text-surface-500 dark:text-slate-400 mt-1 flex-wrap">
                  {forecast.lat !== undefined && (
                    <span>
                      Coordinates: {forecast.lat.toFixed(3)}°N, {forecast.lon?.toFixed(3)}°E
                    </span>
                  )}
                  {forecast.timezone && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> Timezone: {forecast.timezone}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-1">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                  forecast.is_stale
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : forecast.cached
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {forecast.is_stale
                    ? '⚠️ STALE DATA (Live update failed)'
                    : forecast.cached
                      ? 'CACHED FORECAST (10m TTL)'
                      : 'LIVE CONDITIONS'}
                </span>
                <div className="flex items-center gap-2">
                  {forecast.fetched_at && (
                    <span className="text-[11px] text-surface-400 dark:text-slate-500">
                      Updated: {formatDestinationTime(forecast.fetched_at)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchWeather(forecast.city_name, forecast.lat, forecast.lon)}
                    title="Refresh live weather"
                    disabled={loading}
                    className="p-1 rounded text-surface-400 hover:text-accent-600 transition-colors"
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Current Conditions Section */}
            {forecast.current && (
              <div className="p-4 rounded-xl bg-surface-50 dark:bg-slate-900/60 border border-surface-200 dark:border-slate-700/80 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* Temp & condition */}
                <div className="md:col-span-2 flex items-center gap-4">
                  <span className="text-5xl">{forecast.current.emoji}</span>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold text-surface-900 dark:text-slate-100">
                        {forecast.current.temperature_c !== null ? `${Math.round(forecast.current.temperature_c)}°C` : '—'}
                      </span>
                      {forecast.current.apparent_temp_c !== null && (
                        <span className="text-xs text-surface-500 dark:text-slate-400 font-medium">
                          Feels like {Math.round(forecast.current.apparent_temp_c)}°C
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-accent-700 dark:text-accent-300 mt-0.5">
                      {forecast.current.condition}
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 md:col-span-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-surface-200 dark:border-slate-700">
                    <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
                      <Droplets size={12} className="text-sky-500" /> Humidity
                    </span>
                    <p className="text-sm font-bold text-surface-800 dark:text-slate-200 mt-0.5">
                      {forecast.current.humidity_pct !== null ? `${forecast.current.humidity_pct}%` : '—'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-surface-200 dark:border-slate-700">
                    <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
                      <Wind size={12} className="text-teal-500" /> Wind Speed
                    </span>
                    <p className="text-sm font-bold text-surface-800 dark:text-slate-200 mt-0.5">
                      {forecast.current.wind_kmh !== null ? `${Math.round(forecast.current.wind_kmh)} km/h` : '—'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-surface-200 dark:border-slate-700">
                    <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
                      <CloudRain size={12} className="text-blue-500" /> Precipitation
                    </span>
                    <p className="text-sm font-bold text-surface-800 dark:text-slate-200 mt-0.5">
                      {forecast.current.precipitation_mm !== null ? `${forecast.current.precipitation_mm} mm` : '0 mm'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-surface-200 dark:border-slate-700">
                    <span className="text-surface-500 dark:text-slate-400 flex items-center gap-1">
                      <Thermometer size={12} className="text-amber-500" /> Time of Day
                    </span>
                    <p className="text-sm font-bold text-surface-800 dark:text-slate-200 mt-0.5">
                      {forecast.current.is_day ? 'Daylight ☀️' : 'Night 🌙'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 24-Hour Trend */}
          {forecast.hourly && forecast.hourly.length > 0 && (
            <div className="p-4 rounded-xl border bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-surface-700 dark:text-slate-300">
                  24-Hour Hourly Forecast
                </h3>
                <span className="text-[11px] text-surface-400">Destination Local Time</span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                {forecast.hourly.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center justify-between p-2.5 rounded-lg bg-surface-50 dark:bg-slate-900/40 border border-surface-200 dark:border-slate-700/80 min-w-[72px] text-center flex-shrink-0"
                  >
                    <span className="text-[11px] font-medium text-surface-500 dark:text-slate-400">
                      {formatDestinationHour(h.time)}
                    </span>
                    <span className="text-xl my-1">{h.emoji}</span>
                    <span className="text-xs font-bold text-surface-900 dark:text-slate-100">
                      {h.temp_c !== null ? `${Math.round(h.temp_c)}°` : '—'}
                    </span>
                    {h.precipitation_probability !== null && h.precipitation_probability > 0 ? (
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                        {h.precipitation_probability}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-surface-400 mt-0.5">0%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7-Day Forecast Section Header */}
          <div className="pt-2">
            <h3 className="text-base font-bold text-surface-900 dark:text-slate-100">
              7-Day Daily Forecast
            </h3>
            <p className="text-xs text-surface-500 dark:text-slate-400 mt-0.5">
              Numerical model outlook for highs, lows, rain likelihood, and UV exposure.
            </p>
          </div>

          {/* 7-day grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {forecast.days.map((day, i) => {
              const uv = getUvInfo(day.uv_index)
              const isToday = isDestinationToday(day.date, forecast.current?.time) || (i === 0 && !forecast.current?.time)

              return (
                <div
                  key={day.date}
                  className={`p-4 rounded-xl border flex flex-col gap-2.5 transition-shadow hover:shadow-md bg-white dark:bg-slate-800 ${
                    isToday
                      ? 'border-accent-500 ring-1 ring-accent-400/50'
                      : 'border-surface-200 dark:border-slate-700'
                  }`}
                >
                  {/* Date + today badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-700 dark:text-slate-300">
                      {isToday ? 'Today' : formatDestinationDate(day.date)}
                    </span>
                    {isToday && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-accent-600 text-white">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Emoji + condition */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl">{day.emoji}</span>
                    <span className="text-sm font-semibold text-surface-900 dark:text-slate-100">
                      {day.condition}
                    </span>
                  </div>

                  {/* High / Low Temp */}
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-surface-900 dark:text-slate-100">
                      {day.temp_max_c !== null ? `${Math.round(day.temp_max_c)}°` : '—'}
                    </span>
                    <span className="text-xs mb-1 text-surface-500 dark:text-slate-400">
                      / {day.temp_min_c !== null ? `${Math.round(day.temp_min_c)}°C` : '—'}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-surface-600 dark:text-slate-400 pt-1 border-t border-surface-100 dark:border-slate-700/60">
                    {day.precipitation_mm !== null && (
                      <span className="flex items-center gap-1 truncate">
                        <CloudRain size={11} className="text-blue-500" />
                        {day.precipitation_mm.toFixed(1)} mm
                      </span>
                    )}
                    {day.wind_kmh !== null && (
                      <span className="flex items-center gap-1 truncate">
                        <Wind size={11} className="text-teal-500" />
                        {Math.round(day.wind_kmh)} km/h
                      </span>
                    )}
                    {uv && (
                      <span className="flex items-center gap-1 truncate">
                        <Sun size={11} className="text-amber-500" />
                        UV <span style={{ color: uv.color, fontWeight: 700 }}>{uv.label}</span>
                      </span>
                    )}
                    {day.precipitation_probability_max !== null && day.precipitation_probability_max !== undefined && (
                      <span className="flex items-center gap-1 truncate font-medium text-blue-600 dark:text-blue-400">
                        <Droplets size={11} />
                        {day.precipitation_probability_max}% rain
                      </span>
                    )}
                  </div>

                  {/* Sunrise / sunset */}
                  {(day.sunrise || day.sunset) && (
                    <div className="flex gap-3 text-[11px] border-t border-surface-100 dark:border-slate-700/60 pt-2 text-surface-500 dark:text-slate-400">
                      {day.sunrise && (
                        <span className="flex items-center gap-1">
                          <Sunrise size={11} className="text-amber-500" />
                          {formatDestinationTime(day.sunrise)}
                        </span>
                      )}
                      {day.sunset && (
                        <span className="flex items-center gap-1">
                          <Sunset size={11} className="text-indigo-400" />
                          {formatDestinationTime(day.sunset)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Disclaimer & Source Footer */}
          {forecast.disclaimer && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-surface-50 dark:bg-slate-900/60 border border-surface-200 dark:border-slate-700 text-xs text-surface-600 dark:text-slate-400">
              <Info size={14} className="flex-shrink-0 mt-0.5 text-accent-500" />
              <span>{forecast.disclaimer}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!forecast && !loading && !error && (
        <div className="flex flex-col items-center justify-center text-center p-14 rounded-2xl border-2 border-dashed border-surface-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/40">
          <span className="text-5xl mb-3">🌍</span>
          <p className="font-semibold text-base text-surface-900 dark:text-slate-100">
            Search for any destination worldwide
          </p>
          <p className="text-sm mt-1 text-surface-500 dark:text-slate-400 max-w-sm">
            Enter any city, town, village or region to view live conditions, 24-hour trends, and a 7-day forecast.
          </p>
        </div>
      )}
    </div>
  )
}
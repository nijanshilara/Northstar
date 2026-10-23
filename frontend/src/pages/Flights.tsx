import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Info,
  Minus,
  Plane,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import DestinationInput from '../components/DestinationInput'
import {
  type CabinClass,
  type FlightSearchParams,
  type PassengerCounts,
  type TripType,
  FLIGHT_PROVIDERS,
  buildFlightSearchUrl,
  getLocalDateString,
  validateFlightSearch,
} from '../utils/flightSearch'

export default function Flights() {
  const [tripType, setTripType] = useState<TripType>('one-way')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [passengers, setPassengers] = useState<PassengerCounts>({
    adults: 1,
    children: 0,
    infants: 0,
  })
  const [cabin, setCabin] = useState<CabinClass>('economy')
  const [showPaxDropdown, setShowPaxDropdown] = useState(false)
  const paxRef = useRef<HTMLDivElement>(null)

  // Local calendar date for min date attribute (immune to UTC timezone conversions)
  const todayStr = useMemo(() => getLocalDateString(), [])

  // Close passenger dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (paxRef.current && !paxRef.current.contains(event.target as Node)) {
        setShowPaxDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Swap origin and destination
  const handleSwap = () => {
    const temp = origin
    setOrigin(dest)
    setDest(temp)
  }

  // Passenger counter helpers
  const totalPassengers = passengers.adults + passengers.children + passengers.infants

  const updateAdults = (delta: number) => {
    setPassengers(prev => {
      const nextAdults = Math.max(1, Math.min(9, prev.adults + delta))
      if (nextAdults + prev.children + prev.infants > 9) return prev
      // If adults decrease below infants count, clamp infants
      const nextInfants = Math.min(prev.infants, nextAdults)
      return { ...prev, adults: nextAdults, infants: nextInfants }
    })
  }

  const updateChildren = (delta: number) => {
    setPassengers(prev => {
      const nextChildren = Math.max(0, Math.min(8, prev.children + delta))
      if (prev.adults + nextChildren + prev.infants > 9) return prev
      return { ...prev, children: nextChildren }
    })
  }

  const updateInfants = (delta: number) => {
    setPassengers(prev => {
      // Infants cannot exceed adults (1 infant per adult lap)
      const nextInfants = Math.max(0, Math.min(prev.adults, Math.min(4, prev.infants + delta)))
      if (prev.adults + prev.children + nextInfants > 9) return prev
      return { ...prev, infants: nextInfants }
    })
  }

  // Master search parameters
  const searchParams: FlightSearchParams = useMemo(
    () => ({
      origin,
      dest,
      tripType,
      departureDate,
      returnDate,
      passengers,
      cabin,
    }),
    [origin, dest, tripType, departureDate, returnDate, passengers, cabin]
  )

  // Validation
  const validation = useMemo(
    () => validateFlightSearch(searchParams, todayStr),
    [searchParams, todayStr]
  )

  const isSearchReady = validation.isValid

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-surface-900 dark:text-slate-100">
          <Plane size={24} className="text-accent-600 dark:text-teal-400" />
          Flight Search & Route Planner
        </h1>
        <p className="mt-1 text-sm text-surface-600 dark:text-slate-300">
          Search real-time flight routes and compare live prices across trusted airlines and aggregators. Your exact chosen dates, passenger counts and cabin classes are preserved in every search redirect.
        </p>
      </div>

      {/* Honest Search Disclosure Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/60 text-sm">
        <Info size={18} className="flex-shrink-0 mt-0.5 text-accent-600 dark:text-teal-400" />
        <div className="text-surface-700 dark:text-slate-200 leading-relaxed">
          <strong className="text-surface-900 dark:text-slate-100">Direct Live Search:</strong> When you click any provider below, we open their search pre-filled with your exact dates, route, passenger count, and cabin class. We do not fabricate mock fares or simulated booking confirmations.
        </div>
      </div>

      {/* Flight Search Form */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 dark:border-surface-700 pb-3">
          {/* Trip Type Toggle (One-Way vs Round-Trip) */}
          <div className="flex items-center gap-1 bg-surface-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setTripType('one-way')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tripType === 'one-way'
                  ? 'bg-white dark:bg-slate-700 text-surface-900 dark:text-slate-100 shadow-sm font-semibold'
                  : 'text-surface-600 dark:text-slate-400 hover:text-surface-900'
              }`}
            >
              One Way
            </button>
            <button
              type="button"
              onClick={() => {
                setTripType('round-trip')
                // If user toggles to round-trip and returnDate is empty or before departure, suggest a default
                if (!returnDate && departureDate) {
                  setReturnDate(departureDate)
                }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tripType === 'round-trip'
                  ? 'bg-white dark:bg-slate-700 text-surface-900 dark:text-slate-100 shadow-sm font-semibold'
                  : 'text-surface-600 dark:text-slate-400 hover:text-surface-900'
              }`}
            >
              Round Trip
            </button>
          </div>

          {/* Passenger & Cabin Class Selector */}
          <div className="flex items-center gap-3 text-xs">
            {/* Travellers Popover */}
            <div className="relative" ref={paxRef}>
              <button
                type="button"
                onClick={() => setShowPaxDropdown(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-800 text-surface-800 dark:text-slate-200 text-xs font-medium hover:border-accent-500 transition-colors"
                aria-expanded={showPaxDropdown}
                aria-label="Select travellers"
              >
                <Users size={14} className="text-surface-500" />
                <span>
                  {totalPassengers} {totalPassengers === 1 ? 'Traveller' : 'Travellers'}
                </span>
                {passengers.children > 0 || passengers.infants > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent-100 dark:bg-teal-900/50 text-accent-700 dark:text-teal-300 font-semibold">
                    {passengers.adults}A {passengers.children > 0 && `· ${passengers.children}C`} {passengers.infants > 0 && `· ${passengers.infants}I`}
                  </span>
                ) : null}
              </button>

              {showPaxDropdown && (
                <div className="absolute right-0 top-full mt-2 w-72 p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-900 shadow-xl z-50 space-y-3.5 text-xs">
                  <div className="flex items-center justify-between border-b border-surface-100 dark:border-surface-800 pb-2">
                    <span className="font-semibold text-surface-900 dark:text-slate-100">Select Travellers</span>
                    <span className="text-[11px] text-surface-500 dark:text-slate-400">Max 9 travellers</span>
                  </div>

                  {/* Adults */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-surface-900 dark:text-slate-100">Adults</div>
                      <div className="text-[11px] text-surface-500 dark:text-slate-400">Age 12+ years</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateAdults(-1)}
                        disabled={passengers.adults <= 1}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-semibold text-surface-900 dark:text-slate-100">
                        {passengers.adults}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateAdults(1)}
                        disabled={totalPassengers >= 9 || passengers.adults >= 9}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Children */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-surface-900 dark:text-slate-100">Children</div>
                      <div className="text-[11px] text-surface-500 dark:text-slate-400">Age 2–11 years</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateChildren(-1)}
                        disabled={passengers.children <= 0}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-semibold text-surface-900 dark:text-slate-100">
                        {passengers.children}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateChildren(1)}
                        disabled={totalPassengers >= 9}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Infants */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-surface-900 dark:text-slate-100">Infants</div>
                      <div className="text-[11px] text-surface-500 dark:text-slate-400">Under 2 yrs (on lap)</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateInfants(-1)}
                        disabled={passengers.infants <= 0}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-semibold text-surface-900 dark:text-slate-100">
                        {passengers.infants}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateInfants(1)}
                        disabled={totalPassengers >= 9 || passengers.infants >= passengers.adults}
                        className="w-7 h-7 rounded-lg border border-surface-200 dark:border-surface-700 flex items-center justify-center hover:bg-surface-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-surface-100 dark:border-surface-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPaxDropdown(false)}
                      className="px-3 py-1.5 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cabin Class */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="cabin-select" className="text-surface-600 dark:text-slate-300 font-medium">Class:</label>
              <select
                id="cabin-select"
                value={cabin}
                onChange={e => setCabin(e.target.value as CabinClass)}
                className="px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-800 text-surface-800 dark:text-slate-200 text-xs font-medium"
              >
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium Economy</option>
                <option value="business">Business</option>
                <option value="first">First Class</option>
              </select>
            </div>
          </div>
        </div>

        {/* Inputs Grid with Swap Control */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-20">
          {/* Origin */}
          <div className="relative">
            <label className="block text-xs font-medium text-surface-700 dark:text-slate-300 mb-1">
              From (Origin City / Airport)
            </label>
            <DestinationInput
              className="w-full px-3 py-2 rounded-lg border text-sm"
              placeholder="e.g. Mumbai (BOM) or Delhi"
              value={origin}
              onChange={val => setOrigin(val)}
            />
          </div>

          {/* Destination + Swap Button */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-surface-700 dark:text-slate-300">
                To (Destination City / Airport)
              </label>
              <button
                type="button"
                onClick={handleSwap}
                disabled={!origin && !dest}
                title="Swap Origin and Destination"
                className="text-[11px] text-accent-600 dark:text-teal-400 hover:underline flex items-center gap-1 disabled:opacity-40"
              >
                <ArrowLeftRight size={11} />
                Swap
              </button>
            </div>
            <DestinationInput
              className="w-full px-3 py-2 rounded-lg border text-sm"
              placeholder="e.g. Goa (GOI) or Tokyo"
              value={dest}
              onChange={val => setDest(val)}
            />
          </div>

          {/* Departure Date */}
          <div>
            <label className="block text-xs font-medium text-surface-700 dark:text-slate-300 mb-1">
              Departure Date
            </label>
            <input
              type="date"
              min={todayStr}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-800 text-surface-900 dark:text-slate-100 text-sm"
              value={departureDate}
              onChange={e => {
                const newDep = e.target.value
                setDepartureDate(newDep)
                // If round-trip and return date is earlier than new departure, bump return date
                if (tripType === 'round-trip' && returnDate && returnDate < newDep) {
                  setReturnDate(newDep)
                }
              }}
            />
          </div>

          {/* Return Date */}
          <div>
            <label className="block text-xs font-medium text-surface-700 dark:text-slate-300 mb-1">
              Return Date {tripType === 'one-way' && <span className="text-surface-400 font-normal">(One-way selected)</span>}
            </label>
            <input
              type="date"
              disabled={tripType === 'one-way'}
              min={departureDate || todayStr}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-800 text-surface-900 dark:text-slate-100 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              value={tripType === 'one-way' ? '' : returnDate}
              onChange={e => setReturnDate(e.target.value)}
            />
          </div>
        </div>

        {/* Validation Warning Alert */}
        {validation.firstError && (origin || dest || departureDate || returnDate) && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{validation.firstError}</span>
          </div>
        )}

        {/* Active Search Summary Preview */}
        {isSearchReady && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-accent-50 dark:bg-teal-950/40 border border-accent-200 dark:border-teal-800 text-xs text-accent-800 dark:text-teal-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-accent-600 text-white">
                {tripType === 'one-way' ? 'One Way' : 'Round Trip'}
              </span>
              <span className="font-semibold text-surface-900 dark:text-slate-100">{origin}</span>
              <ArrowRight size={14} />
              <span className="font-semibold text-surface-900 dark:text-slate-100">{dest}</span>
              {departureDate && (
                <span className="flex items-center gap-1 text-surface-700 dark:text-slate-300 ml-1">
                  <Calendar size={13} /> Dep: <strong>{departureDate}</strong>
                </span>
              )}
              {tripType === 'round-trip' && returnDate && (
                <span className="flex items-center gap-1 text-surface-700 dark:text-slate-300 ml-1">
                  | Ret: <strong>{returnDate}</strong>
                </span>
              )}
            </div>
            <div className="text-surface-600 dark:text-slate-300">
              {totalPassengers} {totalPassengers === 1 ? 'traveller' : 'travellers'} · <span className="capitalize">{cabin.replace('_', ' ')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Provider Cards with Honest Parameter Pre-fills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FLIGHT_PROVIDERS.map(p => {
          const isAmadeus = p.name.includes('Amadeus')
          const searchUrl = isSearchReady
            ? buildFlightSearchUrl(p.name, searchParams)
            : p.url

          return (
            <div
              key={p.name}
              className="card flex flex-col justify-between gap-3 hover:shadow-md transition-shadow"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <h3 className="font-semibold text-sm text-surface-900 dark:text-slate-100">{p.name}</h3>
                      <span
                        className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-0.5"
                        style={{ background: `${p.badgeColor}22`, color: p.badgeColor }}
                      >
                        {p.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-surface-600 dark:text-slate-300 leading-relaxed">{p.description}</p>

                {/* Feature Capabilities and Honest Limitations */}
                <div className="space-y-1.5 pt-1 text-[11px] text-surface-500 dark:text-slate-400">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> Route
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> Dates
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> Passengers ({totalPassengers})
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> Class ({cabin.replace('_', ' ')})
                    </span>
                  </div>
                  <p className="text-[10px] italic text-surface-500 dark:text-slate-400">
                    ℹ️ {p.limitations}
                  </p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-surface-100 dark:border-surface-700 flex items-center justify-between gap-2">
                <span className="text-[11px] text-surface-500 dark:text-slate-400 truncate">
                  {isAmadeus
                    ? 'Developer API sandbox'
                    : isSearchReady
                    ? `Pre-filled with ${departureDate} ${tripType === 'round-trip' ? `to ${returnDate}` : '(one-way)'}`
                    : validation.firstError || 'Enter route & dates above to prefill'}
                </span>
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 flex-shrink-0 transition-all ${
                    isSearchReady && !isAmadeus
                      ? 'btn-primary shadow-sm hover:shadow'
                      : 'bg-surface-100 dark:bg-slate-800 text-surface-700 dark:text-slate-200 hover:bg-surface-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Search size={13} />
                  {isAmadeus
                    ? 'Developer Portal'
                    : isSearchReady
                    ? `Search ${origin.split(' ')[0]} → ${dest.split(' ')[0]}`
                    : 'Open Provider'}
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* Honest Travel Advisory */}
      <p className="text-xs text-surface-500 dark:text-slate-400 leading-relaxed">
        ⚠️ This platform provides direct navigation links with your selected search parameters. Always verify baggage policies, layovers, cancellation rules and final prices on the provider or airline website before completing any transaction.
      </p>
    </div>
  )
}
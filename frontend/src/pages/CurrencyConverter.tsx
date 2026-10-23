/**
 * CurrencyConverter.tsx — Northstar Currency Converter
 *
 * Dedicated travel currency exchange calculator powered by European Central Bank (ECB)
 * reference rates via the free Frankfurter API proxy.
 *
 * Features:
 *   - Amount input with validation (supports zero, positive numbers, and auto-formatting)
 *   - From and To currency dropdowns with popular indicators and currency full names
 *   - Swap currencies button with smooth rotation animation
 *   - Prominent converted amount display with formatted numbers
 *   - Direct and inverse exchange rates, plus official rate date
 *   - Trip integration: optional destination currency preselection without altering trip budget
 *   - Quick currency pair shortcuts (USD ➔ INR, EUR ➔ USD, GBP ➔ EUR, USD ➔ AED, etc.)
 *   - Quick amount presets (10, 50, 100, 500, 1000)
 *   - Popular currencies exchange rates matrix for quick reference
 *   - Transparent caching, offline indicators, and honest ECB attribution
 */

import { useState, useEffect, useCallback, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftRight, RefreshCw, AlertCircle, Info, Check, Copy,
  Calendar, ShieldAlert, Sparkles, Plane, TrendingUp, ExternalLink,
} from 'lucide-react'
import { convertCurrency, getCurrencies, getRates, listTrips, getErrorMessage } from '../services/api'
import type { CurrencyConversionResult, Trip } from '../types'

// Default fallback currency list if network is initially delayed
const DEFAULT_CURRENCY_MAP: Record<string, string> = {
  USD: 'United States Dollar',
  INR: 'Indian Rupee',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  AED: 'UAE Dirham (Official USD Peg)',
  SGD: 'Singapore Dollar',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Renminbi',
  HKD: 'Hong Kong Dollar',
  NZD: 'New Zealand Dollar',
  KRW: 'South Korean Won',
  THB: 'Thai Baht',
  MYR: 'Malaysian Ringgit',
  IDR: 'Indonesian Rupiah',
  PHP: 'Philippine Peso',
  BRL: 'Brazilian Real',
  MXN: 'Mexican Peso',
  ZAR: 'South African Rand',
  TRY: 'Turkish Lira',
  SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone',
  DKK: 'Danish Krone',
  PLN: 'Polish Zloty',
  CZK: 'Czech Koruna',
  HUF: 'Hungarian Forint',
  RON: 'Romanian Leu',
  ILS: 'Israeli Shekel',
  ISK: 'Icelandic Króna',
}

const POPULAR_CODES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'AUD', 'CAD', 'CHF']

const POPULAR_PAIRS = [
  { from: 'USD', to: 'INR', label: 'USD ➔ INR' },
  { from: 'EUR', to: 'USD', label: 'EUR ➔ USD' },
  { from: 'GBP', to: 'EUR', label: 'GBP ➔ EUR' },
  { from: 'USD', to: 'AED', label: 'USD ➔ AED' },
  { from: 'USD', to: 'JPY', label: 'USD ➔ JPY' },
  { from: 'AUD', to: 'USD', label: 'AUD ➔ USD' },
]

const AMOUNT_PRESETS = [10, 50, 100, 500, 1000]

export default function CurrencyConverter() {
  const fromSelectId = useId()
  const toSelectId = useId()
  const [currencies, setCurrencies] = useState<Record<string, string>>(DEFAULT_CURRENCY_MAP)
  const [popularList, setPopularList] = useState<string[]>(POPULAR_CODES)
  const [amount, setAmount] = useState<string>('100')
  const [fromCurrency, setFromCurrency] = useState<string>('USD')
  const [toCurrency, setToCurrency] = useState<string>('INR')

  // Conversion result & UI states
  const [result, setResult] = useState<CurrencyConversionResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)
  const [isSwapping, setIsSwapping] = useState<boolean>(false)

  // Trip integration state
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string>('')
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)

  // Quick comparison rates table state
  const [baseRates, setBaseRates] = useState<Record<string, number>>({})
  const [ratesDate, setRatesDate] = useState<string>('')
  const [loadingRates, setLoadingRates] = useState<boolean>(false)

  // 1. Load currencies catalog & user's trips
  useEffect(() => {
    let isMounted = true

    getCurrencies()
      .then(res => {
        if (!isMounted) return
        if (res.data?.currencies) {
          setCurrencies(res.data.currencies)
        }
        if (res.data?.popular) {
          setPopularList(res.data.popular)
        }
      })
      .catch(err => {
        console.warn('Could not load dynamic currencies list:', err)
      })

    listTrips()
      .then(res => {
        if (!isMounted) return
        if (Array.isArray(res.data)) {
          setTrips(res.data)
        }
      })
      .catch(err => {
        console.warn('Could not load trips for currency preselection:', err)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // 2. Conversion trigger function
  const executeConversion = useCallback(
    async (fromCode: string, toCode: string, amtVal: string) => {
      const parsedAmount = parseFloat(amtVal)
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        setError('Please enter a valid non-negative amount.')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await convertCurrency(fromCode, toCode, parsedAmount)
        setResult(res.data)
      } catch (err: unknown) {
        const msg = getErrorMessage(err)
        setError(msg || 'Failed to fetch exchange rate. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // 3. Load base currency rates for matrix table
  const fetchBaseRates = useCallback(async (baseCode: string) => {
    setLoadingRates(true)
    try {
      const res = await getRates(baseCode)
      if (res.data?.rates) {
        setBaseRates(res.data.rates)
        setRatesDate(res.data.date)
      }
    } catch {
      // Quiet fallback for table
    } finally {
      setLoadingRates(false)
    }
  }, [])

  // Initial conversion on mount
  useEffect(() => {
    executeConversion(fromCurrency, toCurrency, amount)
    fetchBaseRates(fromCurrency)
  }, [executeConversion, fetchBaseRates, fromCurrency, toCurrency, amount])

  // Handle convert button click or form submit
  const handleConvert = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    executeConversion(fromCurrency, toCurrency, amount)
    fetchBaseRates(fromCurrency)
  }

  // Handle Swap Currencies
  const handleSwap = () => {
    setIsSwapping(true)
    const nextFrom = toCurrency
    const nextTo = fromCurrency
    setFromCurrency(nextFrom)
    setToCurrency(nextTo)
    executeConversion(nextFrom, nextTo, amount)
    fetchBaseRates(nextFrom)
    setTimeout(() => setIsSwapping(false), 350)
  }

  // Handle Trip Selection
  const handleTripSelect = (tripIdStr: string) => {
    setSelectedTripId(tripIdStr)
    if (!tripIdStr) {
      setSelectedTrip(null)
      return
    }

    const found = trips.find(t => t.id === Number(tripIdStr))
    if (found) {
      setSelectedTrip(found)
      const tripCurr = (found.currency || 'USD').toUpperCase().trim()
      // Preselect destination currency as target 'toCurrency'
      if (tripCurr !== fromCurrency) {
        setToCurrency(tripCurr)
        executeConversion(fromCurrency, tripCurr, amount)
      } else {
        // If from is already the trip currency, set target to USD or EUR
        const alt = tripCurr === 'USD' ? 'EUR' : 'USD'
        setToCurrency(alt)
        executeConversion(fromCurrency, alt, amount)
      }
    }
  }

  // Handle Copy to Clipboard
  const handleCopy = () => {
    if (!result) return
    const textToCopy = `${result.amount.toLocaleString()} ${result.from} = ${result.converted_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${result.to}`
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatNumber = (num: number, maxDecimals: number = 4) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals,
    })
  }

  // Sorted list of currency codes (popular first, then alphabetical)
  const currencyCodes = Object.keys(currencies).sort((a, b) => {
    const aPop = popularList.includes(a)
    const bPop = popularList.includes(b)
    if (aPop && !bPop) return -1
    if (!aPop && bPop) return 1
    return a.localeCompare(b)
  })

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-slate-100 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400">
              <ArrowLeftRight size={22} />
            </span>
            Currency Converter
          </h1>
          <p className="mt-1 text-sm text-surface-600 dark:text-slate-400">
            Official European Central Bank (ECB) reference exchange rates for seamless international travel budgeting.
          </p>
        </div>

        {/* Free API Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Free ECB Reference Rates
          </span>
        </div>
      </div>

      {/* Main Converter Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-surface-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm">
        {/* Optional Trip Selector Integration */}
        {trips.length > 0 && (
          <div className="mb-6 p-3.5 rounded-xl bg-surface-50 dark:bg-slate-850/60 border border-surface-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-surface-700 dark:text-slate-300">
              <Plane size={15} className="text-accent-500 flex-shrink-0" />
              <span>
                <strong>Trip Integration:</strong> Pre-select destination currency from your trips (read-only; does not alter saved trip budgets).
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                id="trip-currency-select"
                value={selectedTripId}
                onChange={e => handleTripSelect(e.target.value)}
                className="input py-1.5 px-3 text-xs bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700 rounded-lg text-surface-800 dark:text-slate-200 flex-1 sm:flex-none cursor-pointer"
              >
                <option value="">Select a trip…</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.destination} — {t.currency || 'USD'})
                  </option>
                ))}
              </select>
              {selectedTrip && (
                <button
                  type="button"
                  onClick={() => handleTripSelect('')}
                  className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-slate-300 px-2 py-1"
                  title="Clear trip selection"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Selected Trip Active Note */}
        {selectedTrip && (
          <div className="mb-6 px-3.5 py-2 rounded-lg bg-accent-500/10 border border-accent-500/20 text-xs text-accent-700 dark:text-accent-300 flex items-center gap-2">
            <Sparkles size={14} className="flex-shrink-0" />
            <span>
              Preselected <strong>{selectedTrip.currency}</strong> for trip to <strong>{selectedTrip.destination}</strong> ({selectedTrip.name}). Your trip budget is protected and isolated.
            </span>
          </div>
        )}

        <form onSubmit={handleConvert} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Amount Input */}
            <div className="md:col-span-4 space-y-1.5">
              <label htmlFor="currency-amount-input" className="block text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-slate-400">
                Amount
              </label>
              <div className="relative">
                <input
                  id="currency-amount-input"
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="100"
                  className="w-full px-4 py-3 rounded-xl border text-lg font-semibold input bg-surface-50/50 dark:bg-slate-900/60 border-surface-200 dark:border-slate-700 text-surface-900 dark:text-slate-100 focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>

            {/* From Currency */}
            <div className="md:col-span-3 space-y-1.5">
              <label htmlFor={fromSelectId} className="block text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-slate-400">
                From Currency
              </label>
              <select
                id={fromSelectId}
                value={fromCurrency}
                onChange={e => {
                  setFromCurrency(e.target.value)
                  executeConversion(e.target.value, toCurrency, amount)
                  fetchBaseRates(e.target.value)
                }}
                className="w-full px-3 py-3 rounded-xl border text-sm font-semibold input bg-surface-50/50 dark:bg-slate-900/60 border-surface-200 dark:border-slate-700 text-surface-900 dark:text-slate-100 cursor-pointer"
              >
                {currencyCodes.map(code => (
                  <option key={`from-${code}`} value={code}>
                    {code} — {currencies[code] || code}
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="md:col-span-2 flex items-center justify-center pb-1">
              <motion.button
                type="button"
                id="currency-swap-btn"
                onClick={handleSwap}
                animate={{ rotate: isSwapping ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                title="Swap currencies"
                className="p-3 rounded-xl border border-surface-200 dark:border-slate-700 bg-surface-100 dark:bg-slate-750 text-surface-700 dark:text-slate-200 hover:bg-accent-50 dark:hover:bg-slate-700 hover:text-accent-600 dark:hover:text-accent-400 hover:border-accent-300 transition-colors shadow-2xs"
              >
                <ArrowLeftRight size={18} />
              </motion.button>
            </div>

            {/* To Currency */}
            <div className="md:col-span-3 space-y-1.5">
              <label htmlFor={toSelectId} className="block text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-slate-400">
                To Currency
              </label>
              <select
                id={toSelectId}
                value={toCurrency}
                onChange={e => {
                  setToCurrency(e.target.value)
                  executeConversion(fromCurrency, e.target.value, amount)
                }}
                className="w-full px-3 py-3 rounded-xl border text-sm font-semibold input bg-surface-50/50 dark:bg-slate-900/60 border-surface-200 dark:border-slate-700 text-surface-900 dark:text-slate-100 cursor-pointer"
              >
                {currencyCodes.map(code => (
                  <option key={`to-${code}`} value={code}>
                    {code} — {currencies[code] || code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Amount Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-surface-500 dark:text-slate-400 font-medium mr-1">Quick Amounts:</span>
            {AMOUNT_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  const s = preset.toString()
                  setAmount(s)
                  executeConversion(fromCurrency, toCurrency, s)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  amount === preset.toString()
                    ? 'bg-accent-500 text-white border-accent-600'
                    : 'bg-surface-100 dark:bg-slate-750 border-surface-200 dark:border-slate-700 text-surface-700 dark:text-slate-300 hover:border-accent-400'
                }`}
              >
                {preset.toLocaleString()} {fromCurrency}
              </button>
            ))}

            <div className="ml-auto">
              <button
                type="submit"
                id="currency-convert-btn"
                disabled={loading}
                className="btn-primary py-2 px-5 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                {loading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Convert</span>
              </button>
            </div>
          </div>
        </form>

        {/* Error State */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Conversion Error</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Prominent Result Display */}
        <AnimatePresence mode="wait">
          {result && !error && (
            <motion.div
              key={`${result.from}-${result.to}-${result.converted_amount}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-8 pt-6 border-t border-surface-200 dark:border-slate-700"
            >
              <div className="bg-gradient-to-br from-surface-50 to-surface-100/70 dark:from-slate-900/60 dark:to-slate-850/80 rounded-2xl p-6 border border-surface-200 dark:border-slate-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-surface-500 dark:text-slate-400 uppercase tracking-wider">
                      {formatNumber(result.amount)} {result.from} ({currencies[result.from] || result.from}) =
                    </p>
                    <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                      <span className="text-3xl sm:text-4xl font-black text-surface-900 dark:text-slate-100 tracking-tight">
                        {formatNumber(result.converted_amount, 2)}
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-accent-600 dark:text-accent-400">
                        {result.to}
                      </span>
                      <span className="text-xs text-surface-500 dark:text-slate-400 font-medium">
                        ({currencies[result.to] || result.to})
                      </span>
                    </div>
                  </div>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="self-start md:self-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-surface-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-surface-700 dark:text-slate-300 hover:text-accent-600 dark:hover:text-accent-400 hover:border-accent-300 transition-colors shadow-2xs"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copied ? 'Copied!' : 'Copy Result'}</span>
                  </button>
                </div>

                {/* Exchange Rates & Date Meta */}
                <div className="mt-5 pt-4 border-t border-surface-200/60 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-surface-500 dark:text-slate-400 block font-medium">Exchange Rate:</span>
                    <span className="font-semibold text-surface-800 dark:text-slate-200">
                      1 {result.from} = {formatNumber(result.rate, 6)} {result.to}
                    </span>
                  </div>

                  <div>
                    <span className="text-surface-500 dark:text-slate-400 block font-medium">Inverse Rate:</span>
                    <span className="font-semibold text-surface-800 dark:text-slate-200">
                      1 {result.to} = {formatNumber(result.inverse_rate, 6)} {result.from}
                    </span>
                  </div>

                  <div>
                    <span className="text-surface-500 dark:text-slate-400 block font-medium flex items-center gap-1">
                      <Calendar size={12} />
                      Reference Rate Date:
                    </span>
                    <span className="font-semibold text-surface-800 dark:text-slate-200">
                      {result.date}
                    </span>
                  </div>
                </div>

                {/* Special Notes (e.g. AED Peg or Stale Warning) */}
                {result.note && (
                  <div className="mt-4 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2">
                    <Info size={14} className="flex-shrink-0" />
                    <span>{result.note}</span>
                  </div>
                )}

                {result.warning && (
                  <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                    <ShieldAlert size={14} className="flex-shrink-0" />
                    <span>{result.warning}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Popular Travel Currency Pairs Quick Shortcuts */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-surface-200 dark:border-slate-700 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-surface-900 dark:text-slate-100 flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-accent-500" />
          Popular Travel Currency Pairs
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {POPULAR_PAIRS.map(pair => (
            <button
              key={pair.label}
              type="button"
              onClick={() => {
                setFromCurrency(pair.from)
                setToCurrency(pair.to)
                executeConversion(pair.from, pair.to, amount)
                fetchBaseRates(pair.from)
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                fromCurrency === pair.from && toCurrency === pair.to
                  ? 'bg-accent-500 text-white border-accent-600 shadow-sm'
                  : 'bg-surface-50 dark:bg-slate-900/50 border-surface-200 dark:border-slate-700 text-surface-700 dark:text-slate-300 hover:border-accent-400 hover:text-accent-600 dark:hover:text-accent-400'
              }`}
            >
              {pair.label}
            </button>
          ))}
        </div>
      </div>

      {/* Base Currency Reference Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-surface-200 dark:border-slate-700 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-bold text-surface-900 dark:text-slate-100">
              Exchange Rates for 1 {fromCurrency}
            </h2>
            <p className="text-xs text-surface-500 dark:text-slate-400">
              Comparing 1, 10, and 100 {fromCurrency} across top international currencies {ratesDate ? `(Date: ${ratesDate})` : ''}.
            </p>
          </div>
          {loadingRates && (
            <span className="text-xs text-surface-500 flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" /> Updating table…
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-surface-200 dark:border-slate-700 text-surface-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 pr-4 font-semibold">Currency</th>
                <th className="py-2.5 px-4 font-semibold text-right">1 {fromCurrency}</th>
                <th className="py-2.5 px-4 font-semibold text-right">10 {fromCurrency}</th>
                <th className="py-2.5 pl-4 font-semibold text-right">100 {fromCurrency}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-slate-750">
              {popularList
                .filter(code => code !== fromCurrency)
                .map(code => {
                  const rate = baseRates[code] || (code === fromCurrency ? 1.0 : null)
                  return (
                    <tr
                      key={code}
                      onClick={() => {
                        setToCurrency(code)
                        executeConversion(fromCurrency, code, amount)
                      }}
                      className="hover:bg-surface-50 dark:hover:bg-slate-750/50 cursor-pointer transition-colors"
                      title={`Click to set target to ${code}`}
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-bold text-surface-900 dark:text-slate-100">{code}</span>
                        <span className="text-surface-500 dark:text-slate-400 ml-2 hidden sm:inline">
                          {currencies[code]}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-surface-800 dark:text-slate-200">
                        {rate ? formatNumber(rate, 4) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-surface-800 dark:text-slate-200">
                        {rate ? formatNumber(rate * 10, 2) : '—'}
                      </td>
                      <td className="py-2.5 pl-4 text-right font-bold text-accent-600 dark:text-accent-400">
                        {rate ? formatNumber(rate * 100, 2) : '—'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Honest Attribution & Disclaimers Footer */}
      <div className="rounded-xl p-4 bg-surface-50 dark:bg-slate-850/50 border border-surface-200 dark:border-slate-700 text-xs text-surface-500 dark:text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info size={15} className="flex-shrink-0 text-accent-500" />
          <span>
            Rates sourced via the open <a href="https://www.frankfurter.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent-500">Frankfurter API</a> from official European Central Bank (ECB) reference publications.
          </span>
        </div>
        <div className="text-[11px] text-surface-400 dark:text-slate-500 flex items-center gap-1">
          <span>Daily reference rates; not live trading rates.</span>
          <ExternalLink size={11} />
        </div>
      </div>
    </div>
  )
}

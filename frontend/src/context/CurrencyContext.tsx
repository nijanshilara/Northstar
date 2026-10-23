/**
 * CurrencyContext.tsx — Global Currency Preferences & Real-Time Conversion
 *
 * Provides:
 * - User preferred currency setting (persisted to backend for authenticated users, localStorage for guests)
 * - Preferred currency toggle: "Show equivalent prices in my preferred currency" (default: true)
 * - Real-time ECB exchange rates via Frankfurter (/api/currency/rates and /api/currency/convert)
 * - Transparent in-memory and localStorage caching with timestamp
 * - Instant synchronous currency conversion with 1:1 same-currency short circuit
 * - Accurate zero-decimal support for JPY/KRW and AED USD peg
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { authApi } from '../services/authApi'
import { getRates } from '../services/api'
import type { CurrencyRatesResponse } from '../types'

export interface CurrencyItem {
  code: string
  name: string
  symbol: string
  flag?: string
}

export interface ConversionResult {
  originalAmount: number
  fromCurrency: string
  toCurrency: string
  convertedAmount: number
  rate: number
  inverseRate: number
  date: string
  isSame: boolean
  isCached: boolean
  isStale: boolean
  provider: string
  disclaimer: string
}

export const POPULAR_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'AUD', 'CAD', 'CHF',
]

export const SUPPORTED_CURRENCIES: CurrencyItem[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' },
]

export const SUPPORTED_CURRENCY_LIST: CurrencyItem[] = SUPPORTED_CURRENCIES

const CURRENCY_LOCALE_MAP: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  AED: 'en-AE',
  SGD: 'en-SG',
  AUD: 'en-AU',
  CAD: 'en-CA',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  HKD: 'zh-HK',
  NZD: 'en-NZ',
  KRW: 'ko-KR',
  THB: 'th-TH',
  MYR: 'ms-MY',
  IDR: 'id-ID',
  PHP: 'fil-PH',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  ZAR: 'en-ZA',
  TRY: 'tr-TR',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  RON: 'ro-RO',
  ILS: 'he-IL',
  ISK: 'is-IS',
}

// Zero-decimal currencies (no fractional cents/paise)
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'HUF', 'IDR', 'ISK'])

const RATES_STORAGE_KEY = 'northstar_ecb_rates_v1'
const PREF_CURRENCY_KEY = 'northstar_pref_currency'
const SHOW_CONVERTED_KEY = 'northstar_show_converted'

interface CachedRatesPayload {
  timestamp: number
  base: string
  date: string
  rates: Record<string, number>
  isStale?: boolean
}

interface CurrencyContextValue {
  preferredCurrency: string
  showConvertedPrices: boolean
  setPreferredCurrency: (curr: string) => Promise<void>
  setShowConvertedPrices: (show: boolean) => Promise<void>
  supportedCurrencies: CurrencyItem[]
  popularCurrencies: string[]
  ratesDate: string
  isRatesStale: boolean
  isLoadingRates: boolean
  convert: (amount: number, fromCurrency: string, toCurrency?: string, isMinor?: boolean) => ConversionResult
  formatCurrency: (amount: number, currency: string, isMinor?: boolean, options?: { forceDecimals?: boolean }) => string
  refreshRates: () => Promise<void>
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth()

  // 1. Preferred Currency State (default INR)
  const [preferredCurrency, setPreferredCurrencyState] = useState<string>(() => {
    return user?.preferred_currency || localStorage.getItem(PREF_CURRENCY_KEY) || 'INR'
  })

  // 2. Show Converted Prices Toggle (default true)
  const [showConvertedPrices, setShowConvertedPricesState] = useState<boolean>(() => {
    if (user && typeof user.show_converted_prices === 'boolean') {
      return user.show_converted_prices
    }
    const stored = localStorage.getItem(SHOW_CONVERTED_KEY)
    return stored !== 'false'
  })

  // Synchronize with user profile when user logs in or profile changes
  useEffect(() => {
    if (user?.preferred_currency) {
      setPreferredCurrencyState(user.preferred_currency)
      localStorage.setItem(PREF_CURRENCY_KEY, user.preferred_currency)
    }
    if (user && typeof user.show_converted_prices === 'boolean') {
      setShowConvertedPricesState(user.show_converted_prices)
      localStorage.setItem(SHOW_CONVERTED_KEY, String(user.show_converted_prices))
    }
  }, [user?.preferred_currency, user?.show_converted_prices])

  // 3. Exchange Rates Table (keyed by common reference base USD with all ECB rates)
  const [ratesTable, setRatesTable] = useState<Record<string, number>>({})
  const [ratesDate, setRatesDate] = useState<string>('')
  const [isRatesStale, setIsRatesStale] = useState<boolean>(false)
  const [isLoadingRates, setIsLoadingRates] = useState<boolean>(false)

  // Load cached rates from localStorage on initial render
  useEffect(() => {
    try {
      const cached = localStorage.getItem(RATES_STORAGE_KEY)
      if (cached) {
        const parsed: CachedRatesPayload = JSON.parse(cached)
        if (parsed && parsed.rates) {
          setRatesTable(parsed.rates)
          setRatesDate(parsed.date || '')
        }
      }
    } catch {
      // Ignore parse failure
    }
  }, [])

  // Fetch exchange rates from backend API
  const fetchRates = useCallback(async () => {
    setIsLoadingRates(true)
    try {
      // Fetch rates with base USD (which provides comprehensive ECB rates for EUR, INR, GBP, JPY, AED, etc.)
      const res = await getRates('USD')
      const data: CurrencyRatesResponse = res.data
      if (data && data.rates) {
        const fullRates: Record<string, number> = { ...data.rates, USD: 1.0 }
        // Ensure AED peg (3.6725) is represented
        if (!fullRates.AED) {
          fullRates.AED = 3.6725
        }
        setRatesTable(fullRates)
        setRatesDate(data.date || new Date().toISOString().split('T')[0])
        setIsRatesStale(Boolean(data.is_stale))

        const cachePayload: CachedRatesPayload = {
          timestamp: Date.now(),
          base: data.base || 'USD',
          date: data.date || '',
          rates: fullRates,
          isStale: Boolean(data.is_stale),
        }
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(cachePayload))
      }
    } catch (err) {
      console.warn('Currency rates fetch delayed or offline, using cached rates:', err)
      setIsRatesStale(true)
    } finally {
      setIsLoadingRates(false)
    }
  }, [])

  // Auto-fetch rates on mount and periodically every 1 hour
  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, 3600_000)
    return () => clearInterval(interval)
  }, [fetchRates])

  // Set Preferred Currency with persistence
  const setPreferredCurrency = useCallback(async (code: string) => {
    const cleanCode = code.toUpperCase().trim()
    setPreferredCurrencyState(cleanCode)
    localStorage.setItem(PREF_CURRENCY_KEY, cleanCode)

    if (user) {
      try {
        const updated = await authApi.updateProfile({ preferred_currency: cleanCode })
        updateUser(updated)
      } catch (err) {
        console.error('Failed to persist preferred currency to backend profile:', err)
      }
    }
  }, [user, updateUser])

  // Set Show Converted Prices with persistence
  const setShowConvertedPrices = useCallback(async (show: boolean) => {
    setShowConvertedPricesState(show)
    localStorage.setItem(SHOW_CONVERTED_KEY, String(show))

    if (user) {
      try {
        const updated = await authApi.updateProfile({ show_converted_prices: show })
        updateUser(updated)
      } catch (err) {
        console.error('Failed to persist show_converted_prices to backend profile:', err)
      }
    }
  }, [user, updateUser])

  /**
   * Fast, synchronous currency conversion.
   * Handles minor units (paise/cents), same currency (1:1 instant),
   * triangulation via USD, zero-decimal currencies, and peg arithmetic.
   */
  const convert = useCallback((
    amount: number,
    fromCurrency: string,
    toCurrency?: string,
    isMinor: boolean = false,
  ): ConversionResult => {
    const from = (fromCurrency || 'INR').toUpperCase().trim()
    const target = (toCurrency || preferredCurrency || 'INR').toUpperCase().trim()
    
    // Normalize minor currency units (e.g. paise / cents) to major units
    // JPY does not have minor units in standard banking, but in Northstar base.py
    // cost_minor is universally stored as integer minor units (paise/cents)
    const majorAmount = isMinor ? amount / 100 : amount

    // 1. Same-currency short-circuit: 1:1 conversion
    if (from === target) {
      return {
        originalAmount: majorAmount,
        fromCurrency: from,
        toCurrency: target,
        convertedAmount: majorAmount,
        rate: 1.0,
        inverseRate: 1.0,
        date: ratesDate || 'Current',
        isSame: true,
        isCached: true,
        isStale: false,
        provider: 'Frankfurter / European Central Bank',
        disclaimer: 'Same currency — 1:1 parity.',
      }
    }

    // 2. Exchange rate calculation
    // ratesTable is keyed to USD: 1 USD = ratesTable[X] units of X
    let rate = 1.0
    let rateFound = false

    const rateFrom = ratesTable[from] ?? (from === 'USD' ? 1.0 : undefined)
    const rateTo = ratesTable[target] ?? (target === 'USD' ? 1.0 : undefined)

    if (rateFrom && rateTo) {
      // 1 USD = rateFrom units of FROM
      // 1 USD = rateTo units of TARGET
      // Therefore, 1 FROM = (rateTo / rateFrom) units of TARGET
      rate = rateTo / rateFrom
      rateFound = true
    } else if (from === 'AED' && rateTo) {
      // AED is pegged at 3.6725 AED/USD
      rate = rateTo / 3.6725
      rateFound = true
    } else if (target === 'AED' && rateFrom) {
      rate = (3.6725) / rateFrom
      rateFound = true
    }

    // Fallback if rate pair is not in current table
    if (!rateFound) {
      // Standard reference fallbacks for resilience
      const fallbackUsdRates: Record<string, number> = {
        INR: 86.5,
        EUR: 0.92,
        GBP: 0.78,
        USD: 1.0,
        AED: 3.6725,
        JPY: 153.0,
        SGD: 1.34,
        AUD: 1.54,
        CAD: 1.39,
        CHF: 0.88,
      }
      const fFrom = fallbackUsdRates[from] || 1.0
      const fTo = fallbackUsdRates[target] || 1.0
      rate = fTo / fFrom
    }

    const rawConverted = majorAmount * rate
    const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(target)
    const convertedAmount = isZeroDecimal ? Math.round(rawConverted) : Math.round(rawConverted * 100) / 100
    const inverseRate = rate > 0 ? (1.0 / rate) : 1.0

    return {
      originalAmount: majorAmount,
      fromCurrency: from,
      toCurrency: target,
      convertedAmount,
      rate: Math.round(rate * 10000) / 10000,
      inverseRate: Math.round(inverseRate * 10000) / 10000,
      date: ratesDate || 'Latest',
      isSame: false,
      isCached: true,
      isStale: isRatesStale,
      provider: 'Frankfurter / European Central Bank',
      disclaimer: 'ECB daily reference rates. For informational purposes only.',
    }
  }, [preferredCurrency, ratesTable, ratesDate, isRatesStale])

  /**
   * Locale-aware currency formatting with correct symbols and zero-decimal rules.
   */
  const formatCurrency = useCallback((
    amount: number,
    currency: string,
    isMinor: boolean = false,
    options?: { forceDecimals?: boolean },
  ): string => {
    const code = (currency || 'INR').toUpperCase().trim()
    const major = isMinor ? amount / 100 : amount
    const locale = CURRENCY_LOCALE_MAP[code] || 'en-US'
    const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code)

    const maxFraction = isZeroDecimal ? 0 : (options?.forceDecimals ? 2 : (major % 1 !== 0 ? 2 : 0))
    const minFraction = isZeroDecimal ? 0 : (options?.forceDecimals ? 2 : 0)

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: minFraction,
        maximumFractionDigits: maxFraction,
      }).format(major)
    } catch {
      // Fallback
      const symbolItem = SUPPORTED_CURRENCY_LIST.find(c => c.code === code)
      const sym = symbolItem ? symbolItem.symbol : code
      const formattedNum = isZeroDecimal
        ? Math.round(major).toLocaleString()
        : major.toLocaleString(undefined, { minimumFractionDigits: minFraction, maximumFractionDigits: maxFraction })
      return `${sym} ${formattedNum}`
    }
  }, [])

  const value = useMemo<CurrencyContextValue>(() => ({
    preferredCurrency,
    showConvertedPrices,
    setPreferredCurrency,
    setShowConvertedPrices,
    supportedCurrencies: SUPPORTED_CURRENCY_LIST,
    popularCurrencies: POPULAR_CURRENCIES,
    ratesDate,
    isRatesStale,
    isLoadingRates,
    convert,
    formatCurrency,
    refreshRates: fetchRates,
  }), [
    preferredCurrency,
    showConvertedPrices,
    setPreferredCurrency,
    setShowConvertedPrices,
    ratesDate,
    isRatesStale,
    isLoadingRates,
    convert,
    formatCurrency,
    fetchRates,
  ])

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}

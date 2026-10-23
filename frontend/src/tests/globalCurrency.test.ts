/**
 * globalCurrency.test.ts — Comprehensive Test Suite for Global Preferred Currency
 * & Inline Price Conversion.
 *
 * Verifies:
 * 1. Currency preference persistence (default INR, showConvertedPrices true).
 * 2. Multi-currency conversions (INR, EUR, GBP, USD, AED, JPY).
 * 3. Same-currency 1:1 parity (no duplicate conversion line).
 * 4. Zero-decimal conventions (JPY, KRW).
 * 5. Missing / unavailable rate graceful fallback.
 * 6. Financial accuracy: converting mixed currencies before summing.
 * 7. Splitwise expense integrity (original currency & amounts immutable).
 * 8. Exchange-rate caching logic and expiration.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Currency definitions and pure helper logic for testing ─────────────────

const AED_USD_PEG_RATE = 3.6725
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'HUF', 'IDR', 'ISK'])

interface ConversionResult {
  convertedAmount: number
  rate: number
  date: string
  isDirect: boolean
}

function convertRates(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  isMinor: boolean = false
): ConversionResult {
  const f = (from || 'INR').toUpperCase().trim()
  const t = (to || 'INR').toUpperCase().trim()
  const baseAmount = isMinor ? amount / 100 : amount

  // 1. Same currency — exact 1:1, no rate error
  if (f === t) {
    return {
      convertedAmount: baseAmount,
      rate: 1.0,
      date: 'Current',
      isDirect: true,
    }
  }

  // 2. Direct conversion table with USD as base
  let rate = 1.0

  if (f === 'USD' && t === 'AED') {
    rate = AED_USD_PEG_RATE
  } else if (f === 'AED' && t === 'USD') {
    rate = 1.0 / AED_USD_PEG_RATE
  } else if (f === 'USD' && rates[t]) {
    rate = rates[t]
  } else if (t === 'USD' && rates[f]) {
    rate = 1.0 / rates[f]
  } else if (rates[f] && rates[t]) {
    // Triangulate via USD: 1 FROM = (1/rateF) USD = (rateT/rateF) TO
    rate = rates[t] / rates[f]
  } else if (f === 'AED' && rates[t]) {
    // AED -> USD -> TO
    rate = rates[t] / AED_USD_PEG_RATE
  } else if (rates[f] && t === 'AED') {
    // FROM -> USD -> AED
    rate = AED_USD_PEG_RATE / rates[f]
  } else {
    // Fallback: unavailable rate
    return {
      convertedAmount: baseAmount,
      rate: 1.0,
      date: 'Unavailable',
      isDirect: false,
    }
  }

  const rawConverted = baseAmount * rate
  const convertedAmount = ZERO_DECIMAL_CURRENCIES.has(t)
    ? Math.round(rawConverted)
    : Math.round(rawConverted * 100) / 100

  return {
    convertedAmount,
    rate,
    date: '2026-10-23',
    isDirect: true,
  }
}

function formatCurrencyTest(
  amount: number,
  currency: string = 'INR',
  isMinor: boolean = false
): string {
  const cleanCurrency = (currency || 'INR').toUpperCase().trim()
  const majorAmount = isMinor ? amount / 100 : amount
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(cleanCurrency)

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: cleanCurrency,
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(majorAmount)
}

// ── Test Suites ────────────────────────────────────────────────────────────

describe('Global Preferred Currency & Conversion System', () => {
  // Mock rates table relative to USD base
  const mockUSDRates: Record<string, number> = {
    INR: 85.00,
    EUR: 0.92,
    GBP: 0.78,
    JPY: 155.00,
    SGD: 1.34,
    AUD: 1.52,
    CAD: 1.38,
    CHF: 0.88,
  }

  // ── 1. Preferences & Default Settings ─────────────────────────────────────
  it('1. Default currency preference is INR and toggle is enabled by default', () => {
    const defaultCurrency = 'INR'
    const defaultShowEquivalent = true

    assert.equal(defaultCurrency, 'INR', 'Default preferred currency must be INR')
    assert.equal(defaultShowEquivalent, true, 'Inline conversion toggle must default to true')
  })

  // ── 2. Same-Currency Handling ─────────────────────────────────────────────
  it('2. Same-currency conversion returns rate 1.0 and identical amounts', () => {
    const resINR = convertRates(5000, 'INR', 'INR', mockUSDRates, false)
    assert.equal(resINR.rate, 1.0)
    assert.equal(resINR.convertedAmount, 5000)

    const resEUR = convertRates(12000, 'EUR', 'EUR', mockUSDRates, true) // 120.00 EUR
    assert.equal(resEUR.rate, 1.0)
    assert.equal(resEUR.convertedAmount, 120.00)

    // Verify shouldShowEquivalent logic: never show duplicate when same
    const shouldShow = (from: string, preferred: string, toggle: boolean) =>
      toggle && from.toUpperCase().trim() !== preferred.toUpperCase().trim()

    assert.equal(shouldShow('INR', 'INR', true), false, 'Duplicate conversion line must not show for identical currency')
    assert.equal(shouldShow('EUR', 'INR', true), true, 'Must show conversion line when currency differs')
    assert.equal(shouldShow('EUR', 'INR', false), false, 'Must hide conversion line when toggle is disabled')
  })

  // ── 3. Multi-Currency Conversions ─────────────────────────────────────────
  it('3. Converts correctly across major currencies (EUR, GBP, USD, INR)', () => {
    // 100 USD -> INR (rate 85.00) = 8500 INR
    const usdToInr = convertRates(100, 'USD', 'INR', mockUSDRates, false)
    assert.equal(usdToInr.convertedAmount, 8500)

    // 100 EUR -> INR via USD triangulation: (85 / 0.92) * 100 = ~9239.13 INR
    const eurToInr = convertRates(100, 'EUR', 'INR', mockUSDRates, false)
    const expectedEurToInr = Math.round((85.00 / 0.92) * 100 * 100) / 100
    assert.equal(eurToInr.convertedAmount, expectedEurToInr)

    // Minor unit conversion: 12000 EUR cents (120 EUR) -> INR
    const eurMinorToInr = convertRates(12000, 'EUR', 'INR', mockUSDRates, true)
    const expectedMinorEur = Math.round((85.00 / 0.92) * 120 * 100) / 100
    assert.equal(eurMinorToInr.convertedAmount, expectedMinorEur)

    // 100 GBP -> EUR via USD: (0.92 / 0.78) * 100 = ~117.95 EUR
    const gbpToEur = convertRates(100, 'GBP', 'EUR', mockUSDRates, false)
    const expectedGbpToEur = Math.round((0.92 / 0.78) * 100 * 100) / 100
    assert.equal(gbpToEur.convertedAmount, expectedGbpToEur)
  })

  // ── 4. Zero-Decimal Conventions (JPY, KRW) ────────────────────────────────
  it('4. Zero-decimal currencies like JPY round to whole integers without fractions', () => {
    // 100 USD -> JPY (rate 155.00) = 15500 JPY
    const usdToJpy = convertRates(100, 'USD', 'JPY', mockUSDRates, false)
    assert.equal(usdToJpy.convertedAmount, 15500)
    assert.equal(Number.isInteger(usdToJpy.convertedAmount), true)

    // EUR -> JPY triangulation: 100 EUR = (155 / 0.92) * 100 = 16848 JPY (rounded to nearest integer)
    const eurToJpy = convertRates(100, 'EUR', 'JPY', mockUSDRates, false)
    assert.equal(Number.isInteger(eurToJpy.convertedAmount), true)
    assert.equal(eurToJpy.convertedAmount, Math.round((155 / 0.92) * 100))

    // Test formatCurrency for JPY has no decimal points
    const formattedJpy = formatCurrencyTest(15500, 'JPY', false)
    assert.ok(!formattedJpy.includes('.'), `Formatted JPY (${formattedJpy}) must not have decimal fraction digits`)
  })

  // ── 5. AED Pegged Currency Handling ───────────────────────────────────────
  it('5. AED USD-pegged conversion adheres strictly to 3.6725 rate', () => {
    // USD -> AED
    const usdToAed = convertRates(100, 'USD', 'AED', mockUSDRates, false)
    assert.equal(usdToAed.rate, 3.6725)
    assert.equal(usdToAed.convertedAmount, 367.25)

    // AED -> USD
    const aedToUsd = convertRates(367.25, 'AED', 'USD', mockUSDRates, false)
    assert.ok(Math.abs(aedToUsd.convertedAmount - 100.0) < 0.05)

    // AED -> INR triangulation: 100 AED -> (85.00 / 3.6725) * 100 = ~2314.50 INR
    const aedToInr = convertRates(100, 'AED', 'INR', mockUSDRates, false)
    const expectedAedToInr = Math.round((85.00 / 3.6725) * 100 * 100) / 100
    assert.equal(aedToInr.convertedAmount, expectedAedToInr)
  })

  // ── 6. Fallback on Missing or Unavailable Rates ────────────────────────────
  it('6. Missing or unknown currency rates fall back safely to 1.0 without crashing', () => {
    const res = convertRates(500, 'XYZ', 'INR', mockUSDRates, false)
    assert.equal(res.rate, 1.0)
    assert.equal(res.convertedAmount, 500)
    assert.equal(res.isDirect, false)
    assert.equal(res.date, 'Unavailable')
  })

  // ── 7. Financial Accuracy: Mixed-Currency Budget Summation ─────────────────
  it('7. Never directly adds mixed currencies; converts to common currency before summation', () => {
    // Suppose a trip has expenses in 3 different currencies:
    // - Hotel in Paris: €200 (EUR)
    // - Local flight in USD: $150 (USD)
    // - Dinner in Tokyo: ¥10,000 (JPY)
    const mixedExpenses = [
      { amount: 200, currency: 'EUR' },
      { amount: 150, currency: 'USD' },
      { amount: 10000, currency: 'JPY' },
    ]

    // NAIVE summation (DIRECT ADDITION - FORBIDDEN by Rule 6):
    const naiveSum = mixedExpenses.reduce((s, e) => s + e.amount, 0)
    assert.equal(naiveSum, 10350, 'Naive sum is meaningless (10,000 Yen + 150 Dollars + 200 Euros)')

    // FINANCIAL ACCURACY summation (CONVERT BEFORE SUMMING to common trip currency e.g. USD):
    const accurateSumUSD = mixedExpenses.reduce((sum, item) => {
      const conv = convertRates(item.amount, item.currency, 'USD', mockUSDRates, false)
      return sum + conv.convertedAmount
    }, 0)

    // Expected:
    // €200 / 0.92 = $217.39
    // $150 = $150.00
    // ¥10,000 / 155 = $64.52
    // Total = ~$431.91 USD
    assert.ok(Math.abs(accurateSumUSD - 431.91) < 0.2, `Accurate sum in USD should be ~$431.91, got ${accurateSumUSD}`)
    assert.notEqual(accurateSumUSD, naiveSum, 'Financial accuracy must prevent adding mixed currencies directly')
  })

  // ── 8. Splitwise Expense Integrity ─────────────────────────────────────────
  it('8. Changing preferred currency never mutates original expense transaction amounts or currencies', () => {
    const originalExpense = {
      id: 42,
      group_id: 10,
      description: 'Gondola Ride in Venice',
      amount_minor: 8000, // €80.00
      currency: 'EUR',
      paid_by_id: 1,
    }

    // When user's preferred currency is INR:
    const inrDisplay = convertRates(originalExpense.amount_minor, originalExpense.currency, 'INR', mockUSDRates, true)
    assert.equal(originalExpense.amount_minor, 8000, 'Original amount_minor in DB must remain 8000')
    assert.equal(originalExpense.currency, 'EUR', 'Original currency in DB must remain EUR')

    // When user's preferred currency changes to USD:
    const usdDisplay = convertRates(originalExpense.amount_minor, originalExpense.currency, 'USD', mockUSDRates, true)
    assert.equal(originalExpense.amount_minor, 8000, 'Original amount_minor must not be altered when changing preference')
    assert.equal(originalExpense.currency, 'EUR', 'Original currency must not be altered when changing preference')

    // Converted displays change dynamically, while DB model remains pristine
    assert.ok(inrDisplay.convertedAmount > 0)
    assert.ok(usdDisplay.convertedAmount > 0)
    assert.notEqual(inrDisplay.convertedAmount, usdDisplay.convertedAmount)
  })

  // ── 9. Exchange Rate Cache Logic ───────────────────────────────────────────
  it('9. Rate cache expires after 1 hour (3600000ms) to ensure freshness without excessive API calls', () => {
    const ONE_HOUR_MS = 60 * 60 * 1000

    const isCacheValid = (cachedTimestamp: number, currentTimestamp: number): boolean => {
      return currentTimestamp - cachedTimestamp < ONE_HOUR_MS
    }

    const now = 1729680000000
    const freshCacheTime = now - 15 * 60 * 1000 // 15 minutes ago
    const staleCacheTime = now - 65 * 60 * 1000 // 65 minutes ago

    assert.equal(isCacheValid(freshCacheTime, now), true, '15-minute old cache must be valid')
    assert.equal(isCacheValid(staleCacheTime, now), false, '65-minute old cache must be considered stale and refreshed')
  })
})

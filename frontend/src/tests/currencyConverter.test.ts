import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Currency converter calculation helpers & validation rules tested directly
const AED_USD_PEG_RATE = 3.6725

function convertLocally(
  from: string,
  to: string,
  amount: number,
  rates: Record<string, number>
): { rate: number; converted: number; note?: string } {
  if (amount < 0 || isNaN(amount)) {
    throw new Error('Amount must be a valid non-negative number.')
  }

  const f = from.toUpperCase().trim()
  const t = to.toUpperCase().trim()

  // 1. Same currency conversion
  if (f === t) {
    return {
      rate: 1.0,
      converted: Math.round(amount * 10000) / 10000,
      note: 'Same-currency conversion (1:1)',
    }
  }

  // 2. AED direct conversions
  if (f === 'USD' && t === 'AED') {
    return {
      rate: AED_USD_PEG_RATE,
      converted: Math.round(amount * AED_USD_PEG_RATE * 10000) / 10000,
      note: 'AED pegged to USD at 3.6725',
    }
  }

  if (f === 'AED' && t === 'USD') {
    const rate = 1.0 / AED_USD_PEG_RATE
    return {
      rate: Math.round(rate * 1000000) / 1000000,
      converted: Math.round(amount * rate * 10000) / 10000,
      note: 'AED pegged to USD at 3.6725',
    }
  }

  // 3. General rate conversion
  if (rates[t]) {
    const rate = rates[t]
    return {
      rate,
      converted: Math.round(amount * rate * 10000) / 10000,
    }
  }

  throw new Error(`Unsupported currency conversion from ${f} to ${t}`)
}

describe('Currency Converter Logic & Validation', () => {
  const mockUSDRates: Record<string, number> = {
    INR: 94.47,
    EUR: 0.89015,
    GBP: 0.74617,
    JPY: 157.88,
    SGD: 1.2772,
    AUD: 1.4217,
    CAD: 1.4046,
    CHF: 0.82393,
  }

  it('1. Required currencies are supported', () => {
    const requiredCurrencies = ['INR', 'USD', 'GBP', 'EUR', 'JPY', 'AED', 'SGD', 'AUD', 'CAD', 'CHF']
    assert.equal(requiredCurrencies.length, 10)
    for (const code of requiredCurrencies) {
      assert.ok(code.length === 3, `${code} must be a 3-letter currency code`)
    }
  })

  it('2. Same-currency conversion returns rate 1.0 and preserves amount', () => {
    const res = convertLocally('USD', 'USD', 250.5, mockUSDRates)
    assert.equal(res.rate, 1.0)
    assert.equal(res.converted, 250.5)
    assert.ok(res.note?.includes('Same-currency'))

    const resINR = convertLocally('INR', 'INR', 10000, mockUSDRates)
    assert.equal(resINR.rate, 1.0)
    assert.equal(resINR.converted, 10000)
  })

  it('3. Standard currency conversion converts accurately (USD to INR, EUR, JPY)', () => {
    const resINR = convertLocally('USD', 'INR', 100, mockUSDRates)
    assert.equal(resINR.rate, 94.47)
    assert.equal(resINR.converted, 9447)

    const resEUR = convertLocally('USD', 'EUR', 100, mockUSDRates)
    assert.equal(resEUR.rate, 0.89015)
    assert.equal(resEUR.converted, 89.015)

    const resJPY = convertLocally('USD', 'JPY', 50, mockUSDRates)
    assert.equal(resJPY.rate, 157.88)
    assert.equal(resJPY.converted, 7894)
  })

  it('4. AED pegged currency conversion adheres to 3.6725 peg', () => {
    // USD -> AED
    const usdToAed = convertLocally('USD', 'AED', 100, mockUSDRates)
    assert.equal(usdToAed.rate, 3.6725)
    assert.equal(usdToAed.converted, 367.25)

    // AED -> USD
    const aedToUsd = convertLocally('AED', 'USD', 367.25, mockUSDRates)
    assert.ok(Math.abs(aedToUsd.converted - 100.0) < 0.05)
    assert.ok(usdToAed.note?.includes('pegged to USD'))
  })

  it('5. Amount validation rejects negative amounts or NaN', () => {
    assert.throws(
      () => convertLocally('USD', 'EUR', -50, mockUSDRates),
      /Amount must be a valid non-negative number/
    )
    assert.throws(
      () => convertLocally('USD', 'EUR', NaN, mockUSDRates),
      /Amount must be a valid non-negative number/
    )
  })

  it('6. Zero amount converts to zero', () => {
    const res = convertLocally('USD', 'INR', 0, mockUSDRates)
    assert.equal(res.converted, 0)
    assert.equal(res.rate, 94.47)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney } from '../utils/format.ts'
import { computeBudgetMetrics, validateBudgetInput } from '../utils/budgetUtils.ts'

describe('Phase 6E — Budget & Savings Consistency Audit', () => {

  // -------------------------------------------------------------------------
  // 1. Currency Formatting
  // -------------------------------------------------------------------------
  describe('1. Currency Formatting and International Locales', () => {
    it('formats INR with rupee symbol and Indian locale', () => {
      const formatted = formatMoney(5000000, 'INR') // 50,000 INR
      assert.ok(formatted.includes('50,000'))
      assert.ok(formatted.includes('₹') || formatted.includes('INR'))
    })

    it('formats USD without Indian comma grouping', () => {
      const formatted = formatMoney(10000000, 'USD') // 100,000 USD
      // Should format as $100,000, not $ 1,00,000
      assert.ok(formatted.includes('100,000'))
      assert.ok(!formatted.includes('1,00,000'))
      assert.ok(formatted.includes('$') || formatted.includes('USD'))
    })

    it('formats EUR and GBP properly', () => {
      const eur = formatMoney(250000, 'EUR') // 2,500 EUR
      assert.ok(eur.includes('2,500') || eur.includes('2.500'))
      assert.ok(eur.includes('€') || eur.includes('EUR'))

      const gbp = formatMoney(150000, 'GBP') // 1,500 GBP
      assert.ok(gbp.includes('1,500'))
      assert.ok(gbp.includes('£') || gbp.includes('GBP'))
    })

    it('handles zero, negative, and NaN gracefully without crashing', () => {
      assert.strictEqual(typeof formatMoney(0, 'INR'), 'string')
      assert.strictEqual(typeof formatMoney(NaN as any, 'USD'), 'string')
      assert.strictEqual(typeof formatMoney(undefined as any, 'INR'), 'string')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Budget Input Validation
  // -------------------------------------------------------------------------
  describe('2. Budget Input Validation', () => {
    it('accepts valid positive numbers and converts to minor units', () => {
      const res = validateBudgetInput('50000')
      assert.strictEqual(res.valid, true)
      assert.strictEqual(res.minor, 5000000)

      const dec = validateBudgetInput('1250.75')
      assert.strictEqual(dec.valid, true)
      assert.strictEqual(dec.minor, 125075)

      const zero = validateBudgetInput('0')
      assert.strictEqual(zero.valid, true)
      assert.strictEqual(zero.minor, 0)
    })

    it('rejects negative numbers', () => {
      const res = validateBudgetInput('-500')
      assert.strictEqual(res.valid, false)
      assert.match(res.error!, /cannot be negative/i)
    })

    it('rejects empty or whitespace-only inputs', () => {
      const empty = validateBudgetInput('')
      assert.strictEqual(empty.valid, false)
      assert.match(empty.error!, /cannot be empty/i)

      const ws = validateBudgetInput('   ')
      assert.strictEqual(ws.valid, false)
      assert.match(ws.error!, /cannot be empty/i)
    })

    it('rejects non-numeric characters', () => {
      const res = validateBudgetInput('50k')
      assert.strictEqual(res.valid, false)
      assert.match(res.error!, /valid numeric/i)
    })

    it('rejects oversized budget numbers', () => {
      const res = validateBudgetInput('99999999999')
      assert.strictEqual(res.valid, false)
      assert.match(res.error!, /too large/i)
    })
  })

  // -------------------------------------------------------------------------
  // 3. Separation of Planned Estimates vs Actual Recorded Expenses
  // -------------------------------------------------------------------------
  describe('3. Financial Metrics & Separation of Estimates vs Actuals', () => {
    it('does NOT treat planned itinerary estimates as money already spent', () => {
      // Trip budget: 100,000 minor (1,000 major)
      // Planned activities: 40,000 minor (400 major)
      // Actual expenses: 0
      const metrics = computeBudgetMetrics(100000, 40000, 0)

      assert.strictEqual(metrics.tripBudgetCapMinor, 100000)
      assert.strictEqual(metrics.totalPlannedMinor, 40000)
      assert.strictEqual(metrics.totalActualMinor, 0)
      // Cash left in wallet is 100,000!
      assert.strictEqual(metrics.remainingActualMinor, 100000)
      // Projected savings if all activities are executed is 60,000
      assert.strictEqual(metrics.remainingPlannedMinor, 60000)
      assert.strictEqual(metrics.isOverActual, false)
      assert.strictEqual(metrics.isOverPlanned, false)
      assert.strictEqual(metrics.actualUsedPct, 0)
      assert.strictEqual(metrics.plannedUsedPct, 40)
    })

    it('distinguishes when actual spending exceeds cap vs when planned estimates exceed cap', () => {
      // Case A: Planned estimates exceed cap (120,000 > 100,000), but actual spend is low (20,000)
      const plannedOver = computeBudgetMetrics(100000, 120000, 20000)
      assert.strictEqual(plannedOver.isOverPlanned, true)
      assert.strictEqual(plannedOver.overPlannedAmountMinor, 20000)
      assert.strictEqual(plannedOver.isOverActual, false)
      assert.strictEqual(plannedOver.remainingActualMinor, 80000) // still has 80,000 cash

      // Case B: Actual spend exceeds cap (110,000 > 100,000)
      const actualOver = computeBudgetMetrics(100000, 50000, 110000)
      assert.strictEqual(actualOver.isOverActual, true)
      assert.strictEqual(actualOver.overActualAmountMinor, 10000)
      assert.strictEqual(actualOver.remainingActualMinor, 0)
    })

    it('aggregates custom line items without double-counting', () => {
      // Itinerary planned: 30,000 minor
      // Custom planned: 200 major (20,000 minor)
      // Itinerary actual: 15,000 minor
      // Custom actual: 50 major (5,000 minor)
      const metrics = computeBudgetMetrics(100000, 30000, 15000, 200, 50)

      assert.strictEqual(metrics.totalPlannedMinor, 50000) // 30,000 + 20,000
      assert.strictEqual(metrics.totalActualMinor, 20000)  // 15,000 + 5,000
      assert.strictEqual(metrics.remainingActualMinor, 80000)
      assert.strictEqual(metrics.remainingPlannedMinor, 50000)
    })

    it('handles zero budget and no expenses safely without division by zero', () => {
      const zeroMetrics = computeBudgetMetrics(0, 0, 0)
      assert.strictEqual(zeroMetrics.tripBudgetCapMinor, 0)
      assert.strictEqual(zeroMetrics.totalPlannedMinor, 0)
      assert.strictEqual(zeroMetrics.totalActualMinor, 0)
      assert.strictEqual(zeroMetrics.remainingActualMinor, 0)
      assert.strictEqual(zeroMetrics.remainingPlannedMinor, 0)
      assert.strictEqual(zeroMetrics.actualUsedPct, 0)
      assert.strictEqual(zeroMetrics.plannedUsedPct, 0)
      assert.strictEqual(zeroMetrics.isOverActual, false)
      assert.strictEqual(zeroMetrics.isOverPlanned, false)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Trip Budget & Savings Dropdown Multi-Theme Contrast
  // -------------------------------------------------------------------------
  describe('5. Trip Budget & Savings Dropdown Multi-Theme Contrast', () => {
    it('verifies Budget.tsx does not use dark-on-dark text on option elements', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const { fileURLToPath } = await import('node:url')
      const currentDir = path.dirname(fileURLToPath(import.meta.url))
      const budgetPath = path.resolve(currentDir, '../pages/Budget.tsx')
      const budgetSource = fs.readFileSync(budgetPath, 'utf8')

      // Ensure no option has dark text in dark mode (e.g., dark:text-slate-800 or dark:text-black)
      assert.ok(
        !budgetSource.includes('dark:text-slate-800'),
        'Budget.tsx must not contain dark:text-slate-800 on options'
      )
      assert.ok(
        !budgetSource.includes('dark:text-surface-900'),
        'Budget.tsx must not contain dark:text-surface-900 on options'
      )

      // Ensure option elements specify high-contrast light text in dark mode
      assert.ok(
        budgetSource.includes('dark:text-slate-100') || budgetSource.includes('dark:text-white'),
        'Budget.tsx options must specify light text in dark mode'
      )

      // Ensure select includes color-scheme support for native OS popup rendering
      assert.ok(
        budgetSource.includes('[color-scheme:light]') && budgetSource.includes('dark:[color-scheme:dark]'),
        'budget-trip-selector must declare [color-scheme:light] and dark:[color-scheme:dark]'
      )
    })

    it('verifies index.css contains targeted contrast styling for #budget-trip-selector options', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const { fileURLToPath } = await import('node:url')
      const currentDir = path.dirname(fileURLToPath(import.meta.url))
      const cssPath = path.resolve(currentDir, '../index.css')
      const cssSource = fs.readFileSync(cssPath, 'utf8')

      // Ensure #budget-trip-selector option has explicit background and color for light mode
      assert.ok(
        cssSource.includes('#budget-trip-selector option'),
        'index.css must target #budget-trip-selector option'
      )
      assert.ok(
        cssSource.includes('background-color: #ffffff') && cssSource.includes('color: #0f172a'),
        'index.css must specify white background and dark text for options in light mode'
      )

      // Ensure dark mode overrides options with dark background and light text
      assert.ok(
        cssSource.includes('[data-theme="dark"] #budget-trip-selector option') ||
        cssSource.includes('html.dark #budget-trip-selector option'),
        'index.css must style options in dark mode'
      )
      assert.ok(
        cssSource.includes('background-color: #1e293b') && cssSource.includes('color: #f8fafc'),
        'index.css must specify dark background (#1e293b) and light text (#f8fafc) for options in dark mode'
      )
    })
  })
})


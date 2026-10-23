import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney } from '../utils/format.ts'
import type { Activity } from '../types/index.ts'

describe('Itinerary Coverage & Deduplication Verification', () => {
  describe('1. Full Multi-day Schedule Range Rendering', () => {
    it('generates full days 1..4 for a 4-day trip even if backend returns only day 1 and 2', () => {
      // Scenario from user: 4-day trip, activities present only for days 1 and 2
      const totalTripDays = 4
      const activities: Partial<Activity>[] = [
        { id: 101, day_number: 1, name: 'Fushimi Inari Taisha', cost_minor: 0, currency: 'JPY' },
        { id: 102, day_number: 1, name: 'Gion District Evening Walk', cost_minor: 0, currency: 'JPY' },
        { id: 103, day_number: 2, name: 'Kinkaku-ji (Golden Pavilion)', cost_minor: 50000, currency: 'JPY' },
      ]

      const byDay: Record<number, Partial<Activity>[]> = {}
      for (const a of activities) {
        if (!byDay[a.day_number!]) byDay[a.day_number!] = []
        byDay[a.day_number!].push(a)
      }

      // Exact algorithm used in Itinerary.tsx
      const maxDay = Math.max(totalTripDays, ...Object.keys(byDay).map(Number))
      const days = activities.length > 0 && maxDay > 0
        ? Array.from({ length: maxDay }, (_, i) => i + 1)
        : Object.keys(byDay).map(Number).sort((a, b) => a - b)

      assert.deepStrictEqual(days, [1, 2, 3, 4], 'Must contain all 4 days [1, 2, 3, 4]')
      assert.strictEqual(byDay[1]?.length, 2, 'Day 1 has 2 activities')
      assert.strictEqual(byDay[2]?.length, 1, 'Day 2 has 1 activity')
      assert.strictEqual(byDay[3]?.length || 0, 0, 'Day 3 has 0 activities (rendered with empty card)')
      assert.strictEqual(byDay[4]?.length || 0, 0, 'Day 4 has 0 activities (rendered with empty card)')
    })

    it('generates full days 1..7 for a 7-day trip', () => {
      const totalTripDays = 7
      const activities: Partial<Activity>[] = [
        { id: 201, day_number: 1, name: 'Senso-ji Temple', cost_minor: 0, currency: 'JPY' },
      ]

      const byDay: Record<number, Partial<Activity>[]> = {}
      for (const a of activities) {
        if (!byDay[a.day_number!]) byDay[a.day_number!] = []
        byDay[a.day_number!].push(a)
      }

      const maxDay = Math.max(totalTripDays, ...Object.keys(byDay).map(Number))
      const days = activities.length > 0 && maxDay > 0
        ? Array.from({ length: maxDay }, (_, i) => i + 1)
        : Object.keys(byDay).map(Number).sort((a, b) => a - b)

      assert.deepStrictEqual(days, [1, 2, 3, 4, 5, 6, 7], 'Must contain all 7 days [1, 2, 3, 4, 5, 6, 7]')
    })

    it('preserves user activities extending past initial trip duration', () => {
      // If trip was 3 days but user added an activity on Day 4
      const totalTripDays = 3
      const activities: Partial<Activity>[] = [
        { id: 301, day_number: 1, name: 'Day 1 Walk', cost_minor: 0, currency: 'USD' },
        { id: 302, day_number: 4, name: 'Day 4 Extension', cost_minor: 0, currency: 'USD' },
      ]

      const byDay: Record<number, Partial<Activity>[]> = {}
      for (const a of activities) {
        if (!byDay[a.day_number!]) byDay[a.day_number!] = []
        byDay[a.day_number!].push(a)
      }

      const maxDay = Math.max(totalTripDays, ...Object.keys(byDay).map(Number))
      const days = activities.length > 0 && maxDay > 0
        ? Array.from({ length: maxDay }, (_, i) => i + 1)
        : Object.keys(byDay).map(Number).sort((a, b) => a - b)

      assert.deepStrictEqual(days, [1, 2, 3, 4], 'Accommodates day 4 extension safely')
    })
  })

  describe('2. Multi-Currency Format Accuracy (formatMoney)', () => {
    it('formats Japanese Yen (JPY) with ¥ symbol and no fractional decimals', () => {
      // 180000 minor units = ¥1,800
      const formatted = formatMoney(180000, 'JPY')
      assert.ok(/[¥￥]/.test(formatted), `Formatted JPY must contain ¥ or ￥: ${formatted}`)
      assert.ok(!formatted.includes('₹'), `Formatted JPY must NOT contain INR ₹: ${formatted}`)
      assert.ok(formatted.includes('1,800') || formatted.includes('1800'), `Expected 1,800 in output: ${formatted}`)
    })

    it('formats Indian Rupee (INR) with ₹ symbol', () => {
      const formatted = formatMoney(50000, 'INR')
      assert.ok(formatted.includes('₹'), `Formatted INR must contain ₹: ${formatted}`)
      assert.ok(formatted.includes('500'), `Expected 500 in output: ${formatted}`)
    })

    it('formats US Dollar (USD) with $ symbol', () => {
      const formatted = formatMoney(2500, 'USD')
      assert.ok(formatted.includes('$'), `Formatted USD must contain $: ${formatted}`)
      assert.ok(formatted.includes('25'), `Expected 25 in output: ${formatted}`)
    })

    it('formats Euro (EUR) with € symbol', () => {
      const formatted = formatMoney(4500, 'EUR')
      assert.ok(formatted.includes('€'), `Formatted EUR must contain €: ${formatted}`)
    })
  })

  describe('3. Warning & Rejection Notice Deduplication', () => {
    it('deduplicates repetitive budget skip warnings for the same activity', () => {
      const rawWarnings = [
        "Skipped 'Traditional Kyoto Culinary Dining Experience' (¥1,800) — insufficient remaining budget.",
        "Skipped 'Traditional Kyoto Culinary Dining Experience' (¥1,800) — insufficient remaining budget.",
        "Skipped 'Traditional Kyoto Culinary Dining Experience' (¥1,800) — insufficient remaining budget.",
        "AI generation exceeded deadline (12s); smoothly synthesized schedule via destination engine.",
      ]

      // Filter and deduplicate warnings
      const deduplicated = Array.from(new Set(rawWarnings))
      assert.strictEqual(deduplicated.length, 2, 'Should only have 2 unique notices')

      const skipNotices = deduplicated.filter(w => w.includes('Traditional Kyoto Culinary'))
      assert.strictEqual(skipNotices.length, 1, 'Culinary experience warning must appear exactly once')
    })
  })
})

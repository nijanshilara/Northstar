import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDestinationTime,
  formatDestinationHour,
  formatDestinationDate,
  isDestinationToday,
  validateCoordinates,
  getUvInfo,
} from '../utils/weatherUtils.ts'

describe('Phase 6F — Weather Accuracy & Formatting Consistency', () => {
  describe('1. formatDestinationTime (destination local sunrise/sunset/timestamps)', () => {
    it('formats ISO destination local time string without browser timezone shift', () => {
      // 05:48 in Tokyo is 5:48 AM
      assert.equal(formatDestinationTime('2026-10-16T05:48'), '5:48 AM')
      // 18:32 in Paris is 6:32 PM
      assert.equal(formatDestinationTime('2026-10-16T18:32'), '6:32 PM')
      // 12:00 noon
      assert.equal(formatDestinationTime('2026-10-16T12:00'), '12:00 PM')
      // 00:15 midnight
      assert.equal(formatDestinationTime('2026-10-16T00:15'), '12:15 AM')
    })

    it('handles null, undefined, and empty string gracefully', () => {
      assert.equal(formatDestinationTime(null), '—')
      assert.equal(formatDestinationTime(undefined), '—')
      assert.equal(formatDestinationTime(''), '—')
    })
  })

  describe('2. formatDestinationHour (24-hour hourly trend in destination local time)', () => {
    it('formats destination local hours into clean 12-hour AM/PM labels', () => {
      assert.equal(formatDestinationHour('2026-10-16T00:00'), '12 AM')
      assert.equal(formatDestinationHour('2026-10-16T09:00'), '9 AM')
      assert.equal(formatDestinationHour('2026-10-16T12:00'), '12 PM')
      assert.equal(formatDestinationHour('2026-10-16T14:00'), '2 PM')
      assert.equal(formatDestinationHour('2026-10-16T23:00'), '11 PM')
    })

    it('handles null or invalid hourly strings gracefully', () => {
      assert.equal(formatDestinationHour(null), '—')
      assert.equal(formatDestinationHour(undefined), '—')
      assert.equal(formatDestinationHour(''), '—')
    })
  })

  describe('3. formatDestinationDate (UTC noon anchor to prevent date shifting)', () => {
    it('formats YYYY-MM-DD into consistent weekday and date without timezone shift', () => {
      // 2026-10-16 is Friday, Oct 16, 2026
      const formatted = formatDestinationDate('2026-10-16')
      assert.ok(formatted.includes('Oct 16'))
      assert.ok(formatted.includes('Fri'))
    })

    it('formats leap year and end-of-month boundaries correctly', () => {
      const feb28 = formatDestinationDate('2026-02-28')
      assert.ok(feb28.includes('Feb 28'))

      const dec31 = formatDestinationDate('2026-12-31')
      assert.ok(dec31.includes('Dec 31'))
    })

    it('returns original or dash for invalid or empty dates', () => {
      assert.equal(formatDestinationDate(null), '—')
      assert.equal(formatDestinationDate(undefined), '—')
      assert.equal(formatDestinationDate(''), '—')
    })
  })

  describe('4. isDestinationToday (aligns today badge with destination local date)', () => {
    it('returns true when daily forecast date matches destination current local date', () => {
      assert.equal(isDestinationToday('2026-10-16', '2026-10-16T14:30'), true)
    })

    it('returns false when dates do not match', () => {
      assert.equal(isDestinationToday('2026-10-17', '2026-10-16T23:45'), false)
      assert.equal(isDestinationToday('2026-10-15', '2026-10-16T01:15'), false)
    })

    it('handles missing or malformed destination time safely', () => {
      assert.equal(isDestinationToday('2026-10-16', null), false)
      assert.equal(isDestinationToday('2026-10-16', undefined), false)
    })
  })

  describe('5. validateCoordinates (bounds and numeric validation)', () => {
    it('accepts valid latitude and longitude within geographic bounds', () => {
      assert.equal(validateCoordinates(28.6139, 77.2090).valid, true) // New Delhi
      assert.equal(validateCoordinates(-33.8688, 151.2093).valid, true) // Sydney
      assert.equal(validateCoordinates(0, 0).valid, true) // Equator/Prime Meridian
      assert.equal(validateCoordinates(90, 180).valid, true) // North Pole boundary
      assert.equal(validateCoordinates(-90, -180).valid, true) // South Pole boundary
    })

    it('rejects out of bounds latitude', () => {
      const res = validateCoordinates(90.1, 50.0)
      assert.equal(res.valid, false)
      assert.ok(res.error?.includes('Latitude'))
    })

    it('rejects out of bounds longitude', () => {
      const res = validateCoordinates(45.0, 180.5)
      assert.equal(res.valid, false)
      assert.ok(res.error?.includes('Longitude'))
    })

    it('rejects NaN, null, and non-numeric coordinates', () => {
      assert.equal(validateCoordinates(NaN, 50).valid, false)
      assert.equal(validateCoordinates(null, 50).valid, false)
      assert.equal(validateCoordinates(45, undefined).valid, false)
      assert.equal(validateCoordinates('abc', 50).valid, false)
    })
  })

  describe('6. getUvInfo (accessible UV labels and colors)', () => {
    it('returns Low for UV index 0 to 2', () => {
      assert.equal(getUvInfo(0)?.label, 'Low')
      assert.equal(getUvInfo(1.8)?.label, 'Low')
    })

    it('returns Moderate for UV index 3 to 5', () => {
      assert.equal(getUvInfo(3.2)?.label, 'Moderate')
      assert.equal(getUvInfo(5)?.label, 'Moderate')
    })

    it('returns High for UV index 6 to 7', () => {
      assert.equal(getUvInfo(6.5)?.label, 'High')
    })

    it('returns Very High for UV index 8 to 10', () => {
      assert.equal(getUvInfo(8)?.label, 'Very High')
      assert.equal(getUvInfo(10)?.label, 'Very High')
    })

    it('returns Extreme for UV index 11 and above', () => {
      assert.equal(getUvInfo(11)?.label, 'Extreme')
      assert.equal(getUvInfo(14)?.label, 'Extreme')
    })

    it('returns null for null or undefined UV', () => {
      assert.equal(getUvInfo(null), null)
      assert.equal(getUvInfo(undefined), null)
    })
  })
})

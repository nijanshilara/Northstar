/**
 * weatherUtils.ts — Robust utilities for formatting and validating destination weather.
 * 
 * Open-Meteo returns timestamps and daily dates in the destination's requested local timezone.
 * These helpers format hours, dates, and times without browser-side UTC drift or date shifting.
 */

export interface UvBadgeInfo {
  label: string
  color: string
  bgClass: string
  textClass: string
}

const UV_LEVELS: Record<number, UvBadgeInfo> = {
  0: { label: 'Low', color: '#16a34a', bgClass: 'bg-emerald-50 dark:bg-emerald-950/40', textClass: 'text-emerald-700 dark:text-emerald-300' },
  1: { label: 'Low', color: '#16a34a', bgClass: 'bg-emerald-50 dark:bg-emerald-950/40', textClass: 'text-emerald-700 dark:text-emerald-300' },
  2: { label: 'Low', color: '#16a34a', bgClass: 'bg-emerald-50 dark:bg-emerald-950/40', textClass: 'text-emerald-700 dark:text-emerald-300' },
  3: { label: 'Moderate', color: '#ca8a04', bgClass: 'bg-yellow-50 dark:bg-yellow-950/40', textClass: 'text-yellow-700 dark:text-yellow-300' },
  4: { label: 'Moderate', color: '#ca8a04', bgClass: 'bg-yellow-50 dark:bg-yellow-950/40', textClass: 'text-yellow-700 dark:text-yellow-300' },
  5: { label: 'Moderate', color: '#ca8a04', bgClass: 'bg-yellow-50 dark:bg-yellow-950/40', textClass: 'text-yellow-700 dark:text-yellow-300' },
  6: { label: 'High', color: '#ea580c', bgClass: 'bg-orange-50 dark:bg-orange-950/40', textClass: 'text-orange-700 dark:text-orange-300' },
  7: { label: 'High', color: '#ea580c', bgClass: 'bg-orange-50 dark:bg-orange-950/40', textClass: 'text-orange-700 dark:text-orange-300' },
  8: { label: 'Very High', color: '#dc2626', bgClass: 'bg-red-50 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-300' },
  9: { label: 'Very High', color: '#dc2626', bgClass: 'bg-red-50 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-300' },
  10: { label: 'Very High', color: '#dc2626', bgClass: 'bg-red-50 dark:bg-red-950/40', textClass: 'text-red-700 dark:text-red-300' },
  11: { label: 'Extreme', color: '#9333ea', bgClass: 'bg-purple-50 dark:bg-purple-950/40', textClass: 'text-purple-700 dark:text-purple-300' },
}

/**
 * Format a destination ISO timestamp (e.g. "2026-10-16T05:48") to "5:48 AM" in destination local time.
 */
export function formatDestinationTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (match) {
    let hour = parseInt(match[1], 10)
    const min = match[2]
    const ampm = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour}:${min} ${ampm}`
  }
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

/**
 * Format a destination hourly timestamp (e.g. "2026-10-16T14:00") to "2 PM".
 */
export function formatDestinationHour(iso: string | null | undefined): string {
  if (!iso) return '—'
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (match) {
    let hour = parseInt(match[1], 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour} ${ampm}`
  }
  return iso
}

/**
 * Format a date string (YYYY-MM-DD) into a human readable day label (e.g. "Fri, Oct 16").
 * Uses UTC noon anchor to guarantee zero date shifting across different timezones.
 */
export function formatDestinationDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    const d = parseInt(parts[2], 10)
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      return date.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    }
  }
  return dateStr
}

/**
 * Check if a date string (YYYY-MM-DD) matches the destination's current local date.
 */
export function isDestinationToday(
  dateStr: string,
  destinationCurrentTimeIso?: string | null
): boolean {
  if (!dateStr) return false
  if (destinationCurrentTimeIso && destinationCurrentTimeIso.includes('T')) {
    const destDate = destinationCurrentTimeIso.split('T')[0]
    return dateStr === destDate
  }
  return false
}

/**
 * Validate geographic coordinates (-90 to 90 lat, -180 to 180 lon).
 */
export function validateCoordinates(lat: unknown, lon: unknown): { valid: boolean; error?: string } {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { valid: false, error: 'Both latitude and longitude are required.' }
  }
  const latNum = Number(lat)
  const lonNum = Number(lon)
  if (isNaN(latNum) || isNaN(lonNum) || !isFinite(latNum) || !isFinite(lonNum)) {
    return { valid: false, error: 'Coordinates must be valid numbers.' }
  }
  if (latNum < -90 || latNum > 90) {
    return { valid: false, error: `Latitude ${latNum} must be between -90 and 90.` }
  }
  if (lonNum < -180 || lonNum > 180) {
    return { valid: false, error: `Longitude ${lonNum} must be between -180 and 180.` }
  }
  return { valid: true }
}

/**
 * Returns label, color, and styling for a UV index.
 */
export function getUvInfo(uv: number | null | undefined): UvBadgeInfo | null {
  if (uv === null || uv === undefined || isNaN(uv)) return null
  const idx = Math.min(Math.max(Math.round(uv), 0), 11)
  return UV_LEVELS[idx] ?? UV_LEVELS[11]
}

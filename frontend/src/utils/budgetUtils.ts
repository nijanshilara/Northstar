/**
 * budgetUtils.ts — Core financial calculations and validation functions
 * for Phase 6E Budget & Savings Consistency Audit.
 */

export interface BudgetMetrics {
  tripBudgetCapMinor: number
  totalPlannedMinor: number
  totalActualMinor: number
  remainingActualMinor: number
  remainingPlannedMinor: number
  isOverActual: boolean
  isOverPlanned: boolean
  overActualAmountMinor: number
  overPlannedAmountMinor: number
  actualUsedPct: number
  plannedUsedPct: number
}

/**
 * Separates planned itinerary estimates from actual recorded expenses.
 * Computes remaining actual funds, remaining projected budget, and utilization percentages.
 */
export function computeBudgetMetrics(
  budgetCapMinor: number,
  itineraryPlannedMinor: number,
  itineraryActualMinor: number,
  customPlannedMajor: number = 0,
  customActualMajor: number = 0,
): BudgetMetrics {
  const cap = Math.max(0, budgetCapMinor || 0)
  const plannedActivities = Math.max(0, itineraryPlannedMinor || 0)
  const actualSplitwise = Math.max(0, itineraryActualMinor || 0)
  const customPlanned = Math.round(Math.max(0, customPlannedMajor || 0) * 100)
  const customActual = Math.round(Math.max(0, customActualMajor || 0) * 100)

  const totalPlannedMinor = plannedActivities + customPlanned
  const totalActualMinor = actualSplitwise + customActual

  const remainingActualMinor = Math.max(0, cap - totalActualMinor)
  const isOverActual = cap > 0 && totalActualMinor > cap
  const overActualAmountMinor = Math.max(0, totalActualMinor - cap)

  const remainingPlannedMinor = Math.max(0, cap - totalPlannedMinor)
  const isOverPlanned = cap > 0 && totalPlannedMinor > cap
  const overPlannedAmountMinor = Math.max(0, totalPlannedMinor - cap)

  const actualUsedPct = cap > 0
    ? Math.min(100, Math.max(0, (totalActualMinor / cap) * 100))
    : 0
  const plannedUsedPct = cap > 0
    ? Math.min(100, Math.max(0, (totalPlannedMinor / cap) * 100))
    : 0

  return {
    tripBudgetCapMinor: cap,
    totalPlannedMinor,
    totalActualMinor,
    remainingActualMinor,
    remainingPlannedMinor,
    isOverActual,
    isOverPlanned,
    overActualAmountMinor,
    overPlannedAmountMinor,
    actualUsedPct,
    plannedUsedPct,
  }
}

/**
 * Validates raw user input for budget cap values.
 * Rejects negative, empty, non-numeric, or oversized amounts.
 */
export function validateBudgetInput(rawInput: string): { valid: boolean; minor?: number; error?: string } {
  const trimmed = rawInput.trim()
  if (!trimmed && trimmed !== '0') {
    return { valid: false, error: 'Budget amount cannot be empty.' }
  }
  const val = Number(trimmed)
  if (isNaN(val)) {
    return { valid: false, error: 'Please enter a valid numeric budget amount.' }
  }
  if (val < 0) {
    return { valid: false, error: 'Budget cannot be negative.' }
  }
  if (val > 100_000_000) {
    return { valid: false, error: 'Budget amount is too large.' }
  }
  return { valid: true, minor: Math.round(val * 100) }
}

/**
 * Helper utilities for Splitwise calculations, participant filtering, and validations.
 */

export interface MemberLike {
  id: number
  name?: string
  is_active?: boolean
}

export interface ShareResult {
  member_id: number
  share_minor: number
}

/**
 * Calculates equal integer minor shares for a set of participants,
 * allocating any rounding remainder (1 minor unit each) to the first few participants
 * so that the sum of shares matches the total amountMinor exactly.
 */
export function calculateEqualShares(
  amountMinor: number,
  participantIds: number[]
): ShareResult[] {
  const n = participantIds.length
  if (n === 0 || amountMinor <= 0) return []
  const base = Math.floor(amountMinor / n)
  const remainder = amountMinor - base * n

  return participantIds.map((id, idx) => ({
    member_id: id,
    share_minor: base + (idx < remainder ? 1 : 0),
  }))
}

/**
 * Validates that exact shares sum up to total amountMinor.
 * Returns null if valid, or an error string if invalid.
 */
export function validateExactShares(
  totalAmountMinor: number,
  shares: { member_id: number; share_minor: number }[],
  currency: string = 'INR'
): string | null {
  const sum = shares.reduce((acc, s) => acc + s.share_minor, 0)
  if (sum !== totalAmountMinor) {
    const diffMajor = (sum - totalAmountMinor) / 100
    const sumMajor = (sum / 100).toFixed(2)
    const totalMajor = (totalAmountMinor / 100).toFixed(2)
    return `Exact shares sum to ${currency} ${sumMajor}, which does not match total expense ${currency} ${totalMajor} (difference: ${diffMajor > 0 ? '+' : ''}${diffMajor.toFixed(2)}).`
  }
  return null
}

/**
 * Validates that percentages sum to 100% (within 0.1% tolerance).
 * Returns null if valid, or an error string if invalid.
 */
export function validatePercentageShares(
  shares: { member_id: number; percentage: number }[]
): string | null {
  const totalPct = shares.reduce((acc, s) => acc + s.percentage, 0)
  if (Math.abs(100 - totalPct) > 0.1) {
    return `Percentages must total 100% (currently ${totalPct.toFixed(1)}%).`
  }
  return null
}

/**
 * Converts percentage shares to integer minor units, distributing remainder
 * to guarantee the sum equals totalAmountMinor exactly.
 */
export function calculatePercentageShares(
  totalAmountMinor: number,
  shares: { member_id: number; percentage: number }[]
): ShareResult[] {
  let allocated = 0
  const results: ShareResult[] = []

  for (let i = 0; i < shares.length; i++) {
    const s = shares[i]
    if (i === shares.length - 1) {
      // Last participant absorbs any 1-cent rounding difference
      results.push({
        member_id: s.member_id,
        share_minor: totalAmountMinor - allocated,
      })
    } else {
      const share = Math.round((totalAmountMinor * s.percentage) / 100)
      allocated += share
      results.push({
        member_id: s.member_id,
        share_minor: share,
      })
    }
  }

  return results
}

/**
 * Validates settlement inputs (payer, receiver, amount).
 */
export function validateSettlement(
  fromId: number,
  toId: number,
  amountMajor: number
): string | null {
  if (!fromId || !toId) {
    return 'Both payer and receiver must be selected'
  }
  if (fromId === toId) {
    return 'Payer and receiver cannot be the same member'
  }
  if (isNaN(amountMajor) || amountMajor <= 0) {
    return 'Please enter a valid positive settlement amount'
  }
  return null
}

/**
 * Filters active members for selection, and ensures only valid group members are selected.
 */
export function filterValidParticipants<T extends MemberLike>(
  groupMembers: T[],
  selectedIds: number[]
): T[] {
  const groupMemberMap = new Map<number, T>(groupMembers.map(m => [m.id, m]))
  return selectedIds
    .map(id => groupMemberMap.get(id))
    .filter((m): m is T => m !== undefined && (m.is_active ?? true))
}

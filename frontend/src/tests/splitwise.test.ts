import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateEqualShares,
  validateExactShares,
  validatePercentageShares,
  calculatePercentageShares,
  validateSettlement,
  filterValidParticipants,
  type MemberLike,
} from '../utils/splitwiseUtils.ts'

describe('Phase 6C — Splitwise Frontend Utilities & Validation', () => {
  it('1. Equal split with even totals divides exactly', () => {
    const shares = calculateEqualShares(3000, [1, 2, 3])
    assert.strictEqual(shares.length, 3)
    assert.strictEqual(shares[0].share_minor, 1000)
    assert.strictEqual(shares[1].share_minor, 1000)
    assert.strictEqual(shares[2].share_minor, 1000)
    const sum = shares.reduce((acc, s) => acc + s.share_minor, 0)
    assert.strictEqual(sum, 3000)
  })

  it('2. Equal split with uneven totals allocates remainder to guarantee exact sum', () => {
    // 100 minor units (e.g. 1.00) split 3 ways: 34, 33, 33 = 100
    const shares = calculateEqualShares(100, [1, 2, 3])
    assert.strictEqual(shares.length, 3)
    assert.strictEqual(shares[0].share_minor, 34)
    assert.strictEqual(shares[1].share_minor, 33)
    assert.strictEqual(shares[2].share_minor, 33)
    const sum = shares.reduce((acc, s) => acc + s.share_minor, 0)
    assert.strictEqual(sum, 100)

    // 1000 minor units split 7 ways: 143 * 6 + 142 = 1000 (remainder is 6)
    const shares7 = calculateEqualShares(1000, [1, 2, 3, 4, 5, 6, 7])
    const sum7 = shares7.reduce((acc, s) => acc + s.share_minor, 0)
    assert.strictEqual(sum7, 1000)
    assert.strictEqual(shares7[0].share_minor, 143)
    assert.strictEqual(shares7[5].share_minor, 143)
    assert.strictEqual(shares7[6].share_minor, 142)
  })

  it('3. Exact-amount splits validate matching totals and reject mismatched totals', () => {
    const validShares = [
      { member_id: 1, share_minor: 1250 },
      { member_id: 2, share_minor: 750 },
    ]
    const validErr = validateExactShares(2000, validShares, 'USD')
    assert.strictEqual(validErr, null)

    const invalidShares = [
      { member_id: 1, share_minor: 1250 },
      { member_id: 2, share_minor: 700 }, // sum = 1950 != 2000
    ]
    const invalidErr = validateExactShares(2000, invalidShares, 'USD')
    assert.notStrictEqual(invalidErr, null)
    assert.match(invalidErr!, /does not match total expense/)
  })

  it('4. Percentage splits validate 100% total and calculate integer minor shares accurately', () => {
    const validPct = [
      { member_id: 1, percentage: 60 },
      { member_id: 2, percentage: 40 },
    ]
    assert.strictEqual(validatePercentageShares(validPct), null)

    const invalidPct = [
      { member_id: 1, percentage: 50 },
      { member_id: 2, percentage: 40 },
    ]
    const err = validatePercentageShares(invalidPct)
    assert.notStrictEqual(err, null)
    assert.match(err!, /Percentages must total 100%/)

    // Calculate percentage shares on 2500 paise (25.00) with 33.33% / 33.33% / 33.34%
    const threeWayPct = [
      { member_id: 1, percentage: 33.33 },
      { member_id: 2, percentage: 33.33 },
      { member_id: 3, percentage: 33.34 },
    ]
    const shares = calculatePercentageShares(2500, threeWayPct)
    const sum = shares.reduce((acc, s) => acc + s.share_minor, 0)
    assert.strictEqual(sum, 2500)
  })

  it('5. Selecting everyone vs a subset of members', () => {
    const allMembers: MemberLike[] = [
      { id: 1, name: 'Alice', is_active: true },
      { id: 2, name: 'Bob', is_active: true },
      { id: 3, name: 'Charlie', is_active: true },
    ]

    // Everyone
    const everyone = filterValidParticipants(allMembers, [1, 2, 3])
    assert.strictEqual(everyone.length, 3)

    // Subset: Alice and Charlie only
    const subset = filterValidParticipants(allMembers, [1, 3])
    assert.strictEqual(subset.length, 2)
    assert.deepStrictEqual(subset.map(m => m.id), [1, 3])

    // Non-member ID 999 is ignored
    const nonMember = filterValidParticipants(allMembers, [1, 999])
    assert.strictEqual(nonMember.length, 1)
    assert.strictEqual(nonMember[0].id, 1)

    // Inactive/departed member is filtered out
    const membersWithDeparted: MemberLike[] = [
      { id: 1, name: 'Alice', is_active: true },
      { id: 2, name: 'Dave (Departed)', is_active: false },
    ]
    const activeOnly = filterValidParticipants(membersWithDeparted, [1, 2])
    assert.strictEqual(activeOnly.length, 1)
    assert.strictEqual(activeOnly[0].id, 1)
  })

  it('6. Settlement validation prevents self-settlement and invalid amounts', () => {
    // Valid settlement
    assert.strictEqual(validateSettlement(1, 2, 50.0), null)

    // Self settlement
    const selfErr = validateSettlement(1, 1, 50.0)
    assert.notStrictEqual(selfErr, null)
    assert.match(selfErr!, /cannot be the same member/)

    // Zero or negative amount
    const zeroErr = validateSettlement(1, 2, 0)
    assert.notStrictEqual(zeroErr, null)
    assert.match(zeroErr!, /valid positive settlement amount/)

    const negErr = validateSettlement(1, 2, -10)
    assert.notStrictEqual(negErr, null)
  })
})

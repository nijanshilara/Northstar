import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  POPULAR_DESTINATIONS,
  matchDestinationScore,
  filterDestinations,
  type DestinationSuggestion,
} from '../utils/destinationMatching.ts'

describe('Destination Autocomplete Matching Logic', () => {
  describe('Requirement 3: "gan" query must strictly exclude Hyderabad and match real "gan" destinations', () => {
    it('returns Gangtok and Gandhinagar for "gan", but strictly excludes Hyderabad', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'gan')
      const names = results.map(r => r.name)

      // Must include valid destinations starting with or containing "gan" in name
      assert.ok(names.includes('Gangtok'), 'Should include Gangtok')
      assert.ok(names.includes('Gandhinagar'), 'Should include Gandhinagar')

      // Must NOT include Hyderabad (whose state is Telangana)
      assert.strictEqual(
        names.includes('Hyderabad'),
        false,
        'Hyderabad must not be returned when typing "gan"'
      )

      // Also ensure other unrelated cities like Mumbai, Paris, London are excluded
      assert.strictEqual(names.includes('Mumbai'), false)
      assert.strictEqual(names.includes('Paris'), false)
      assert.strictEqual(names.includes('London'), false)
    })

    it('score for Hyderabad with query "gan" is exactly 0', () => {
      const hyderabad = POPULAR_DESTINATIONS.find(d => d.name === 'Hyderabad')!
      assert.ok(hyderabad, 'Hyderabad must be in the dataset')
      const score = matchDestinationScore(hyderabad, 'gan')
      assert.strictEqual(score, 0, 'Hyderabad match score for "gan" must be 0')
    })
  })

  describe('Requirement 4: Typing "new" returns New Delhi, New York, New Jersey', () => {
    it('matches all destinations containing "new"', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'new')
      const names = results.map(r => r.name)

      assert.ok(names.includes('New Delhi'), 'Should match New Delhi')
      assert.ok(names.includes('New York'), 'Should match New York')
      assert.ok(names.includes('New Jersey'), 'Should match New Jersey')

      // Must exclude destinations that do not match "new"
      assert.strictEqual(names.includes('Paris'), false)
      assert.strictEqual(names.includes('Tokyo'), false)
      assert.strictEqual(names.includes('Bengaluru'), false)
    })
  })

  describe('Requirement 2: Case-insensitivity', () => {
    it('treats uppercase, lowercase and mixed case identically for "gan"', () => {
      const lower = filterDestinations(POPULAR_DESTINATIONS, 'gan')
      const upper = filterDestinations(POPULAR_DESTINATIONS, 'GAN')
      const mixed = filterDestinations(POPULAR_DESTINATIONS, 'gAn')

      assert.deepStrictEqual(lower, upper)
      assert.deepStrictEqual(lower, mixed)
    })

    it('treats uppercase, lowercase and mixed case identically for "new"', () => {
      const lower = filterDestinations(POPULAR_DESTINATIONS, 'new')
      const upper = filterDestinations(POPULAR_DESTINATIONS, 'NEW')
      const mixed = filterDestinations(POPULAR_DESTINATIONS, 'NeW')

      assert.deepStrictEqual(lower, upper)
      assert.deepStrictEqual(lower, mixed)
    })

    it('finds Hyderabad when searching "hyderabad", "HYDERABAD", or "HyDeRaBaD"', () => {
      const res1 = filterDestinations(POPULAR_DESTINATIONS, 'hyderabad')
      const res2 = filterDestinations(POPULAR_DESTINATIONS, 'HYDERABAD')
      const res3 = filterDestinations(POPULAR_DESTINATIONS, 'HyDeRaBaD')

      assert.ok(res1.some(r => r.name === 'Hyderabad'))
      assert.deepStrictEqual(res1, res2)
      assert.deepStrictEqual(res1, res3)
    })
  })

  describe('Requirement 6: Empty results when no matches exist', () => {
    it('returns empty array for non-matching queries without returning unrelated destinations', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'xyzqwe123')
      assert.strictEqual(results.length, 0, 'Must return 0 suggestions for non-matching query')
    })

    it('returns empty array for empty or whitespace query', () => {
      assert.deepStrictEqual(filterDestinations(POPULAR_DESTINATIONS, ''), [])
      assert.deepStrictEqual(filterDestinations(POPULAR_DESTINATIONS, '   '), [])
    })
  })

  describe('Explicit Country and Region Matching without Interior-Substring False Positives', () => {
    it('matches region by word-prefix (e.g. "Tel" matches Telangana -> Hyderabad)', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'Tel')
      const names = results.map(r => r.name)
      assert.ok(names.includes('Hyderabad'), 'Typing "Tel" should match Hyderabad via its region Telangana')
    })

    it('does NOT match region by arbitrary interior substring (e.g. "nat" in "Karnataka" does not match Bengaluru)', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'nat')
      const names = results.map(r => r.name)
      assert.strictEqual(names.includes('Bengaluru'), false, 'Typing "nat" must not match Bengaluru')
    })

    it('does match region by word prefix (e.g. "Karn" matches Karnataka -> Bengaluru)', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'Karn')
      const names = results.map(r => r.name)
      assert.ok(names.includes('Bengaluru'), 'Typing "Karn" should match Bengaluru via its region Karnataka')
    })

    it('matches country prefix or substring (e.g. "France" matches Paris)', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'France')
      const names = results.map(r => r.name)
      assert.ok(names.includes('Paris'), 'Typing "France" should return Paris')
    })

    it('matches country "USA" to US cities', () => {
      const results = filterDestinations(POPULAR_DESTINATIONS, 'USA')
      const names = results.map(r => r.name)
      assert.ok(names.includes('New York'))
      assert.ok(names.includes('San Francisco'))
    })
  })

  describe('Ranking and Scoring', () => {
    it('ranks exact name match highest', () => {
      const customList: DestinationSuggestion[] = [
        { name: 'Goa South', country: 'India' },
        { name: 'Goa', country: 'India' },
        { name: 'Old Goa', country: 'India' },
      ]
      const results = filterDestinations(customList, 'Goa')
      assert.strictEqual(results[0].name, 'Goa', 'Exact match "Goa" must be ranked first')
    })

    it('ranks prefix matches higher than interior substring matches', () => {
      const customList: DestinationSuggestion[] = [
        { name: 'East Newville', country: 'Fictional' },
        { name: 'New Delhi', country: 'India' },
      ]
      const results = filterDestinations(customList, 'New')
      assert.strictEqual(results[0].name, 'New Delhi', 'Prefix match must rank above interior substring match')
    })
  })
})

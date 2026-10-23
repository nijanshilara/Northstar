export interface DestinationSuggestion {
  name: string
  region?: string
  country: string
  category?: string
  emoji?: string
  latitude?: number
  longitude?: number
  timezone?: string
}

/**
 * Curated suggestions list covering major domestic (India) and international destinations.
 * Clearly treated as suggestions, not an exhaustive worldwide database.
 */
export const POPULAR_DESTINATIONS: DestinationSuggestion[] = [
  // India — Major Cities & Tourist Hubs
  { name: 'New Delhi', region: 'Delhi', country: 'India', category: 'Heritage & Capital', emoji: '🏛️' },
  { name: 'Goa', region: 'Goa', country: 'India', category: 'Beach & Nightlife', emoji: '🌴' },
  { name: 'Mumbai', region: 'Maharashtra', country: 'India', category: 'City & Coastal', emoji: '🏙️' },
  { name: 'Jaipur', region: 'Rajasthan', country: 'India', category: 'Cultural & Forts', emoji: '🏰' },
  { name: 'Bengaluru', region: 'Karnataka', country: 'India', category: 'Tech & Garden', emoji: '🌳' },
  { name: 'Gangtok', region: 'Sikkim', country: 'India', category: 'Himalayan Capital', emoji: '🏔️' },
  { name: 'Gandhinagar', region: 'Gujarat', country: 'India', category: 'Capital & Heritage', emoji: '🏛️' },
  { name: 'Hyderabad', region: 'Telangana', country: 'India', category: 'Heritage & Tech', emoji: '💎' },
  { name: 'Manali', region: 'Himachal Pradesh', country: 'India', category: 'Himalayan Mountain', emoji: '🏔️' },
  { name: 'Kerala Backwaters', region: 'Kerala', country: 'India', category: 'Nature & Lagoons', emoji: '🛶' },
  { name: 'Udaipur', region: 'Rajasthan', country: 'India', category: 'Lakes & Palaces', emoji: '👑' },
  { name: 'Kolkata', region: 'West Bengal', country: 'India', category: 'Culture & Food', emoji: '🎭' },
  { name: 'Varanasi', region: 'Uttar Pradesh', country: 'India', category: 'Spiritual & Ghats', emoji: '🪔' },
  { name: 'Agra', region: 'Uttar Pradesh', country: 'India', category: 'Taj Mahal & Forts', emoji: '🕌' },
  { name: 'Shimla', region: 'Himachal Pradesh', country: 'India', category: 'Hills & Pine', emoji: '🌲' },
  { name: 'Ooty', region: 'Tamil Nadu', country: 'India', category: 'Nilgiri Hills', emoji: '☕' },
  { name: 'Darjeeling', region: 'West Bengal', country: 'India', category: 'Tea & Kanchenjunga', emoji: '🍵' },
  { name: 'Rishikesh', region: 'Uttarakhand', country: 'India', category: 'Adventure & Yoga', emoji: '🧘' },
  { name: 'Amritsar', region: 'Punjab', country: 'India', category: 'Golden Temple & Food', emoji: '✨' },
  { name: 'Chennai', region: 'Tamil Nadu', country: 'India', category: 'Coastal & Temples', emoji: '🌊' },
  { name: 'Pune', region: 'Maharashtra', country: 'India', category: 'Western Ghats', emoji: '🌄' },
  { name: 'Kochi', region: 'Kerala', country: 'India', category: 'Spice Coast & Port', emoji: '⛵' },
  { name: 'Ladakh', region: 'Ladakh', country: 'India', category: 'High Desert & Monasteries', emoji: '🏔️' },
  { name: 'Pondicherry', region: 'Puducherry', country: 'India', category: 'French Colony & Beach', emoji: '🥐' },

  // International — Major Travel Destinations
  { name: 'New York', region: 'NY', country: 'USA', category: 'Metropolis & Arts', emoji: '🗽' },
  { name: 'New Jersey', region: 'NJ', country: 'USA', category: 'Metro & Coastal', emoji: '🌆' },
  { name: 'Paris', region: 'Île-de-France', country: 'France', category: 'Romance & Culture', emoji: '🗼' },
  { name: 'London', region: 'England', country: 'UK', category: 'Historic & Royal', emoji: '💂' },
  { name: 'Tokyo', region: 'Kanto', country: 'Japan', category: 'Modern & Traditional', emoji: '⛩️' },
  { name: 'Bangkok', region: 'Central', country: 'Thailand', category: 'Temples & Street Food', emoji: '🛺' },
  { name: 'Singapore', country: 'Singapore', category: 'Futuristic Garden', emoji: '🦁' },
  { name: 'Dubai', region: 'Emirate of Dubai', country: 'UAE', category: 'Luxury & Skyscrapers', emoji: '✨' },
  { name: 'Bali', region: 'Lesser Sunda', country: 'Indonesia', category: 'Tropical Island', emoji: '🌺' },
  { name: 'Rome', region: 'Lazio', country: 'Italy', category: 'Ancient Ruins & Vatican', emoji: '🏛️' },
  { name: 'Barcelona', region: 'Catalonia', country: 'Spain', category: 'Gaudí & Beach', emoji: '🎨' },
  { name: 'Amsterdam', region: 'North Holland', country: 'Netherlands', category: 'Canals & Museums', emoji: '🚲' },
  { name: 'Sydney', region: 'NSW', country: 'Australia', category: 'Opera House & Harbour', emoji: '🦘' },
  { name: 'San Francisco', region: 'CA', country: 'USA', category: 'Golden Gate & Bay', emoji: '🌉' },
  { name: 'Los Angeles', region: 'CA', country: 'USA', category: 'Entertainment & Coast', emoji: '🎬' },
  { name: 'Zurich', region: 'Zurich', country: 'Switzerland', category: 'Alps & Lake', emoji: '🏔️' },
]

/**
 * Calculates a match score for a destination given a query.
 * Returns > 0 if matched (higher = more relevant), or 0 if excluded.
 *
 * Rules:
 * 1. Matches destination name (case-insensitive substring).
 * 2. Matches country (case-insensitive substring).
 * 3. Matches region ONLY if the region starts with the query or a word in region starts with query.
 *    Arbitrary middle-of-the-word substrings in region (like 'gan' in 'Telangana') NEVER match.
 */
export function matchDestinationScore(item: DestinationSuggestion, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const nameLower = item.name.toLowerCase()
  const countryLower = item.country.toLowerCase()

  // 1. Exact match on destination name
  if (nameLower === q) return 100

  // 2. Name starts with query (e.g. "New" in "New Delhi", "Gan" in "Gangtok")
  if (nameLower.startsWith(q)) return 85

  // 3. Word in name starts with query (e.g. "Delhi" in "New Delhi" for "delhi")
  const nameWords = nameLower.split(/\s+/)
  if (nameWords.some(w => w.startsWith(q))) return 70

  // 4. Substring anywhere in destination name (e.g. "beach" in "Goa Beach", "bad" in "Hyderabad")
  if (nameLower.includes(q)) return 60

  // 5. Country starts with query (e.g. "Ind" in "India")
  if (countryLower.startsWith(q)) return 50

  // 6. Country contains query
  if (countryLower.includes(q)) return 40

  // 7. Explicit region word starts with query (e.g. "Sik" in "Sikkim", "Tel" in "Telangana")
  // Note: we do NOT do arbitrary middle-of-the-word substring matching on region names
  // (e.g. 'gan' in 'Telangana' must NOT match Hyderabad).
  if (item.region) {
    const regionLower = item.region.toLowerCase()
    const regionWords = regionLower.split(/\s+/)
    if (regionWords.some(w => w.startsWith(q))) return 30
  }

  return 0
}

/**
 * Filters and ranks destinations by relevance for the given query.
 */
export function filterDestinations(
  destinations: DestinationSuggestion[],
  query: string,
  limit = 6
): DestinationSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored: { item: DestinationSuggestion; score: number }[] = []
  const seen = new Set<string>()

  for (const item of destinations) {
    const score = matchDestinationScore(item, q)
    if (score > 0) {
      const key = `${item.name}-${item.country}`.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        scored.push({ item, score })
      }
    }
  }

  // Sort descending by relevance score, then alphabetically
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))

  return scored.slice(0, limit).map(s => s.item)
}

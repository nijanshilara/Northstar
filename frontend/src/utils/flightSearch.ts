/**
 * flightSearch.ts — Flight search parameter validation, formatting, and provider URL construction.
 * 
 * Provides honest, transparent deep-linking to major flight aggregators:
 * - Google Flights
 * - Skyscanner
 * - MakeMyTrip
 * 
 * Strictly preserves:
 * - One-way vs Round-trip modes (preventing one-way from carrying return dates).
 * - Departure and return dates (with timezone-safe local date handling).
 * - Passenger breakdowns: Adults, Children, Infants.
 * - Cabin classes: Economy, Premium Economy, Business, First Class.
 * - Origin & Destination airport codes and cities.
 */

export type TripType = 'one-way' | 'round-trip'

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first'

export interface PassengerCounts {
  adults: number
  children: number
  infants: number
}

export interface FlightSearchParams {
  origin: string
  dest: string
  tripType: TripType
  departureDate: string
  returnDate: string
  passengers: PassengerCounts
  cabin: CabinClass
}

export interface FlightValidationResult {
  isValid: boolean
  firstError: string | null
  errors: {
    origin?: string
    dest?: string
    departureDate?: string
    returnDate?: string
    passengers?: string
    general?: string
  }
}

export interface FlightProviderInfo {
  name: string
  url: string
  description: string
  badge: string
  badgeColor: string
  icon: string
  supportedFeatures: {
    oneWay: boolean
    roundTrip: boolean
    dates: boolean
    cabin: boolean
    adults: boolean
    children: boolean
    infants: boolean
  }
  limitations: string
}

export const FLIGHT_PROVIDERS: FlightProviderInfo[] = [
  {
    name: 'Google Flights',
    url: 'https://flights.google.com',
    description: 'Compare real-time fares across global airlines with interactive date grids and price tracking. No account or payment required.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#22c55e',
    icon: '✈️',
    supportedFeatures: {
      oneWay: true,
      roundTrip: true,
      dates: true,
      cabin: true,
      adults: true,
      children: true,
      infants: true,
    },
    limitations: 'Opens pre-filled Google Flights search. Direct airline booking, seat selection, and baggage add-ons complete on the airline website.',
  },
  {
    name: 'Skyscanner',
    url: 'https://www.skyscanner.com',
    description: 'Global aggregator indexing budget and legacy carriers, online travel agencies, and multi-airline combinations.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#3b82f6',
    icon: '🔍',
    supportedFeatures: {
      oneWay: true,
      roundTrip: true,
      dates: true,
      cabin: true,
      adults: true,
      children: true,
      infants: true,
    },
    limitations: 'Direct route path encodes dates and passenger counts. Child fares are initialized with standard age brackets.',
  },
  {
    name: 'MakeMyTrip',
    url: 'https://www.makemytrip.com/flights',
    description: 'Specialised for domestic Indian and international routes with INR (₹) fares, UPI payments, and Indian credit card instant discounts.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#f97316',
    icon: '🇮🇳',
    supportedFeatures: {
      oneWay: true,
      roundTrip: true,
      dates: true,
      cabin: true,
      adults: true,
      children: true,
      infants: true,
    },
    limitations: 'Pre-fills itinerary, adult/child/infant breakdown, and cabin code. 3-letter IATA codes (e.g. BOM, DEL, GOI) provide the highest routing accuracy.',
  },
  {
    name: 'Amadeus Developer API',
    url: 'https://developers.amadeus.com',
    description: 'In-app GDS flight search is optional and requires registered Amadeus API credentials in backend/.env. Use direct aggregators above for instant flight searches.',
    badge: 'Developer Notice',
    badgeColor: '#a855f7',
    icon: '🔧',
    supportedFeatures: {
      oneWay: true,
      roundTrip: true,
      dates: true,
      cabin: true,
      adults: true,
      children: false,
      infants: false,
    },
    limitations: 'Informational sandbox link. Live searches above do not require any developer keys or sign-up.',
  },
]

/**
 * Returns today's local calendar date formatted as YYYY-MM-DD.
 * Avoids UTC timezone conversion shifts (e.g. toISOString() giving yesterday/tomorrow).
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Extracts a 3-letter IATA airport code if present in the text (e.g. "Mumbai (BOM)" -> "BOM"),
 * or extracts clean city name.
 */
export function extractAirportOrCity(input: string): { code?: string; name: string } {
  const trimmed = (input || '').trim()
  if (!trimmed) return { name: '' }

  // Check for 3-letter code inside parentheses: "Mumbai (BOM)"
  const parenMatch = trimmed.match(/\(([A-Za-z]{3})\)/)
  if (parenMatch) {
    const code = parenMatch[1].toUpperCase()
    const name = trimmed.replace(/\s*\([A-Za-z]{3}\)\s*/, '').trim()
    return { code, name: name || code }
  }

  // Check if input itself is a 3-letter code: "BOM" or "JFK"
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const code = trimmed.toUpperCase()
    return { code, name: code }
  }

  return { name: trimmed }
}

/**
 * Formats YYYY-MM-DD date into YYMMDD for Skyscanner routes.
 */
export function formatDateYYMMDD(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[0].slice(2)}${parts[1]}${parts[2]}`
  }
  return dateStr
}

/**
 * Formats YYYY-MM-DD date into DD-MM-YYYY for MakeMyTrip searches.
 */
export function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return dateStr
}

/**
 * Comprehensive validation of flight search parameters.
 */
export function validateFlightSearch(
  params: FlightSearchParams,
  todayStr: string = getLocalDateString(),
): FlightValidationResult {
  const errors: FlightValidationResult['errors'] = {}

  const originTrimmed = (params.origin || '').trim()
  const destTrimmed = (params.dest || '').trim()

  // 1. Origin and Destination presence
  if (!originTrimmed) {
    errors.origin = 'Please enter an origin city or airport.'
  }
  if (!destTrimmed) {
    errors.dest = 'Please enter a destination city or airport.'
  }

  // 2. Origin and Destination identical check
  if (originTrimmed && destTrimmed) {
    const originInfo = extractAirportOrCity(originTrimmed)
    const destInfo = extractAirportOrCity(destTrimmed)

    const isSameCode = Boolean(originInfo.code && destInfo.code && originInfo.code === destInfo.code)
    const isSameName = originInfo.name.toLowerCase() === destInfo.name.toLowerCase()

    if (isSameCode || isSameName) {
      errors.dest = 'Origin and destination must be different cities.'
      errors.general = 'Origin and destination must be different cities.'
    }
  }

  // 3. Departure Date
  if (!params.departureDate) {
    errors.departureDate = 'Please select a departure date.'
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(params.departureDate)) {
    errors.departureDate = 'Invalid departure date format.'
  } else if (params.departureDate < todayStr) {
    errors.departureDate = 'Departure date cannot be in the past.'
  }

  // 4. Return Date (only required & validated for round-trip)
  if (params.tripType === 'round-trip') {
    if (!params.returnDate) {
      errors.returnDate = 'Please select a return date for a round-trip journey.'
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(params.returnDate)) {
      errors.returnDate = 'Invalid return date format.'
    } else if (params.departureDate && params.returnDate < params.departureDate) {
      errors.returnDate = 'Return date cannot be earlier than departure date.'
    }
  }

  // 5. Passengers
  const { adults = 1, children = 0, infants = 0 } = params.passengers || {}

  if (adults < 1) {
    errors.passengers = 'At least 1 adult passenger is required.'
  } else if (adults > 9) {
    errors.passengers = 'A maximum of 9 adult passengers is permitted.'
  } else if (children < 0 || infants < 0) {
    errors.passengers = 'Passenger counts cannot be negative.'
  } else if (infants > adults) {
    errors.passengers = 'Number of infants cannot exceed the number of accompanying adults (maximum 1 infant per adult on lap).'
  } else if (adults + children + infants > 9) {
    errors.passengers = 'A maximum of 9 total travellers is permitted per booking.'
  }

  const firstError =
    errors.origin ||
    errors.dest ||
    errors.general ||
    errors.departureDate ||
    errors.returnDate ||
    errors.passengers ||
    null

  return {
    isValid: firstError === null,
    firstError,
    errors,
  }
}

/**
 * Builds a search URL for Google Flights with exact route, dates, passenger count, and cabin class.
 */
export function buildGoogleFlightsUrl(params: FlightSearchParams): string {
  const originInfo = extractAirportOrCity(params.origin)
  const destInfo = extractAirportOrCity(params.dest)

  const originParam = encodeURIComponent(originInfo.code || originInfo.name || params.origin.trim())
  const destParam = encodeURIComponent(destInfo.code || destInfo.name || params.dest.trim())

  let query = `Flights+from+${originParam}+to+${destParam}`

  if (params.departureDate) {
    query += `+on+${params.departureDate}`
  }

  if (params.tripType === 'round-trip' && params.returnDate) {
    query += `+through+${params.returnDate}+round-trip`
  } else {
    // Explicitly add one-way to prevent Google Flights from auto-filling a return date
    query += `+one-way`
  }

  // Passengers
  const paxParts: string[] = []
  const { adults = 1, children = 0, infants = 0 } = params.passengers || {}
  if (adults > 0) {
    paxParts.push(`${adults}+adult${adults > 1 ? 's' : ''}`)
  }
  if (children > 0) {
    paxParts.push(`${children}+child${children > 1 ? 'ren' : ''}`)
  }
  if (infants > 0) {
    paxParts.push(`${infants}+infant${infants > 1 ? 's' : ''}`)
  }
  if (paxParts.length > 0) {
    query += `+for+${paxParts.join('+')}`
  }

  // Cabin Class
  const cabinGoogleMap: Record<CabinClass, string> = {
    economy: '',
    premium_economy: 'premium+economy',
    business: 'business+class',
    first: 'first+class',
  }
  const cabinPart = cabinGoogleMap[params.cabin]
  if (cabinPart) {
    query += `+${cabinPart}`
  }

  return `https://www.google.com/travel/flights?q=${query}`
}

/**
 * Builds a search URL for Skyscanner with path-encoded dates and query parameters.
 */
export function buildSkyscannerUrl(params: FlightSearchParams): string {
  const originInfo = extractAirportOrCity(params.origin)
  const destInfo = extractAirportOrCity(params.dest)

  const originParam = encodeURIComponent((originInfo.code || originInfo.name || params.origin.trim()).toLowerCase())
  const destParam = encodeURIComponent((destInfo.code || destInfo.name || params.dest.trim()).toLowerCase())

  const depYY = params.departureDate ? formatDateYYMMDD(params.departureDate) : ''
  const isRoundTrip = params.tripType === 'round-trip' && Boolean(params.returnDate)
  const retYY = isRoundTrip ? formatDateYYMMDD(params.returnDate) : ''

  let routePath = ''
  if (depYY && retYY) {
    routePath = `${depYY}/${retYY}/`
  } else if (depYY) {
    routePath = `${depYY}/`
  }

  const cabinSkyscannerMap: Record<CabinClass, string> = {
    economy: 'economy',
    premium_economy: 'premiumeconomy',
    business: 'business',
    first: 'first',
  }

  const { adults = 1, children = 0, infants = 0 } = params.passengers || {}
  const queryParams: string[] = [
    `adultsv2=${adults}`,
    `cabinclass=${cabinSkyscannerMap[params.cabin]}`,
    `rtn=${isRoundTrip ? '1' : '0'}`,
  ]

  if (children > 0) {
    queryParams.push(`childrenv2=${Array(children).fill('11').join('%7C')}`)
  }
  if (infants > 0) {
    queryParams.push(`infants=${infants}`)
  }

  return `https://www.skyscanner.com/transport/flights/${originParam}/${destParam}/${routePath}?${queryParams.join('&')}`
}

/**
 * Builds a search URL for MakeMyTrip with itinerary legs and passenger formatting.
 */
export function buildMakeMyTripUrl(params: FlightSearchParams): string {
  const originInfo = extractAirportOrCity(params.origin)
  const destInfo = extractAirportOrCity(params.dest)

  const o = encodeURIComponent(originInfo.code || originInfo.name || params.origin.trim())
  const d = encodeURIComponent(destInfo.code || destInfo.name || params.dest.trim())

  const depDD = params.departureDate ? formatDateDDMMYYYY(params.departureDate) : ''
  const retDD = params.returnDate ? formatDateDDMMYYYY(params.returnDate) : ''

  const { adults = 1, children = 0, infants = 0 } = params.passengers || {}
  const pax = `A-${adults}_C-${children}_I-${infants}`

  const cabinMMTMap: Record<CabinClass, string> = {
    economy: 'E',
    premium_economy: 'PE',
    business: 'B',
    first: 'F',
  }
  const cabinCode = cabinMMTMap[params.cabin]

  if (params.tripType === 'round-trip' && depDD && retDD) {
    return `https://www.makemytrip.com/flight/search?itinerary=${o}-${d}-${depDD}_${d}-${o}-${retDD}&tripType=R&paxType=${pax}&intl=false&cabinClass=${cabinCode}`
  } else if (depDD) {
    return `https://www.makemytrip.com/flight/search?itinerary=${o}-${d}-${depDD}&tripType=O&paxType=${pax}&intl=false&cabinClass=${cabinCode}`
  }

  return `https://www.makemytrip.com/flights/search?tripType=${params.tripType === 'round-trip' ? 'R' : 'O'}&from=${o}&to=${d}`
}

/**
 * Master dispatcher to generate the appropriate search URL.
 */
export function buildFlightSearchUrl(provider: string, params: FlightSearchParams): string {
  switch (provider) {
    case 'Google Flights':
      return buildGoogleFlightsUrl(params)
    case 'Skyscanner':
      return buildSkyscannerUrl(params)
    case 'MakeMyTrip':
      return buildMakeMyTripUrl(params)
    case 'Amadeus Developer API':
    default:
      return 'https://developers.amadeus.com'
  }
}

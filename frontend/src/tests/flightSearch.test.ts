import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  type FlightSearchParams,
  getLocalDateString,
  extractAirportOrCity,
  formatDateYYMMDD,
  formatDateDDMMYYYY,
  validateFlightSearch,
  buildGoogleFlightsUrl,
  buildSkyscannerUrl,
  buildMakeMyTripUrl,
  buildFlightSearchUrl,
  FLIGHT_PROVIDERS,
} from '../utils/flightSearch.ts'

describe('Flight Search Validation & Accuracy (Phase 6B)', () => {
  const TODAY = '2026-10-16'
  const FUTURE_DEP = '2026-11-10'

  const baseParams: FlightSearchParams = {
    origin: 'Mumbai (BOM)',
    dest: 'Goa (GOI)',
    tripType: 'one-way',
    departureDate: FUTURE_DEP,
    returnDate: '',
    passengers: { adults: 1, children: 0, infants: 0 },
    cabin: 'economy',
  }

  describe('1. Date Validation & Behavior', () => {
    it('validates a correct one-way search without requiring a return date', () => {
      const result = validateFlightSearch(baseParams, TODAY)
      assert.strictEqual(result.isValid, true)
      assert.strictEqual(result.firstError, null)
    })

    it('requires a return date for round-trip journeys', () => {
      const roundTripMissingReturn: FlightSearchParams = {
        ...baseParams,
        tripType: 'round-trip',
        returnDate: '',
      }
      const result = validateFlightSearch(roundTripMissingReturn, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /select a return date/i)
      assert.ok(result.errors.returnDate)
    })

    it('rejects return dates that occur before the departure date', () => {
      const invalidReturn: FlightSearchParams = {
        ...baseParams,
        tripType: 'round-trip',
        departureDate: '2026-11-15',
        returnDate: '2026-11-10',
      }
      const result = validateFlightSearch(invalidReturn, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /cannot be earlier than departure/i)
    })

    it('permits same-day round-trip flights (return date equals departure date)', () => {
      const sameDayReturn: FlightSearchParams = {
        ...baseParams,
        tripType: 'round-trip',
        departureDate: '2026-11-15',
        returnDate: '2026-11-15',
      }
      const result = validateFlightSearch(sameDayReturn, TODAY)
      assert.strictEqual(result.isValid, true)
      assert.strictEqual(result.firstError, null)
    })

    it('rejects departure dates that are in the past', () => {
      const pastFlight: FlightSearchParams = {
        ...baseParams,
        departureDate: '2026-10-10', // Prior to TODAY (2026-10-16)
      }
      const result = validateFlightSearch(pastFlight, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /cannot be in the past/i)
    })

    it('rejects missing departure date', () => {
      const missingDep: FlightSearchParams = {
        ...baseParams,
        departureDate: '',
      }
      const result = validateFlightSearch(missingDep, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /select a departure date/i)
    })

    it('rejects malformed date formats', () => {
      const malformed: FlightSearchParams = {
        ...baseParams,
        departureDate: 'invalid-date',
      }
      const result = validateFlightSearch(malformed, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /invalid departure date/i)
    })
  })

  describe('2. Origin & Destination Validation', () => {
    it('rejects empty or whitespace-only origin', () => {
      const emptyOrigin: FlightSearchParams = {
        ...baseParams,
        origin: '   ',
      }
      const result = validateFlightSearch(emptyOrigin, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /origin/i)
    })

    it('rejects empty or whitespace-only destination', () => {
      const emptyDest: FlightSearchParams = {
        ...baseParams,
        dest: '',
      }
      const result = validateFlightSearch(emptyDest, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /destination/i)
    })

    it('rejects identical origin and destination (case-insensitive)', () => {
      const sameCity: FlightSearchParams = {
        ...baseParams,
        origin: 'delhi',
        dest: 'DELHI',
      }
      const result = validateFlightSearch(sameCity, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /different cities/i)
    })

    it('rejects identical origin and destination when airport codes match', () => {
      const sameCode: FlightSearchParams = {
        ...baseParams,
        origin: 'Mumbai (BOM)',
        dest: 'BOM',
      }
      const result = validateFlightSearch(sameCode, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /different cities/i)
    })

    it('extracts airport IATA code or clean name accurately', () => {
      assert.deepStrictEqual(extractAirportOrCity('Mumbai (BOM)'), { code: 'BOM', name: 'Mumbai' })
      assert.deepStrictEqual(extractAirportOrCity('GOI'), { code: 'GOI', name: 'GOI' })
      assert.deepStrictEqual(extractAirportOrCity('Paris'), { name: 'Paris' })
      assert.deepStrictEqual(extractAirportOrCity(''), { name: '' })
    })
  })

  describe('3. Passenger Counts Validation', () => {
    it('requires at least 1 adult passenger', () => {
      const noAdults: FlightSearchParams = {
        ...baseParams,
        passengers: { adults: 0, children: 1, infants: 0 },
      }
      const result = validateFlightSearch(noAdults, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /at least 1 adult/i)
    })

    it('rejects more than 9 adults', () => {
      const tooManyAdults: FlightSearchParams = {
        ...baseParams,
        passengers: { adults: 10, children: 0, infants: 0 },
      }
      const result = validateFlightSearch(tooManyAdults, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /maximum of 9 adult/i)
    })

    it('rejects more than 9 total passengers', () => {
      const tooManyTotal: FlightSearchParams = {
        ...baseParams,
        passengers: { adults: 6, children: 3, infants: 2 },
      }
      const result = validateFlightSearch(tooManyTotal, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /maximum of 9 total/i)
    })

    it('rejects infants exceeding number of adults (max 1 infant per adult on lap)', () => {
      const moreInfantsThanAdults: FlightSearchParams = {
        ...baseParams,
        passengers: { adults: 1, children: 0, infants: 2 },
      }
      const result = validateFlightSearch(moreInfantsThanAdults, TODAY)
      assert.strictEqual(result.isValid, false)
      assert.match(result.firstError || '', /infants cannot exceed/i)
    })

    it('accepts valid multi-passenger family groups', () => {
      const family: FlightSearchParams = {
        ...baseParams,
        passengers: { adults: 2, children: 2, infants: 1 },
      }
      const result = validateFlightSearch(family, TODAY)
      assert.strictEqual(result.isValid, true)
    })
  })

  describe('4. One-Way Search URL Accuracy (No Stray Return Dates)', () => {
    it('Google Flights one-way URL does NOT include return date and explicitly marks one-way', () => {
      const params: FlightSearchParams = {
        ...baseParams,
        tripType: 'one-way',
        departureDate: '2026-11-05',
        returnDate: '2026-11-15', // even if state retained an old return date!
      }
      const url = buildGoogleFlightsUrl(params)
      assert.ok(url.includes('on+2026-11-05'))
      assert.ok(url.includes('one-way'))
      assert.strictEqual(url.includes('through'), false)
      assert.strictEqual(url.includes('2026-11-15'), false)
    })

    it('Skyscanner one-way URL contains single leg path and rtn=0', () => {
      const params: FlightSearchParams = {
        ...baseParams,
        tripType: 'one-way',
        departureDate: '2026-11-05',
        returnDate: '2026-11-15',
      }
      const url = buildSkyscannerUrl(params)
      // Path format: /transport/flights/bom/goi/261105/?...
      assert.ok(url.includes('/bom/goi/261105/'))
      assert.ok(url.includes('rtn=0'))
      assert.strictEqual(url.includes('261115'), false)
    })

    it('MakeMyTrip one-way URL sets tripType=O and single leg itinerary', () => {
      const params: FlightSearchParams = {
        ...baseParams,
        tripType: 'one-way',
        departureDate: '2026-11-05',
        returnDate: '2026-11-15',
      }
      const url = buildMakeMyTripUrl(params)
      assert.ok(url.includes('tripType=O'))
      assert.ok(url.includes('itinerary=BOM-GOI-05-11-2026'))
      // Itinerary parameter must NOT contain second return leg (which is joined with underscore in itinerary)
      const parsed = new URL(url)
      const itinerary = parsed.searchParams.get('itinerary') || ''
      assert.strictEqual(itinerary.includes('_'), false)
      assert.strictEqual(url.includes('15-11-2026'), false)
    })
  })

  describe('5. Return Search URL Accuracy (Both Legs Included)', () => {
    const returnParams: FlightSearchParams = {
      ...baseParams,
      tripType: 'round-trip',
      departureDate: '2026-11-05',
      returnDate: '2026-11-12',
    }

    it('Google Flights return URL includes departure, return date and round-trip', () => {
      const url = buildGoogleFlightsUrl(returnParams)
      assert.ok(url.includes('on+2026-11-05'))
      assert.ok(url.includes('through+2026-11-12'))
      assert.ok(url.includes('round-trip'))
    })

    it('Skyscanner return URL includes both date segments and rtn=1', () => {
      const url = buildSkyscannerUrl(returnParams)
      assert.ok(url.includes('/bom/goi/261105/261112/'))
      assert.ok(url.includes('rtn=1'))
    })

    it('MakeMyTrip return URL includes tripType=R and outbound + return leg', () => {
      const url = buildMakeMyTripUrl(returnParams)
      assert.ok(url.includes('tripType=R'))
      assert.ok(url.includes('itinerary=BOM-GOI-05-11-2026_GOI-BOM-12-11-2026'))
    })
  })

  describe('6. Passenger and Cabin Class Preservation', () => {
    const complexGroup: FlightSearchParams = {
      ...baseParams,
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'business',
    }

    it('carries passenger breakdown into MakeMyTrip URL', () => {
      const url = buildMakeMyTripUrl(complexGroup)
      assert.ok(url.includes('paxType=A-2_C-1_I-1'))
      assert.ok(url.includes('cabinClass=B'))
    })

    it('carries passenger counts and cabin into Skyscanner URL', () => {
      const url = buildSkyscannerUrl(complexGroup)
      assert.ok(url.includes('adultsv2=2'))
      assert.ok(url.includes('childrenv2=11'))
      assert.ok(url.includes('infants=1'))
      assert.ok(url.includes('cabinclass=business'))
    })

    it('carries passenger description and cabin into Google Flights query', () => {
      const url = buildGoogleFlightsUrl(complexGroup)
      assert.ok(url.includes('2+adults'))
      assert.ok(url.includes('1+child'))
      assert.ok(url.includes('1+infant'))
      assert.ok(url.includes('business+class'))
    })

    it('maps all cabin classes correctly', () => {
      const cabins: FlightSearchParams['cabin'][] = ['economy', 'premium_economy', 'business', 'first']

      for (const cabin of cabins) {
        const mmtUrl = buildMakeMyTripUrl({ ...baseParams, cabin })
        const skyUrl = buildSkyscannerUrl({ ...baseParams, cabin })
        const gglUrl = buildGoogleFlightsUrl({ ...baseParams, cabin })

        if (cabin === 'premium_economy') {
          assert.ok(mmtUrl.includes('cabinClass=PE'))
          assert.ok(skyUrl.includes('cabinclass=premiumeconomy'))
          assert.ok(gglUrl.includes('premium+economy'))
        } else if (cabin === 'business') {
          assert.ok(mmtUrl.includes('cabinClass=B'))
          assert.ok(skyUrl.includes('cabinclass=business'))
          assert.ok(gglUrl.includes('business+class'))
        } else if (cabin === 'first') {
          assert.ok(mmtUrl.includes('cabinClass=F'))
          assert.ok(skyUrl.includes('cabinclass=first'))
          assert.ok(gglUrl.includes('first+class'))
        } else {
          assert.ok(mmtUrl.includes('cabinClass=E'))
          assert.ok(skyUrl.includes('cabinclass=economy'))
        }
      }
    })
  })

  describe('7. Date Format Helpers & Timezone Safety', () => {
    it('formatDateYYMMDD correctly converts YYYY-MM-DD', () => {
      assert.strictEqual(formatDateYYMMDD('2026-11-05'), '261105')
      assert.strictEqual(formatDateYYMMDD(''), '')
    })

    it('formatDateDDMMYYYY correctly converts YYYY-MM-DD', () => {
      assert.strictEqual(formatDateDDMMYYYY('2026-11-05'), '05-11-2026')
      assert.strictEqual(formatDateDDMMYYYY(''), '')
    })

    it('getLocalDateString returns valid YYYY-MM-DD without timezone shifting', () => {
      const testDate = new Date(2026, 9, 16) // Oct 16, 2026 local
      const str = getLocalDateString(testDate)
      assert.strictEqual(str, '2026-10-16')
    })
  })

  describe('8. Honest Provider Attribution & No Fabricated Results', () => {
    it('all flight providers are labelled honestly as external search redirects or developer notices', () => {
      for (const p of FLIGHT_PROVIDERS) {
        assert.ok(
          p.badge.includes('External Search') || p.badge.includes('Developer Notice'),
          `${p.name} must be clearly designated as an external search redirect or developer notice`
        )
        assert.ok(p.limitations.length > 10, `${p.name} must disclose its limitations`)
      }
    })

    it('master URL dispatcher directs to proper providers', () => {
      const gUrl = buildFlightSearchUrl('Google Flights', baseParams)
      assert.ok(gUrl.startsWith('https://www.google.com/travel/flights'))

      const sUrl = buildFlightSearchUrl('Skyscanner', baseParams)
      assert.ok(sUrl.startsWith('https://www.skyscanner.com/transport/flights'))

      const mUrl = buildFlightSearchUrl('MakeMyTrip', baseParams)
      assert.ok(mUrl.startsWith('https://www.makemytrip.com/flight/search'))
    })
  })
})

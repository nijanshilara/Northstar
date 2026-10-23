import { useState } from 'react'
import {
  Train, Bus, Car, Navigation, ExternalLink,
  Search, Info, ShieldCheck, Route,
  CreditCard, Compass
} from 'lucide-react'
import DestinationInput from '../components/DestinationInput'

interface TransitProvider {
  name: string
  category: 'rail' | 'bus' | 'rideshare' | 'rental'
  country: string
  url: string
  description: string
  badge: string
  badgeColor: string
  icon: string
  searchUrl?: (origin: string, dest: string) => string
}

const TRANSIT_PROVIDERS: TransitProvider[] = [
  {
    name: 'IRCTC / ConfirmTkt',
    category: 'rail',
    country: 'India',
    url: 'https://www.confirmtkt.com',
    description: 'Official Indian Railways ticket search with live seat availability, PNR confirmation prediction, and Tatkal booking.',
    badge: 'Official Carrier · India',
    badgeColor: '#f97316',
    icon: '🚆',
    searchUrl: (origin, dest) =>
      `https://www.confirmtkt.com/rts/#/trainSearch/${encodeURIComponent(origin)}/${encodeURIComponent(dest)}`,
  },
  {
    name: 'The Trainline',
    category: 'rail',
    country: 'Europe & UK',
    url: 'https://www.thetrainline.com',
    description: 'Live schedules and ticket bookings across Eurostar, SNCF, Deutsche Bahn, Trenitalia, Renfe, and UK National Rail.',
    badge: 'Pan-European Rail',
    badgeColor: '#3b82f6',
    icon: '🚄',
    searchUrl: (origin, dest) =>
      `https://www.thetrainline.com/book/results?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`,
  },
  {
    name: 'Amtrak',
    category: 'rail',
    country: 'USA & Canada',
    url: 'https://www.amtrak.com',
    description: 'Intercity passenger train service connecting more than 500 destinations across the United States and Canadian borders.',
    badge: 'National Rail · USA',
    badgeColor: '#0284c7',
    icon: '🚆',
  },
  {
    name: 'RedBus',
    category: 'bus',
    country: 'India & SE Asia',
    url: 'https://www.redbus.in',
    description: 'Intercity AC sleeper, semi-sleeper, and state transport buses with live GPS tracking and passenger reviews.',
    badge: 'Intercity Bus',
    badgeColor: '#ef4444',
    icon: '🚌',
    searchUrl: (origin, dest) =>
      `https://www.redbus.in/bus-tickets/${encodeURIComponent(origin)}-to-${encodeURIComponent(dest)}`,
  },
  {
    name: 'FlixBus',
    category: 'bus',
    country: 'Europe & Americas',
    url: 'https://www.flixbus.com',
    description: 'Extensive low-cost intercity coach network across 40+ countries with free onboard Wi-Fi and power outlets.',
    badge: 'Budget Long-Distance',
    badgeColor: '#22c55e',
    icon: '🚍',
  },
  {
    name: 'Uber & Ola Cabs',
    category: 'rideshare',
    country: 'Global / India',
    url: 'https://m.uber.com',
    description: 'On-demand point-to-point cabs, rentals, and auto-rickshaws with upfront pricing and cashless digital payment.',
    badge: 'On-Demand Cabs',
    badgeColor: '#000000',
    icon: '🚕',
  },
  {
    name: 'Grab',
    category: 'rideshare',
    country: 'Southeast Asia',
    url: 'https://www.grab.com',
    description: 'The premier superapp for on-demand rides, taxis, food delivery, and local transit in Singapore, Thailand, Bali, and Vietnam.',
    badge: 'Essential SE Asia',
    badgeColor: '#10b981',
    icon: '🚗',
  },
  {
    name: 'DiscoverCars / Rentalcars',
    category: 'rental',
    country: 'Global',
    url: 'https://www.discovercars.com',
    description: 'Compare car rental rates across international and local brands with transparent deposit terms and full coverage options.',
    badge: 'Self-Drive Rental',
    badgeColor: '#6366f1',
    icon: '🚙',
  },
]

export default function Transport() {
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filteredProviders = TRANSIT_PROVIDERS.filter(p =>
    categoryFilter === 'all' || p.category === categoryFilter
  )

  const getGoogleMapsTransitUrl = () => {
    if (!origin && !dest) return 'https://www.google.com/maps'
    const o = encodeURIComponent(origin)
    const d = encodeURIComponent(dest)
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=transit`
  }

  const getGoogleMapsDrivingUrl = () => {
    if (!origin && !dest) return 'https://www.google.com/maps'
    const o = encodeURIComponent(origin)
    const d = encodeURIComponent(dest)
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Train size={24} style={{ color: 'var(--color-accent)' }} />
          Ground Transport & Transit Hub
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Compare trains, intercity buses, local metros, and rideshare options with verified direct booking links.
        </p>
      </div>

      {/* Notice */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl border text-sm"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
        <div style={{ color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Live Transit & Official Booking:</strong> We generate direct route queries for Google Maps Transit and official carriers.
          All ticket bookings and payments happen securely on the carrier’s platform — never through mock payments.
        </div>
      </div>

      {/* Route Finder Form */}
      <div
        className="p-5 rounded-xl border space-y-4 shadow-sm"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <Route size={16} style={{ color: 'var(--color-accent)' }} />
            Live Route & Transit Directions
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#22c55e22', color: '#16a34a' }}>
            ● Live Provider Search
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-20">
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--color-text-muted)' }}>
              From (Departure City or Station)
            </label>
            <DestinationInput
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              placeholder="e.g. Mumbai, New Delhi, Paris"
              value={origin}
              onChange={val => setOrigin(val)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--color-text-muted)' }}>
              To (Destination City or Station)
            </label>
            <DestinationInput
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              placeholder="e.g. Goa, Jaipur, Lyon"
              value={dest}
              onChange={val => setDest(val)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <a
            href={getGoogleMapsTransitUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-accent)' }}
          >
            <Navigation size={14} />
            {origin && dest ? `Find Public Transit on Google Maps` : 'Open Google Maps Transit'}
            <ExternalLink size={12} />
          </a>
          <a
            href={getGoogleMapsDrivingUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-bg)' }}
          >
            <Car size={14} />
            Driving & Cab Route
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium mr-1" style={{ color: 'var(--color-text-muted)' }}>Filter by mode:</span>
        {[
          { key: 'all', label: 'All Transport', icon: <Compass size={13} /> },
          { key: 'rail', label: 'Trains & Railways', icon: <Train size={13} /> },
          { key: 'bus', label: 'Intercity Buses', icon: <Bus size={13} /> },
          { key: 'rideshare', label: 'Taxis & Rideshare', icon: <Car size={13} /> },
          { key: 'rental', label: 'Car Rentals', icon: <Navigation size={13} /> },
        ].map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
            style={{
              background: categoryFilter === cat.key ? 'var(--color-accent)' : 'var(--color-card-bg)',
              borderColor: categoryFilter === cat.key ? 'var(--color-accent)' : 'var(--color-border)',
              color: categoryFilter === cat.key ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredProviders.map(p => {
          const searchHref = origin && dest && p.searchUrl ? p.searchUrl(origin, dest) : p.url
          return (
            <div
              key={p.name}
              className="p-5 rounded-xl border flex flex-col gap-3 hover:shadow-md transition-shadow"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${p.badgeColor}20`, color: p.badgeColor }}
                      >
                        {p.badge}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        • {p.country}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {p.description}
              </p>

              <div className="pt-2 mt-auto border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <ShieldCheck size={12} />
                  Direct Carrier
                </span>
                <a
                  href={searchHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <Search size={13} />
                  {origin && dest && p.searchUrl ? `Search ${origin} → ${dest}` : 'Open portal'}
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {/* Practical Tips */}
      <div
        className="p-5 rounded-xl border space-y-3"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <CreditCard size={16} style={{ color: 'var(--color-accent)' }} />
          Local Ground Transit Pro-Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
            <strong className="block mb-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>Metro & Subway</strong>
            Major systems (London Underground, NYC MTA, Singapore MRT, Sydney) accept contactless Visa/Mastercard directly at the turnstiles without buying tokens.
          </div>
          <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
            <strong className="block mb-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>Auto-Rickshaws & Taxis</strong>
            In India and Southeast Asia, always book via Ola/Uber Auto or Grab to avoid arbitrary tourist pricing, or insist on metered fare.
          </div>
          <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
            <strong className="block mb-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>High-Speed Rail</strong>
            Book Eurail or Indian Railways Tatkal/advance tickets 30–60 days ahead. Popular routes often sell out during peak summer and festival seasons.
          </div>
        </div>
      </div>
    </div>
  )
}
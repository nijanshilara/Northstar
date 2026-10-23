import { Hotel, ExternalLink, Info, Search } from 'lucide-react'
import { useState } from 'react'
import DestinationInput from '../components/DestinationInput'

const PROVIDERS = [
  {
    name: 'Booking.com',
    url: 'https://www.booking.com',
    description: 'Large global inventory with free cancellation options on many properties.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#3b82f6',
    icon: '🏨',
    searchUrl: (dest: string, checkin: string, checkout: string) =>
      `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}&checkin=${checkin}&checkout=${checkout}`,
  },
  {
    name: 'Airbnb',
    url: 'https://www.airbnb.com',
    description: 'Unique stays: apartments, villas, guesthouses and local homes.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#ef4444',
    icon: '🏡',
    searchUrl: (dest: string, checkin: string, checkout: string) =>
      `https://www.airbnb.com/s/${encodeURIComponent(dest)}/homes?checkin=${checkin}&checkout=${checkout}`,
  },
  {
    name: 'Agoda (Asia)',
    url: 'https://www.agoda.com',
    description: 'Best selection in South and Southeast Asia; strong India and Goa coverage.',
    badge: 'External Search Link (Redirect)',
    badgeColor: '#f97316',
    icon: '🌏',
    searchUrl: (dest: string) =>
      `https://www.agoda.com/search?city=${encodeURIComponent(dest)}`,
  },
  {
    name: 'Amadeus Hotels API',
    url: 'https://developers.amadeus.com/self-service/category/hotels',
    description: 'Real hotel availability and pricing API. Requires free Amadeus developer credentials. Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to backend/.env to enable in-app pricing.',
    badge: 'Live In-App API (Key Required)',
    badgeColor: '#a855f7',
    icon: '🔧',
    searchUrl: () => 'https://developers.amadeus.com/self-service/category/hotels',
  },
]

export default function Hotels() {
  const [dest, setDest] = useState('')
  const [checkin, setCheckin] = useState('')
  const [checkout, setCheckout] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Hotel size={22} style={{ color: 'var(--color-accent)' }} />
          Find Accommodation
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Search hotels, apartments and homestays through trusted providers. Bookings happen on the provider's site.
        </p>
      </div>

      {/* Notice */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl border text-sm"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
        <div style={{ color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>No fake bookings:</strong> This app does not process reservations or payments.
          We open the provider's site with your dates pre-filled. All prices, availability and policies come from the provider directly.
        </div>
      </div>

      {/* Search form */}
      <div
        className="p-5 rounded-xl border space-y-4"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <h2 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
          Quick Search
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-20">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Destination</label>
            <DestinationInput
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              placeholder="e.g. Goa, Paris, Tokyo"
              value={dest}
              onChange={val => setDest(val)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Check-in</label>
            <input
              type="date"
              min={todayStr}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              value={checkin}
              onChange={e => {
                setCheckin(e.target.value)
                if (checkout && e.target.value > checkout) {
                  setCheckout(e.target.value)
                }
              }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Check-out</label>
            <input
              type="date"
              min={checkin || todayStr}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              value={checkout}
              onChange={e => setCheckout(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROVIDERS.map(p => (
          <div
            key={p.name}
            className="p-5 rounded-xl border flex flex-col gap-3 hover:shadow-md transition-shadow"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-start gap-2">
              <span className="text-2xl">{p.icon}</span>
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.name}</h3>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: `${p.badgeColor}22`, color: p.badgeColor }}
                >
                  {p.badge}
                </span>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.description}</p>
            <a
              href={dest ? p.searchUrl(dest, checkin, checkout) : p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium mt-auto transition-opacity hover:opacity-80"
              style={{ color: 'var(--color-accent)' }}
            >
              <Search size={14} />
              {dest ? `Search in ${dest}` : 'Open website'}
              <ExternalLink size={12} />
            </a>
          </div>
        ))}
      </div>

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        ⚠️ Always read cancellation policies before booking. Prices vary — compare across providers for best value.
      </p>
    </div>
  )
}
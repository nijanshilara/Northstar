import { useState } from 'react'
import { MapPin, Clock, DollarSign, Star, ExternalLink, Search, Globe } from 'lucide-react'

interface Destination {
  name: string
  country: string
  emoji: string
  tagline: string
  bestFor: string[]
  bestTime: string
  budget: string
  highlights: string[]
  wikiUrl: string
}

const DESTINATIONS: Destination[] = [
  {
    name: 'Goa', country: 'India', emoji: '🏖️',
    tagline: 'Sun, sand and vibrant nightlife',
    bestFor: ['Beach', 'Food', 'Nightlife', 'History'],
    bestTime: 'Nov – Feb (dry season)',
    budget: '₹3,000 – ₹8,000/day',
    highlights: ['Baga & Palolem beaches', 'Fort Aguada', 'Dudhsagar Falls', 'Old Goa churches'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Goa',
  },
  {
    name: 'Paris', country: 'France', emoji: '🗼',
    tagline: 'The city of lights and romance',
    bestFor: ['Culture', 'Art', 'Food', 'Architecture'],
    bestTime: 'Apr – Jun, Sep – Oct',
    budget: '€80 – €200/day',
    highlights: ['Eiffel Tower', 'Louvre Museum', 'Montmartre', 'Seine River cruises'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Paris',
  },
  {
    name: 'Bali', country: 'Indonesia', emoji: '🌺',
    tagline: 'Island of Gods — spirituality and nature',
    bestFor: ['Spirituality', 'Nature', 'Surfing', 'Wellness'],
    bestTime: 'Apr – Oct (dry season)',
    budget: '$40 – $120/day',
    highlights: ['Ubud Rice Terraces', 'Tanah Lot Temple', 'Mount Batur', 'Seminyak beach'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Bali',
  },
  {
    name: 'Tokyo', country: 'Japan', emoji: '🗾',
    tagline: 'Ancient tradition meets futuristic city',
    bestFor: ['Culture', 'Food', 'Technology', 'Shopping'],
    bestTime: 'Mar – May (cherry blossom), Oct – Nov',
    budget: '¥8,000 – ¥20,000/day',
    highlights: ['Shibuya Crossing', 'Senso-ji Temple', 'Tsukiji Market', 'teamLab Borderless'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Tokyo',
  },
  {
    name: 'Barcelona', country: 'Spain', emoji: '🏛️',
    tagline: 'Gaudí, beaches and world-class food',
    bestFor: ['Architecture', 'Beach', 'Food', 'Nightlife'],
    bestTime: 'May – Jun, Sep – Oct',
    budget: '€60 – €150/day',
    highlights: ['Sagrada Família', 'Park Güell', 'La Boqueria market', 'Camp Nou'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Barcelona',
  },
  {
    name: 'Rajasthan', country: 'India', emoji: '🏰',
    tagline: 'Royal forts, deserts and colourful culture',
    bestFor: ['History', 'Culture', 'Adventure', 'Photography'],
    bestTime: 'Oct – Mar (cooler and dry)',
    budget: '₹2,500 – ₹7,000/day',
    highlights: ['Jaipur City Palace', 'Jaisalmer Fort', 'Pushkar camel fair', 'Udaipur lakes'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Rajasthan',
  },
  {
    name: 'Singapore', country: 'Singapore', emoji: '🌃',
    tagline: 'A world-class city for every traveller',
    bestFor: ['Family', 'Food', 'Shopping', 'Gardens'],
    bestTime: 'Feb – Apr (less rain)',
    budget: 'SGD 100 – 250/day',
    highlights: ['Gardens by the Bay', 'Marina Bay Sands', 'Hawker centres', 'Sentosa Island'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Singapore',
  },
  {
    name: 'Santorini', country: 'Greece', emoji: '🌅',
    tagline: 'Iconic sunsets over the Aegean Sea',
    bestFor: ['Romance', 'Photography', 'Wine', 'Beaches'],
    bestTime: 'Apr – Jun, Sep – Oct',
    budget: '€100 – €300/day',
    highlights: ['Oia sunset views', 'Black Sand beaches', 'Fira village', 'caldera boat tours'],
    wikiUrl: 'https://en.wikipedia.org/wiki/Santorini',
  },
]

const ALL_CATEGORIES = ['Beach', 'Culture', 'Food', 'Adventure', 'History', 'Nature', 'Family', 'Romance', 'Nightlife', 'Shopping']

export default function Explore() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filtered = DESTINATIONS.filter(d => {
    const matchSearch = !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.country.toLowerCase().includes(search.toLowerCase()) ||
      d.tagline.toLowerCase().includes(search.toLowerCase())
    const matchFilter = !activeFilter || d.bestFor.includes(activeFilter)
    return matchSearch && matchFilter
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Globe size={22} style={{ color: 'var(--color-accent)' }} />
          Explore Destinations
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Curated destination guides to inspire your next adventure.
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full font-medium" style={{ background: 'var(--color-accent-light, #ecfeff)', color: 'var(--color-accent)' }}>
            Curated Guides · Wikipedia Verified
          </span>
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1" style={{ maxWidth: 360 }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" style={{ color: 'var(--color-text-muted)' }} />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-xl border text-sm"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            placeholder="Search destinations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                background: activeFilter === cat ? 'var(--color-accent)' : 'var(--color-card-bg)',
                borderColor: activeFilter === cat ? 'var(--color-accent)' : 'var(--color-border)',
                color: activeFilter === cat ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>No destinations match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(d => (
            <div
              key={d.name}
              className="rounded-xl border flex flex-col overflow-hidden hover:shadow-lg transition-shadow"
              style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
            >
              {/* Header */}
              <div
                className="px-5 py-6 text-center"
                style={{ background: 'linear-gradient(135deg, var(--color-accent-light, #ecfeff), var(--color-card-bg))' }}
              >
                <div className="text-5xl mb-2">{d.emoji}</div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{d.name}</h2>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{d.country}</p>
                <p className="text-sm mt-2 italic" style={{ color: 'var(--color-text-secondary)' }}>{d.tagline}</p>
              </div>

              {/* Info */}
              <div className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {d.bestFor.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'var(--color-accent-light, #ecfeff)', color: 'var(--color-accent)' }}>
                      {t}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <div className="flex items-start gap-1.5">
                    <Clock size={12} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>Best time</div>
                      <div>{d.bestTime}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <DollarSign size={12} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>Budget</div>
                      <div>{d.budget}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--color-text-primary)' }}>
                    <Star size={11} />
                    Highlights
                  </p>
                  <ul className="space-y-1">
                    {d.highlights.map(h => (
                      <li key={h} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        <MapPin size={10} className="mt-0.5 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={d.wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <ExternalLink size={11} />
                  Learn more on Wikipedia
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
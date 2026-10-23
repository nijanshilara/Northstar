import { useState, useEffect } from 'react'
import {
  Shield, Phone, ExternalLink,
  CheckSquare, Square, Globe2, HeartPulse,
  Info, Lock
} from 'lucide-react'

interface EmergencyDirectory {
  country: string
  code: string
  flag: string
  generalEmergency: string
  police: string
  ambulance: string
  fire: string
  touristHelpline?: string
  notes?: string
}

const EMERGENCY_DIRECTORIES: EmergencyDirectory[] = [
  {
    country: 'India',
    code: 'IN',
    flag: '🇮🇳',
    generalEmergency: '112',
    police: '100 / 112',
    ambulance: '102 / 108',
    fire: '101',
    touristHelpline: '1363 (Toll Free, Multi-language)',
    notes: 'Dial 112 for all emergencies nationwide from any SIM or without SIM.',
  },
  {
    country: 'United States & Canada',
    code: 'US',
    flag: '🇺🇸',
    generalEmergency: '911',
    police: '911',
    ambulance: '911',
    fire: '911',
    notes: '911 handles dispatch for police, medical, and fire rescue across North America.',
  },
  {
    country: 'European Union & United Kingdom',
    code: 'EU',
    flag: '🇪🇺',
    generalEmergency: '112 (EU) / 999 (UK)',
    police: '112 / 999',
    ambulance: '112 / 999',
    fire: '112 / 999',
    notes: '112 works free of charge in all 27 EU member states, Switzerland, and the UK.',
  },
  {
    country: 'Japan',
    code: 'JP',
    flag: '🇯🇵',
    generalEmergency: '110 (Police) / 119 (Medical & Fire)',
    police: '110',
    ambulance: '119',
    fire: '119',
    touristHelpline: '050-3816-2787 (Japan Visitor Hotline)',
    notes: 'English support is available on emergency dispatches in Tokyo and major cities.',
  },
  {
    country: 'Australia & New Zealand',
    code: 'AU',
    flag: '🇦🇺',
    generalEmergency: '000 (AU) / 111 (NZ)',
    police: '000 / 111',
    ambulance: '000 / 111',
    fire: '000 / 111',
    notes: '000 is Australia’s primary national emergency number.',
  },
  {
    country: 'Thailand',
    code: 'TH',
    flag: '🇹🇭',
    generalEmergency: '191 (Police) / 1669 (Ambulance)',
    police: '191',
    ambulance: '1669',
    fire: '199',
    touristHelpline: '1155 (Tourist Police, English speaking)',
    notes: 'Tourist Police (1155) is dedicated to assisting international visitors.',
  },
]

const ADVISORY_PORTALS = [
  {
    country: 'United States',
    agency: 'U.S. Department of State',
    url: 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html',
    description: 'Level 1 to 4 travel advisories, entry restrictions, and passport alerts.',
  },
  {
    country: 'United Kingdom',
    agency: 'Foreign, Commonwealth & Development Office (FCDO)',
    url: 'https://www.gov.uk/foreign-travel-advice',
    description: 'Up-to-date safety, security, local laws, and healthcare advice for 226 countries.',
  },
  {
    country: 'India',
    agency: 'Ministry of External Affairs (MADAD)',
    url: 'https://www.mea.gov.in',
    description: 'Consular grievance monitoring system and Indian mission contacts worldwide.',
  },
  {
    country: 'Australia',
    agency: 'Smartraveller (DFAT)',
    url: 'https://www.smartraveller.gov.au',
    description: 'Reliable travel advisories and crisis response registration for travelers.',
  },
]

const DEFAULT_CHECKLIST = [
  { id: '1', text: 'Store digital copies of passport, visa, and insurance offline in phone and cloud', done: true },
  { id: '2', text: 'Notify your bank of international travel to prevent credit/debit card fraud freezes', done: true },
  { id: '3', text: 'Purchase comprehensive travel medical insurance with medical evacuation coverage', done: false },
  { id: '4', text: 'Save local emergency numbers and embassy address in your phone notes and wallet', done: false },
  { id: '5', text: 'Download offline Google Maps for your destination city and hotel area', done: false },
  { id: '6', text: 'Keep essential daily medication in original containers in carry-on bag with prescription', done: false },
  { id: '7', text: 'Share your live itinerary and contact details with trusted family or friends', done: false },
  { id: '8', text: 'Carry a secondary backup payment card kept separate from your primary wallet', done: false },
]

export default function Safety() {
  const [selectedCountry, setSelectedCountry] = useState<string>('India')
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_travel_safety_checklist')
      if (saved) {
        setChecklist(JSON.parse(saved))
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  const toggleCheck = (id: string) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, done: !item.done } : item)
      try {
        localStorage.setItem('ai_travel_safety_checklist', JSON.stringify(updated))
      } catch {
        // Ignore quota errors
      }
      return updated
    })
  }

  const activeDirectory = EMERGENCY_DIRECTORIES.find(d => d.country === selectedCountry) || EMERGENCY_DIRECTORIES[0]
  const completedCount = checklist.filter(c => c.done).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Shield size={24} style={{ color: 'var(--color-accent)' }} />
          Travel Safety & Emergency Directory
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Verified emergency response contacts, official government advisory registries, and essential traveler checklists.
        </p>
      </div>

      {/* Info notice */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl border text-sm"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
        <div style={{ color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Verified Emergency Directory:</strong> All emergency numbers below are official government hotlines. Keep them saved offline before your flight departs.
        </div>
      </div>

      {/* Emergency Contacts Directory */}
      <div
        className="p-5 rounded-xl border space-y-4 shadow-sm"
        style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <Phone size={16} style={{ color: 'var(--color-accent)' }} />
            National Emergency Dispatch Hotlines
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Select Destination:</span>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border outline-none cursor-pointer"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {EMERGENCY_DIRECTORIES.map(d => (
                <option key={d.country} value={d.country}>
                  {d.flag} {d.country}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Country Emergency Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border flex flex-col justify-between" style={{ background: '#ef444410', borderColor: '#ef444430' }}>
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">Universal / SOS</span>
            <span className="text-2xl font-bold text-red-600 my-1">{activeDirectory.generalEmergency}</span>
            <span className="text-xs text-red-700/80">Primary Dispatch</span>
          </div>
          <div className="p-3.5 rounded-xl border flex flex-col justify-between" style={{ background: '#3b82f610', borderColor: '#3b82f630' }}>
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Police</span>
            <span className="text-2xl font-bold text-blue-600 my-1">{activeDirectory.police}</span>
            <span className="text-xs text-blue-700/80">Law Enforcement</span>
          </div>
          <div className="p-3.5 rounded-xl border flex flex-col justify-between" style={{ background: '#10b98110', borderColor: '#10b98130' }}>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Ambulance</span>
            <span className="text-2xl font-bold text-emerald-600 my-1">{activeDirectory.ambulance}</span>
            <span className="text-xs text-emerald-700/80">Medical Emergency</span>
          </div>
          <div className="p-3.5 rounded-xl border flex flex-col justify-between" style={{ background: '#f9731610', borderColor: '#f9731630' }}>
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Fire Dept</span>
            <span className="text-2xl font-bold text-orange-600 my-1">{activeDirectory.fire}</span>
            <span className="text-xs text-orange-700/80">Rescue Services</span>
          </div>
        </div>

        {activeDirectory.touristHelpline && (
          <div className="p-3 rounded-lg border flex items-center justify-between text-xs" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Dedicated Tourist Police / Helpline:
            </span>
            <span className="font-bold text-sm" style={{ color: 'var(--color-accent)' }}>
              {activeDirectory.touristHelpline}
            </span>
          </div>
        )}

        {activeDirectory.notes && (
          <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
            Note: {activeDirectory.notes}
          </p>
        )}
      </div>

      {/* Two Column Layout: Official Advisory Portals & Interactive Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Official Government Advisory Links */}
        <div
          className="p-5 rounded-xl border space-y-4"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Globe2 size={16} style={{ color: 'var(--color-accent)' }} />
              Official Government Travel Advisories
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#3b82f620', color: '#2563eb' }}>
              Free Official Portals
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Always check official government sources for genuine security warnings, entry visa rules, and quarantine policies.
          </p>

          <div className="space-y-3">
            {ADVISORY_PORTALS.map(portal => (
              <a
                key={portal.agency}
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3.5 rounded-lg border transition-all hover:shadow-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {portal.agency}
                  </span>
                  <ExternalLink size={14} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div className="text-xs text-blue-600 font-medium mt-0.5">{portal.country}</div>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {portal.description}
                </p>
              </a>
            ))}
          </div>

          <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <HeartPulse size={14} className="text-red-500" />
              <span>International Health & Vaccines:</span>
              <a
                href="https://www.who.int/travel-advice"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:opacity-80"
                style={{ color: 'var(--color-accent)' }}
              >
                WHO Travel Advice Portal
              </a>
            </div>
          </div>
        </div>

        {/* Interactive Travel Preparedness Checklist */}
        <div
          className="p-5 rounded-xl border space-y-4 flex flex-col"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <CheckSquare size={16} style={{ color: 'var(--color-accent)' }} />
              Pre-Departure Safety Checklist
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#10b98120', color: '#059669' }}>
              {completedCount} of {checklist.length} completed
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(completedCount / checklist.length) * 100}%` }}
            />
          </div>

          <div className="space-y-2 flex-1">
            {checklist.map(item => (
              <button
                key={item.id}
                onClick={() => toggleCheck(item.id)}
                className="w-full text-left p-2.5 rounded-lg border flex items-start gap-2.5 transition-colors"
                style={{
                  borderColor: 'var(--color-border)',
                  background: item.done ? 'var(--color-bg)' : 'var(--color-card-bg)',
                  opacity: item.done ? 0.75 : 1,
                }}
              >
                {item.done ? (
                  <CheckSquare size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Square size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                )}
                <span
                  className={`text-xs leading-relaxed ${item.done ? 'line-through' : ''}`}
                  style={{ color: item.done ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
                >
                  {item.text}
                </span>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            <span className="flex items-center gap-1">
              <Lock size={12} />
              Saved automatically to browser storage
            </span>
            <button
              onClick={() => {
                const reset = DEFAULT_CHECKLIST.map(i => ({ ...i, done: false }))
                setChecklist(reset)
                localStorage.setItem('ai_travel_safety_checklist', JSON.stringify(reset))
              }}
              className="text-xs hover:underline"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Reset checklist
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
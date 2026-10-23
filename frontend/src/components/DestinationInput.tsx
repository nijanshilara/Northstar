import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, Plane, Check, Loader2, X } from 'lucide-react'
import {
  POPULAR_DESTINATIONS,
  type DestinationSuggestion,
  matchDestinationScore,
  filterDestinations
} from '../utils/destinationMatching'
import { API_BASE } from '../services/api'

export {
  POPULAR_DESTINATIONS,
  matchDestinationScore,
  filterDestinations
}
export type { DestinationSuggestion }

export interface DestinationInputProps {
  value?: string
  onChange: (value: string) => void
  onSelect?: (suggestion: DestinationSuggestion) => void
  placeholder?: string
  id?: string
  name?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}

export default function DestinationInput({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Enter city, state, or country…',
  id,
  name,
  className = '',
  style,
  disabled = false,
  required = false,
  autoFocus = false,
}: DestinationInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [apiSuggestions, setApiSuggestions] = useState<DestinationSuggestion[]>([])
  const [searchFailed, setSearchFailed] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Safe string value
  const safeValue = value ?? ''

  // Local fallback filtering for instant offline / short query matching
  const localFallback = useMemo(() => {
    return filterDestinations(POPULAR_DESTINATIONS, safeValue, 6)
  }, [safeValue])

  // Debounced API geocoding search (300ms)
  useEffect(() => {
    const query = safeValue.trim()
    if (query.length < 2) {
      setApiSuggestions([])
      setIsSearching(false)
      setSearchFailed(false)
      return
    }

    setIsSearching(true)
    setSearchFailed(false)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/weather/geocoding?q=${encodeURIComponent(query)}&count=8`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const results: DestinationSuggestion[] = (data.results || []).map((r: any) => ({
          name: r.name,
          region: r.region || undefined,
          country: r.country || '',
          latitude: r.latitude,
          longitude: r.longitude,
          timezone: r.timezone,
          category: r.category || 'City',
          emoji: '📍',
        }))
        setApiSuggestions(results)
      } catch (err) {
        // Fallback to local curated destinations on network/provider error
        setSearchFailed(true)
        setApiSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [safeValue])

  // Active suggestions: use live API suggestions if available, else local fallback
  const suggestions = useMemo(() => {
    if (safeValue.trim().length >= 2) {
      if (apiSuggestions.length > 0) return apiSuggestions
      if (searchFailed) return localFallback
      return isSearching ? [] : localFallback
    }
    return localFallback
  }, [safeValue, apiSuggestions, searchFailed, isSearching, localFallback])

  // Reset focus index whenever query changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [safeValue])

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setFocusedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (suggestion: DestinationSuggestion) => {
    const label = suggestion.country
      ? suggestion.region
        ? `${suggestion.name}, ${suggestion.region}, ${suggestion.country}`
        : `${suggestion.name}, ${suggestion.country}`
      : suggestion.name
    onChange(label)
    if (onSelect) {
      onSelect(suggestion)
    }
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setApiSuggestions([])
    setIsOpen(false)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || safeValue.trim().length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
        setFocusedIndex(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
      }
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        e.preventDefault()
        handleSelect(suggestions[focusedIndex])
      } else if (suggestions.length > 0) {
        e.preventDefault()
        handleSelect(suggestions[0])
      } else {
        setIsOpen(false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setFocusedIndex(-1)
    }
  }

  const shouldShowDropdown = isOpen && safeValue.trim().length > 0

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isOpen ? 'z-50' : 'z-auto'}`}
      style={{ zIndex: isOpen ? 9999 : undefined }}
    >
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          id={id}
          name={name}
          value={safeValue}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          className={className || 'input'}
          style={style}
          onChange={e => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (safeValue.trim()) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
        />

        {/* Right side controls: spinner, clear button, map pin icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {isSearching && (
            <Loader2 size={14} className="animate-spin text-accent-500" />
          )}
          {safeValue.trim().length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-surface-400 hover:text-surface-700 dark:hover:text-slate-200 transition-colors"
              title="Clear destination"
              tabIndex={-1}
            >
              <X size={13} />
            </button>
          )}
          {!isSearching && safeValue.trim().length === 0 && (
            <MapPin size={15} className="text-surface-400 pointer-events-none" />
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {shouldShowDropdown && (
        <ul
          role="listbox"
          aria-label="Destination suggestions"
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-2xl overflow-hidden text-sm bg-white dark:bg-slate-800 border-surface-200 dark:border-slate-700"
          style={{
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 99999,
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <li
            className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider border-b select-none flex items-center justify-between bg-surface-50 dark:bg-slate-900/60 border-surface-200 dark:border-slate-700 text-surface-600 dark:text-slate-400"
          >
            <span>Worldwide Destinations</span>
            <span className="text-[10px] lowercase font-normal opacity-75">
              {isSearching ? 'searching…' : '↑↓ to navigate · Enter to select'}
            </span>
          </li>

          {isSearching && suggestions.length === 0 ? (
            <li className="px-3.5 py-4 text-xs text-center text-surface-500 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin text-accent-500" />
              <span>Searching worldwide places…</span>
            </li>
          ) : suggestions.length === 0 ? (
            <li
              role="status"
              className="px-3.5 py-3 text-xs text-center select-none text-surface-500 dark:text-slate-400"
            >
              No matching destinations found for "{safeValue.trim()}". Press Enter to use your typed destination.
            </li>
          ) : (
            suggestions.map((item, idx) => {
              const isSelected = focusedIndex === idx
              const fullLabel = item.region
                ? `${item.name}, ${item.region}, ${item.country}`
                : item.country
                  ? `${item.name}, ${item.country}`
                  : item.name

              return (
                <li
                  key={`${item.name}-${item.region || ''}-${item.country}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={e => {
                    e.preventDefault()
                    handleSelect(item)
                  }}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-colors border-b last:border-b-0 border-surface-100 dark:border-slate-700/60 ${
                    isSelected
                      ? 'bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300'
                      : 'hover:bg-surface-50 dark:hover:bg-slate-700/30 text-surface-900 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base flex-shrink-0">{item.emoji || '📍'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs sm:text-sm truncate">
                        {item.name}
                        {item.region && (
                          <span className="ml-1 text-xs opacity-75 font-normal text-surface-500 dark:text-slate-400">
                            · {item.region}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] truncate text-surface-500 dark:text-slate-400">
                        {item.country}
                        {item.latitude !== undefined && item.longitude !== undefined && (
                          <span className="ml-1.5 opacity-60">
                            ({item.latitude.toFixed(2)}°, {item.longitude.toFixed(2)}°)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {fullLabel.toLowerCase() === safeValue.trim().toLowerCase() ? (
                      <Check size={14} className="text-accent-600 dark:text-accent-400" />
                    ) : (
                      <Plane size={13} className="opacity-30 text-surface-400" />
                    )}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

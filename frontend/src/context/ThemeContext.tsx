/**
 * ThemeContext — provides the active theme, palette, and setters to the whole app.
 *
 * Themes:
 *   'light'     — default; light backgrounds, dark text
 *   'dark'      — dark surfaces, light text (uses Tailwind darkMode:'class')
 *   'colourful' — travel-inspired vibrant palette, further customised by `palette`
 *
 * Palette (only meaningful when theme === 'colourful'):
 *   'ocean'    — teal / turquoise / blue
 *   'sunset'   — coral / orange / warm pink / purple
 *   'tropical' — emerald / aqua / lime / ocean blue
 *   'lavender' — lavender / violet / soft purple
 *   'rose'     — rose / berry / blush
 *   'forest'   — deep green / sage / earthy neutrals
 *   'custom'   — user-chosen accent hex
 *
 * Persistence: localStorage keys 'ai-travel-theme', 'ai-travel-palette', 'ai-travel-custom-accent'
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'colourful'
export type Palette = 'ocean' | 'sunset' | 'tropical' | 'lavender' | 'rose' | 'forest' | 'custom'

// CSS custom property tokens injected at :root for the colourful palette
export interface PaletteTokens {
  /** Primary button / key accent fill */
  accentFrom: string
  accentTo: string
  /** Sidebar background gradient */
  sidebarFrom: string
  sidebarTo: string
  /** Body gradient */
  bodyFrom: string
  bodyMid: string
  bodyTo: string
  /** Card border tint */
  cardBorder: string
  /** Page-title gradient */
  titleFrom: string
  titleTo: string
  /** Nav item text (on dark sidebar) */
  navText: string
  /** Input focus ring colour */
  focusRing: string
  /** Badge accent colours */
  badgeBg: string
  badgeText: string
  badgeBorder: string
}

export const PALETTES: Record<Exclude<Palette, 'custom'>, PaletteTokens> = {
  ocean: {
    accentFrom: '#0891b2', accentTo: '#0e7490',
    sidebarFrom: '#0c4a6e', sidebarTo: '#164e63',
    bodyFrom: '#f0f9ff', bodyMid: '#e0f7fa', bodyTo: '#ecfeff',
    cardBorder: 'rgba(8,145,178,0.15)',
    titleFrom: '#0891b2', titleTo: '#0e7490',
    navText: '#7dd3fc',
    focusRing: '#38bdf8',
    badgeBg: '#e0f7fa', badgeText: '#0e7490', badgeBorder: '#a5f3fc',
  },
  sunset: {
    accentFrom: '#f97316', accentTo: '#db2777',
    sidebarFrom: '#431407', sidebarTo: '#500724',
    bodyFrom: '#fff7ed', bodyMid: '#fdf2f8', bodyTo: '#fce7f3',
    cardBorder: 'rgba(249,115,22,0.15)',
    titleFrom: '#ea580c', titleTo: '#db2777',
    navText: '#fca5a5',
    focusRing: '#fb923c',
    badgeBg: '#fff1f2', badgeText: '#be185d', badgeBorder: '#fecdd3',
  },
  tropical: {
    accentFrom: '#10b981', accentTo: '#06b6d4',
    sidebarFrom: '#022c22', sidebarTo: '#083344',
    bodyFrom: '#ecfdf5', bodyMid: '#e0fdfa', bodyTo: '#f0f9ff',
    cardBorder: 'rgba(16,185,129,0.15)',
    titleFrom: '#10b981', titleTo: '#06b6d4',
    navText: '#6ee7b7',
    focusRing: '#34d399',
    badgeBg: '#ecfdf5', badgeText: '#047857', badgeBorder: '#a7f3d0',
  },
  lavender: {
    accentFrom: '#7c3aed', accentTo: '#a78bfa',
    sidebarFrom: '#2e1065', sidebarTo: '#1e1b4b',
    bodyFrom: '#f5f3ff', bodyMid: '#ede9fe', bodyTo: '#faf5ff',
    cardBorder: 'rgba(124,58,237,0.15)',
    titleFrom: '#7c3aed', titleTo: '#a855f7',
    navText: '#c4b5fd',
    focusRing: '#a78bfa',
    badgeBg: '#f5f3ff', badgeText: '#6d28d9', badgeBorder: '#ddd6fe',
  },
  rose: {
    accentFrom: '#e11d48', accentTo: '#be185d',
    sidebarFrom: '#4c0519', sidebarTo: '#3b0764',
    bodyFrom: '#fff1f2', bodyMid: '#fdf2f8', bodyTo: '#fae8ff',
    cardBorder: 'rgba(225,29,72,0.15)',
    titleFrom: '#e11d48', titleTo: '#be185d',
    navText: '#fda4af',
    focusRing: '#fb7185',
    badgeBg: '#fff1f2', badgeText: '#9f1239', badgeBorder: '#fecdd3',
  },
  forest: {
    accentFrom: '#166534', accentTo: '#15803d',
    sidebarFrom: '#052e16', sidebarTo: '#14532d',
    bodyFrom: '#f0fdf4', bodyMid: '#f7fee7', bodyTo: '#fefce8',
    cardBorder: 'rgba(22,101,52,0.15)',
    titleFrom: '#166534', titleTo: '#15803d',
    navText: '#86efac',
    focusRing: '#4ade80',
    badgeBg: '#f0fdf4', badgeText: '#166534', badgeBorder: '#bbf7d0',
  },
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  palette: Palette
  setPalette: (p: Palette) => void
  customAccent: string
  setCustomAccent: (hex: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => undefined,
  palette: 'ocean',
  setPalette: () => undefined,
  customAccent: '#6366f1',
  setCustomAccent: () => undefined,
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Hex → {r,g,b} */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative luminance (sRGB) */
function luminance([r, g, b]: [number, number, number]): number {
  const s = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}

/** Darken a hex colour by a fraction (0–1) */
function darken(hex: string, amount: number): string {
  let [r, g, b] = hexToRgb(hex)
  r = Math.max(0, Math.round(r * (1 - amount)))
  g = Math.max(0, Math.round(g * (1 - amount)))
  b = Math.max(0, Math.round(b * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Build a PaletteTokens from a custom hex accent */
function buildCustomTokens(hex: string): PaletteTokens {
  const dark = darken(hex, 0.25)
  const veryDark = darken(hex, 0.6)
  const lum = luminance(hexToRgb(hex))
  const badgeText = lum > 0.3 ? veryDark : dark
  return {
    accentFrom: hex, accentTo: dark,
    sidebarFrom: veryDark, sidebarTo: darken(hex, 0.45),
    bodyFrom: '#f8f9fa', bodyMid: '#f3f4f6', bodyTo: '#f9fafb',
    cardBorder: `${hex}26`,
    titleFrom: hex, titleTo: dark,
    navText: '#e2e8f0',
    focusRing: hex,
    badgeBg: '#f8f9fa', badgeText, badgeBorder: `${hex}40`,
  }
}

/** Inject CSS custom properties into <html> */
function applyPaletteTokens(tokens: PaletteTokens) {
  const root = document.documentElement
  root.style.setProperty('--cp-accent-from', tokens.accentFrom)
  root.style.setProperty('--cp-accent-to', tokens.accentTo)
  root.style.setProperty('--cp-sidebar-from', tokens.sidebarFrom)
  root.style.setProperty('--cp-sidebar-to', tokens.sidebarTo)
  root.style.setProperty('--cp-body-from', tokens.bodyFrom)
  root.style.setProperty('--cp-body-mid', tokens.bodyMid)
  root.style.setProperty('--cp-body-to', tokens.bodyTo)
  root.style.setProperty('--cp-card-border', tokens.cardBorder)
  root.style.setProperty('--cp-title-from', tokens.titleFrom)
  root.style.setProperty('--cp-title-to', tokens.titleTo)
  root.style.setProperty('--cp-nav-text', tokens.navText)
  root.style.setProperty('--cp-focus-ring', tokens.focusRing)
  root.style.setProperty('--cp-badge-bg', tokens.badgeBg)
  root.style.setProperty('--cp-badge-text', tokens.badgeText)
  root.style.setProperty('--cp-badge-border', tokens.badgeBorder)
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('ai-travel-theme')
    return (stored === 'light' || stored === 'dark' || stored === 'colourful') ? stored : 'light'
  })

  const [palette, setPaletteState] = useState<Palette>(() => {
    const stored = localStorage.getItem('ai-travel-palette')
    return (['ocean','sunset','tropical','lavender','rose','forest','custom'] as Palette[]).includes(stored as Palette)
      ? stored as Palette
      : 'ocean'
  })

  const [customAccent, setCustomAccentState] = useState<string>(() => {
    return localStorage.getItem('ai-travel-custom-accent') || '#6366f1'
  })

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('ai-travel-theme', t)
  }

  const setPalette = (p: Palette) => {
    setPaletteState(p)
    localStorage.setItem('ai-travel-palette', p)
  }

  const setCustomAccent = (hex: string) => {
    setCustomAccentState(hex)
    localStorage.setItem('ai-travel-custom-accent', hex)
  }

  // Sync data-theme attribute, Tailwind dark class, and CSS palette tokens
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    if (theme === 'colourful') {
      const tokens = palette === 'custom'
        ? buildCustomTokens(customAccent)
        : PALETTES[palette]
      applyPaletteTokens(tokens)
    }
  }, [theme, palette, customAccent])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, palette, setPalette, customAccent, setCustomAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

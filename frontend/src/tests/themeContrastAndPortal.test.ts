import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(currentDir, '..')

describe('Phase 8 — Theme Contrast & TopBar Profile Portal Audit', () => {

  // -------------------------------------------------------------------------
  // 1. TopBar Profile Dropdown Layering & Portal
  // -------------------------------------------------------------------------
  describe('1. TopBar Profile Dropdown Portal & Layering', () => {
    const topBarPath = path.resolve(srcDir, 'components/TopBar.tsx')
    const topBarSource = fs.readFileSync(topBarPath, 'utf8')

    it('renders profile dropdown via React portal directly to document.body', () => {
      assert.ok(
        topBarSource.includes('createPortal(') && topBarSource.includes('document.body'),
        'TopBar must use createPortal(..., document.body) to prevent stacking-context and clipping traps'
      )
    })

    it('assigns high z-index (999999) to dropdown portal', () => {
      assert.ok(
        topBarSource.includes('999999'),
        'Profile dropdown portal must have zIndex 999999 to render above all dashboard cards'
      )
    })

    it('implements Escape key dismissal', () => {
      assert.ok(
        topBarSource.includes("e.key === 'Escape'"),
        'TopBar must handle Escape key dismissal for accessibility'
      )
    })

    it('implements outside click dismissal and viewport anchoring', () => {
      assert.ok(
        topBarSource.includes('getBoundingClientRect()') &&
        topBarSource.includes('updateMenuPosition') &&
        topBarSource.includes('handleClickOutside'),
        'TopBar must dynamically anchor to button coordinates and dismiss on outside click'
      )
    })

    it('preserves all menu items: Account & Profile, History, and Sign out', () => {
      assert.ok(topBarSource.includes('/profile'), 'Must preserve Profile link')
      assert.ok(topBarSource.includes('/history'), 'Must preserve History link')
      assert.ok(topBarSource.includes('handleLogout'), 'Must preserve Sign out button')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Light & Colourful Theme Contrast in Sidebar
  // -------------------------------------------------------------------------
  describe('2. Sidebar & Navigation Contrast Verification', () => {
    const sidebarPath = path.resolve(srcDir, 'components/Sidebar.tsx')
    const sidebarSource = fs.readFileSync(sidebarPath, 'utf8')
    const cssPath = path.resolve(srcDir, 'index.css')
    const cssSource = fs.readFileSync(cssPath, 'utf8')

    it('does not have inline background override in Sidebar.tsx', () => {
      assert.ok(
        !sidebarSource.includes("background: 'var(--color-sidebar-bg"),
        'Sidebar.tsx must not override background inline so that gradients and theme rules apply cleanly'
      )
    })

    it('uses sidebar-container semantic class on aside', () => {
      assert.ok(
        sidebarSource.includes('sidebar-container'),
        'Sidebar aside must include sidebar-container class'
      )
    })

    it('guarantees rich gradient for sidebar in Colourful mode', () => {
      assert.ok(
        cssSource.includes('[data-theme="colourful"] aside.sidebar-container') &&
        cssSource.includes('linear-gradient(180deg, var(--cp-sidebar-from)'),
        'Colourful mode must apply rich sidebar gradient'
      )
    })

    it('guarantees high-contrast readable nav items in Colourful mode', () => {
      assert.ok(
        cssSource.includes('[data-theme="colourful"] .nav-item') &&
        cssSource.includes('rgba(255, 255, 255, 0.92)'),
        'Colourful mode nav items must have high-contrast light text on dark gradient'
      )
    })

    it('guarantees readable dark text for base nav items in Light mode', () => {
      assert.ok(
        cssSource.includes('text-surface-800') || cssSource.includes('#1e293b'),
        'Base nav items in Light mode must use readable dark text'
      )
    })

    it('provides explicit opaque styling for #profile-dropdown-portal in all themes', () => {
      assert.ok(
        cssSource.includes('#profile-dropdown-portal'),
        'index.css must style #profile-dropdown-portal'
      )
      assert.ok(
        cssSource.includes('[data-theme="dark"] #profile-dropdown-portal') &&
        cssSource.includes('[data-theme="colourful"] #profile-dropdown-portal'),
        'index.css must provide explicit theme contrast for #profile-dropdown-portal'
      )
    })
  })
})

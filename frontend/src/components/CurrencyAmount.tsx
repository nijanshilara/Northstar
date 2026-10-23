/**
 * CurrencyAmount.tsx — Reusable Multi-Currency Amount & Inline Conversion Display
 *
 * Requirements:
 * 1. Preserves original amount & currency.
 * 2. When currency differs from user's preferred currency (and showConvertedPrices is enabled),
 *    renders the converted equivalent immediately underneath (or inline if specified):
 *    €120.00
 *    ≈ ₹12,750 INR
 * 3. Does not display redundant duplicate conversions when currencies are identical.
 * 4. Zero-decimal handling for currencies like JPY.
 * 5. Interactive price popover on hover/click/touch:
 *    - Original amount and currency
 *    - Converted amount in preferred currency
 *    - Direct exchange rate (1 FROM = X TO)
 *    - Exchange-rate date / status
 *    - Link to /currency converter page
 *    - Accessible with Escape key and outside-click dismissal.
 */

import React, { useState, useRef, useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ExternalLink } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export interface CurrencyAmountProps {
  /** Numeric amount. Can be major (e.g. 120.00) or minor (e.g. 12000 paise/cents) */
  amount: number
  /** 3-letter currency code, e.g. 'EUR', 'USD', 'INR', 'JPY' */
  currency?: string
  /** Set to true if the amount is passed in integer minor units (paise/cents). Default: false */
  isMinor?: boolean
  /** CSS class for the primary/original price */
  className?: string
  /** CSS class for the secondary converted price */
  secondaryClassName?: string
  /** Render secondary conversion inline instead of stacked underneath. Default: false */
  inline?: boolean
  /** Disable the secondary conversion display explicitly */
  hideEquivalent?: boolean
  /** Enable hover/click interactive comparison popup. Default: true */
  interactive?: boolean
  /** Prefix string (e.g. "Starting from", "~") */
  prefix?: string
  /** Suffix string (e.g. "/ person", "/ night") */
  suffix?: string
  /** Additional wrapper class */
  wrapperClassName?: string
}

export default function CurrencyAmount({
  amount,
  currency = 'INR',
  isMinor = false,
  className = '',
  secondaryClassName = '',
  inline = false,
  hideEquivalent = false,
  interactive = true,
  prefix,
  suffix,
  wrapperClassName = '',
}: CurrencyAmountProps) {
  const { preferredCurrency, showConvertedPrices, convert, formatCurrency } = useCurrency()
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverId = useId()

  const cleanCurrency = (currency || 'INR').toUpperCase().trim()
  const isSameCurrency = cleanCurrency === preferredCurrency.toUpperCase().trim()
  const shouldShowEquivalent = !hideEquivalent && showConvertedPrices && !isSameCurrency

  // Perform conversion
  const conv = convert(amount, cleanCurrency, preferredCurrency, isMinor)
  const formattedOriginal = formatCurrency(amount, cleanCurrency, isMinor)
  const formattedConverted = formatCurrency(conv.convertedAmount, preferredCurrency, false)

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Mouse hover handlers with delay to prevent flickering
  const handleMouseEnter = () => {
    if (!interactive) return
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(true), 180)
  }

  const handleMouseLeave = () => {
    if (!interactive) return
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(false), 220)
  }

  const toggleOpen = (e: React.MouseEvent) => {
    if (!interactive) return
    e.stopPropagation()
    setIsOpen(prev => !prev)
  }

  return (
    <div
      className={`inline-flex relative ${inline ? 'flex-row items-baseline gap-1.5' : 'flex-col'} ${wrapperClassName}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Primary trigger button displaying original price */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={!interactive}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        title={interactive ? `Click for live exchange rate details (${cleanCurrency} ➔ ${preferredCurrency})` : undefined}
        className={`group text-left p-0 bg-transparent border-0 inline-flex items-baseline gap-1 transition-opacity ${
          interactive ? 'cursor-pointer hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded' : 'cursor-default'
        }`}
      >
        {prefix && <span className="text-surface-400 font-normal mr-0.5">{prefix}</span>}
        <span className={`font-semibold text-surface-900 dark:text-white ${className}`}>
          {formattedOriginal}
        </span>
        {suffix && <span className="text-surface-400 font-normal ml-0.5">{suffix}</span>}
      </button>

      {/* Secondary converted line — only when different currency & enabled */}
      {shouldShowEquivalent && (
        <span
          className={`text-xs font-medium text-surface-500 dark:text-surface-400 select-none ${
            inline ? 'opacity-90' : 'mt-0.5 leading-tight'
          } ${secondaryClassName}`}
        >
          {inline ? `(≈ ${formattedConverted})` : `≈ ${formattedConverted}`}
        </span>
      )}

      {/* Floating Price Comparison Popover */}
      {interactive && isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label="Currency exchange rate details"
          className="absolute z-50 bottom-full left-0 mb-2 w-72 sm:w-80 p-3.5 bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-surface-100 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ minWidth: '260px' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700">
            <span className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-1.5">
              <ArrowLeftRight size={13} className="text-accent-500" />
              Currency Conversion
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 font-mono">
              ECB Ref
            </span>
          </div>

          {/* Amount comparisons */}
          <div className="bg-surface-50 dark:bg-surface-900/60 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-surface-500 dark:text-surface-400">Original price:</span>
              <span className="font-semibold text-surface-900 dark:text-white">
                {formattedOriginal} <span className="text-[10px] text-surface-400 font-mono">{cleanCurrency}</span>
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-surface-200/50 dark:border-surface-700/50">
              <span className="text-surface-500 dark:text-surface-400">Equivalent in {preferredCurrency}:</span>
              <span className="font-bold text-accent-600 dark:text-accent-400 text-sm">
                ≈ {formattedConverted}
              </span>
            </div>
          </div>

          {/* Exchange rate detail */}
          <div className="space-y-1 text-[11px] text-surface-600 dark:text-surface-300">
            <div className="flex justify-between">
              <span className="text-surface-400">Exchange rate:</span>
              <span className="font-mono font-medium">
                1 {cleanCurrency} = {conv.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {preferredCurrency}
              </span>
            </div>
            <div className="flex justify-between text-surface-400 text-[10px]">
              <span>Rate date:</span>
              <span>{conv.date || 'Latest business day'}</span>
            </div>
          </div>

          {/* Transparent disclaimer */}
          <div className="text-[10px] text-surface-400 dark:text-surface-500 leading-normal pt-1 border-t border-surface-100 dark:border-surface-700">
            Reference rate for comparison only. Actual card issuer fees or merchant exchange rates may vary.
          </div>

          {/* Link to full Currency Converter */}
          <div className="pt-1 text-right">
            <Link
              to="/currency"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-600 dark:text-accent-400 hover:underline"
            >
              Open Currency Converter <ExternalLink size={10} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

"""
currency.py — Free Frankfurter / European Central Bank exchange-rate integration.

Frankfurter (api.frankfurter.dev) provides free, open reference exchange rates
published by the European Central Bank (ECB) with no API keys, billing or rate limits.

Features:
  1. Proxy for latest foreign exchange rates.
  2. In-memory caching with 1-hour TTL (ECB publishes rates once daily on business days).
  3. Last-known fallback cache for network resilience.
  4. Same-currency conversion handling (1:1 instant short-circuit).
  5. Official USD peg handling for AED (United Arab Emirates Dirham, pegged at 3.6725 AED/USD).
  6. Honest attribution and disclaimers (ECB daily reference rates, not second-by-second live rates).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import httpx

logger = logging.getLogger(__name__)

PRIMARY_API_URL = "https://api.frankfurter.dev/v1"
FALLBACK_API_URL = "https://api.frankfurter.app"

# Cache TTL: 1 hour (rates update once per business day around 16:00 CET)
CACHE_TTL_SECONDS = 3600

# AED is pegged by law to the US Dollar at 1 USD = 3.6725 AED (1 AED = 0.27229394 USD)
AED_USD_PEG_RATE = 3.6725

# Currencies supported by Frankfurter (ECB) + official peg
SUPPORTED_CURRENCIES: Dict[str, str] = {
    "USD": "United States Dollar",
    "INR": "Indian Rupee",
    "EUR": "Euro",
    "GBP": "British Pound",
    "JPY": "Japanese Yen",
    "AED": "UAE Dirham",
    "SGD": "Singapore Dollar",
    "AUD": "Australian Dollar",
    "CAD": "Canadian Dollar",
    "CHF": "Swiss Franc",
    "CNY": "Chinese Renminbi",
    "HKD": "Hong Kong Dollar",
    "NZD": "New Zealand Dollar",
    "KRW": "South Korean Won",
    "THB": "Thai Baht",
    "MYR": "Malaysian Ringgit",
    "IDR": "Indonesian Rupiah",
    "PHP": "Philippine Peso",
    "BRL": "Brazilian Real",
    "MXN": "Mexican Peso",
    "ZAR": "South African Rand",
    "TRY": "Turkish Lira",
    "SEK": "Swedish Krona",
    "NOK": "Norwegian Krone",
    "DKK": "Danish Krone",
    "PLN": "Polish Zloty",
    "CZK": "Czech Koruna",
    "HUF": "Hungarian Forint",
    "RON": "Romanian Leu",
    "ILS": "Israeli Shekel",
    "ISK": "Icelandic Króna",
}

POPULAR_CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AED", "SGD", "AUD", "CAD", "CHF"]

# In-memory caches:
# _RATES_CACHE[base] = (timestamp, {"date": "...", "rates": {...}})
_RATES_CACHE: Dict[str, tuple[float, dict[str, Any]]] = {}

# _LAST_KNOWN_RATES[base] = {"date": "...", "rates": {...}} (retained indefinitely as stale fallback)
_LAST_KNOWN_RATES: Dict[str, dict[str, Any]] = {}

# Currencies cache
_CURRENCIES_CACHE: Optional[tuple[float, dict[str, str]]] = None


async def get_supported_currencies() -> dict[str, Any]:
    """
    Fetch supported currencies from Frankfurter, merged with AED peg.
    Uses in-memory caching (24 hours).
    """
    global _CURRENCIES_CACHE
    now = time.time()

    if _CURRENCIES_CACHE and (now - _CURRENCIES_CACHE[0] < 86400):
        return {
            "currencies": _CURRENCIES_CACHE[1],
            "popular": POPULAR_CURRENCIES,
            "provider": "Frankfurter / European Central Bank",
            "cached": True,
        }

    currencies = dict(SUPPORTED_CURRENCIES)

    # Try fetching dynamic list from Frankfurter
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            resp = await client.get(f"{PRIMARY_API_URL}/currencies")
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    currencies.update(data)
                    # Ensure AED is present with descriptive label
                    currencies["AED"] = "UAE Dirham (Official USD Peg)"
                    _CURRENCIES_CACHE = (now, currencies)
    except Exception as exc:
        logger.warning("Could not refresh currencies list from Frankfurter, using built-in catalogue: %s", exc)

    return {
        "currencies": currencies,
        "popular": POPULAR_CURRENCIES,
        "provider": "Frankfurter / European Central Bank",
        "cached": bool(_CURRENCIES_CACHE),
    }


async def _fetch_rates_for_base(base: str) -> dict[str, Any]:
    """
    Fetch all exchange rates for a given base currency.
    Implements 1-hour caching and graceful stale-data fallback.
    """
    base = base.upper().strip()
    now = time.time()

    # 1. Check fresh cache
    if base in _RATES_CACHE:
        cached_time, cached_data = _RATES_CACHE[base]
        if now - cached_time < CACHE_TTL_SECONDS:
            return {
                **cached_data,
                "is_cached": True,
                "is_stale": False,
                "warning": None,
            }

    # 2. Handle AED as base currency via USD rates
    if base == "AED":
        usd_data = await _fetch_rates_for_base("USD")
        rates: dict[str, float] = {}
        for c, r in usd_data.get("rates", {}).items():
            # If 1 USD = r units of C, and 1 USD = 3.6725 AED, then 1 AED = r / 3.6725 units of C
            rates[c] = round(r / AED_USD_PEG_RATE, 6)
        rates["USD"] = round(1.0 / AED_USD_PEG_RATE, 6)
        rates["AED"] = 1.0

        aed_data = {
            "base": "AED",
            "date": usd_data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
            "rates": rates,
            "provider": "Frankfurter / European Central Bank",
            "note": f"AED rates derived from official UAE Central Bank peg (1 USD = {AED_USD_PEG_RATE} AED)",
        }
        _RATES_CACHE["AED"] = (now, aed_data)
        _LAST_KNOWN_RATES["AED"] = aed_data
        return {
            **aed_data,
            "is_cached": usd_data.get("is_cached", False),
            "is_stale": usd_data.get("is_stale", False),
            "warning": usd_data.get("warning"),
        }

    # 3. Fetch from Frankfurter API
    endpoints = [
        f"{PRIMARY_API_URL}/latest?base={base}",
        f"{FALLBACK_API_URL}/latest?base={base}",
    ]

    last_error: Optional[str] = None
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        for url in endpoints:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    rates = data.get("rates", {})
                    # If base is not USD and rates has USD, calculate AED rate automatically
                    if "USD" in rates:
                        rates["AED"] = round(rates["USD"] * AED_USD_PEG_RATE, 6)
                    elif base == "USD":
                        rates["AED"] = round(AED_USD_PEG_RATE, 6)
                    rates[base] = 1.0

                    payload = {
                        "base": base,
                        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
                        "rates": rates,
                        "provider": "Frankfurter / European Central Bank",
                    }
                    _RATES_CACHE[base] = (now, payload)
                    _LAST_KNOWN_RATES[base] = payload
                    return {
                        **payload,
                        "is_cached": False,
                        "is_stale": False,
                        "warning": None,
                    }
                else:
                    last_error = f"HTTP {resp.status_code}: {resp.text}"
            except Exception as e:
                last_error = str(e)
                logger.warning("Frankfurter fetch failed for %s from %s: %s", base, url, e)

    # 4. Fallback to last known rates if available
    if base in _LAST_KNOWN_RATES:
        stale_data = _LAST_KNOWN_RATES[base]
        return {
            **stale_data,
            "is_cached": True,
            "is_stale": True,
            "warning": f"Exchange rate service currently unreachable ({last_error}). Displaying cached reference rates from {stale_data.get('date')}.",
        }

    # If completely unavailable and no cache, raise RuntimeError with honest message
    raise RuntimeError(
        f"Unable to fetch exchange rates for {base} from Frankfurter / ECB. "
        f"Error: {last_error or 'Network timeout'}. Please verify connection and try again."
    )


async def convert_currency(
    from_currency: str,
    to_currency: str,
    amount: float = 1.0,
) -> dict[str, Any]:
    """
    Convert an amount from one currency to another using Frankfurter rates.
    Validates amounts, handles same-currency conversions, and transparently
    converts pegged currencies (AED).
    """
    from_curr = from_currency.upper().strip()
    to_curr = to_currency.upper().strip()

    if amount < 0:
        raise ValueError("Amount must be greater than or equal to 0.")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 1. Same-currency conversion: instant 1:1 short-circuit (zero network latency)
    if from_curr == to_curr:
        return {
            "from": from_curr,
            "to": to_curr,
            "amount": float(amount),
            "converted_amount": round(float(amount), 4),
            "rate": 1.0,
            "inverse_rate": 1.0,
            "date": today_str,
            "provider": "Frankfurter / European Central Bank",
            "is_cached": False,
            "is_stale": False,
            "warning": None,
            "note": "Same-currency conversion (1:1).",
            "disclaimer": "Reference rates are updated by the European Central Bank on working days around 16:00 CET.",
        }

    # 2. Fetch rates for the base currency
    rates_data = await _fetch_rates_for_base(from_curr)
    rates = rates_data.get("rates", {})

    if to_curr not in rates:
        # If to_curr is not directly in rates, check if we can cross-calculate via USD
        if "USD" in rates and to_curr == "AED":
            rate = round(rates["USD"] * AED_USD_PEG_RATE, 6)
        else:
            raise ValueError(
                f"Unsupported target currency '{to_curr}'. "
                f"Supported currencies include {', '.join(POPULAR_CURRENCIES)} and {len(SUPPORTED_CURRENCIES)} others."
            )
    else:
        rate = float(rates[to_curr])

    converted = round(amount * rate, 4)
    inverse_rate = round(1.0 / rate, 6) if rate > 0 else 0.0

    note = rates_data.get("note")
    if from_curr == "AED" or to_curr == "AED":
        if not note:
            note = f"AED conversion calculated via official UAE Central Bank peg (1 USD = {AED_USD_PEG_RATE} AED)."

    return {
        "from": from_curr,
        "to": to_curr,
        "amount": float(amount),
        "converted_amount": converted,
        "rate": rate,
        "inverse_rate": inverse_rate,
        "date": rates_data.get("date", today_str),
        "provider": rates_data.get("provider", "Frankfurter / European Central Bank"),
        "is_cached": rates_data.get("is_cached", False),
        "is_stale": rates_data.get("is_stale", False),
        "warning": rates_data.get("warning"),
        "note": note,
        "disclaimer": "Reference rates are updated by the European Central Bank on working days around 16:00 CET; not second-by-second live trading rates.",
    }

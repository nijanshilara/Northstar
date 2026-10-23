"""
currency.py — FastAPI Router for Currency Converter.

Endpoints:
  GET /api/currency/currencies  → List supported currencies with full names
  GET /api/currency/convert     → Convert amount from one currency to another
  GET /api/currency/rates       → Get reference rates table for a base currency
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.integrations.currency import (
    get_supported_currencies,
    convert_currency,
    _fetch_rates_for_base,
    SUPPORTED_CURRENCIES,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class CurrencyConversionResponse(BaseModel):
    from_currency: str = Field(..., serialization_alias="from")
    to_currency: str = Field(..., serialization_alias="to")
    amount: float
    converted_amount: float
    rate: float
    inverse_rate: float
    date: str
    provider: str
    is_cached: bool = False
    is_stale: bool = False
    warning: Optional[str] = None
    note: Optional[str] = None
    disclaimer: str

    model_config = {"populate_by_name": True}


@router.get("/currencies")
async def list_currencies():
    """
    Returns supported currency codes, localized names, and popular picks.
    """
    try:
        return await get_supported_currencies()
    except Exception as e:
        logger.error("Failed to list currencies: %s", e)
        return {
            "currencies": SUPPORTED_CURRENCIES,
            "popular": ["INR", "USD", "EUR", "GBP", "JPY", "AED", "SGD", "AUD", "CAD", "CHF"],
            "provider": "Frankfurter / European Central Bank",
            "cached": True,
        }


@router.get("/convert")
async def convert(
    from_curr: str = Query("USD", alias="from", description="Source currency code (e.g. USD)"),
    to_curr: str = Query("INR", alias="to", description="Target currency code (e.g. INR)"),
    amount: float = Query(1.0, ge=0.0, description="Amount to convert"),
):
    """
    Convert an amount from source currency to target currency.
    Uses free Frankfurter / European Central Bank rates proxy.
    """
    from_clean = from_curr.strip().upper()
    to_clean = to_curr.strip().upper()

    if not from_clean or len(from_clean) != 3:
        raise HTTPException(status_code=400, detail="Invalid source currency code. Must be a 3-letter code.")
    if not to_clean or len(to_clean) != 3:
        raise HTTPException(status_code=400, detail="Invalid target currency code. Must be a 3-letter code.")

    try:
        result = await convert_currency(
            from_currency=from_clean,
            to_currency=to_clean,
            amount=amount,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error("Currency conversion runtime error: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Exchange rate service is temporarily unavailable. Please try again later.",
        )
    except Exception as e:
        logger.error("Unexpected error in currency conversion: %s", e)
        raise HTTPException(status_code=500, detail="Internal currency conversion error.")


@router.get("/rates")
async def get_rates(
    base: str = Query("USD", description="Base currency code (e.g. USD, EUR, INR)"),
):
    """
    Get full exchange rates table for a given base currency.
    """
    base_clean = base.strip().upper()
    if not base_clean or len(base_clean) != 3:
        raise HTTPException(status_code=400, detail="Invalid base currency code.")

    try:
        return await _fetch_rates_for_base(base_clean)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Failed to fetch rates for %s: %s", base_clean, e)
        raise HTTPException(status_code=500, detail="Internal error fetching exchange rates.")

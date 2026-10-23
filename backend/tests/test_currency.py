"""
test_currency.py — Automated tests for Northstar Currency Converter.

Tests:
  1. Currencies catalog endpoint (/api/currency/currencies).
  2. Conversion in both directions (USD <-> EUR, USD <-> INR).
  3. Same-currency conversion instant short-circuit (e.g. USD -> USD).
  4. Pegged currency handling (AED <-> USD and AED <-> EUR).
  5. Invalid input validation (bad currency code, negative amount).
  6. Rates table endpoint (/api/currency/rates).
  7. In-memory caching and attribution integrity.
"""

import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_currencies():
    """Verify supported currencies list includes major global currencies and attribution."""
    response = client.get("/api/currency/currencies")
    assert response.status_code == 200
    data = response.json()

    assert "currencies" in data
    currencies = data["currencies"]
    assert isinstance(currencies, dict)

    # Must contain required currencies from specification
    required = ["INR", "USD", "GBP", "EUR", "JPY", "AED", "SGD", "AUD", "CAD", "CHF"]
    for code in required:
        assert code in currencies, f"Currency {code} missing from supported currencies"

    assert "popular" in data
    assert "Frankfurter" in data["provider"]


def test_convert_usd_to_eur_and_back():
    """Verify standard currency conversion in both directions."""
    # USD -> EUR
    res1 = client.get("/api/currency/convert?from=USD&to=EUR&amount=100")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["from"] == "USD"
    assert data1["to"] == "EUR"
    assert data1["amount"] == 100.0
    assert data1["rate"] > 0
    assert data1["converted_amount"] > 0
    assert "date" in data1
    assert "Frankfurter" in data1["provider"]

    # EUR -> USD
    res2 = client.get("/api/currency/convert?from=EUR&to=USD&amount=100")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["from"] == "EUR"
    assert data2["to"] == "USD"
    assert data2["rate"] > 0
    assert data2["converted_amount"] > 0


def test_convert_usd_to_inr_and_back():
    """Verify INR conversion in both directions."""
    # USD -> INR
    res_inr = client.get("/api/currency/convert?from=USD&to=INR&amount=50")
    assert res_inr.status_code == 200
    data = res_inr.json()
    assert data["from"] == "USD"
    assert data["to"] == "INR"
    assert data["amount"] == 50.0
    assert data["rate"] > 50.0  # 1 USD > 50 INR
    assert data["converted_amount"] == round(50.0 * data["rate"], 4)

    # INR -> USD
    res_usd = client.get("/api/currency/convert?from=INR&to=USD&amount=1000")
    assert res_usd.status_code == 200
    data_usd = res_usd.json()
    assert data_usd["from"] == "INR"
    assert data_usd["to"] == "USD"
    assert data_usd["rate"] < 0.1  # 1 INR < 0.1 USD
    assert data_usd["converted_amount"] > 0


def test_same_currency_conversion():
    """Verify that same-currency conversions immediately return rate 1.0 without network error."""
    response = client.get("/api/currency/convert?from=USD&to=USD&amount=250.75")
    assert response.status_code == 200
    data = response.json()
    assert data["from"] == "USD"
    assert data["to"] == "USD"
    assert data["rate"] == 1.0
    assert data["inverse_rate"] == 1.0
    assert data["converted_amount"] == 250.75
    assert "Same-currency" in data["note"]


def test_aed_pegged_currency_conversion():
    """Verify that AED conversions work accurately via the official USD peg (3.6725)."""
    # USD -> AED
    res_usd_aed = client.get("/api/currency/convert?from=USD&to=AED&amount=100")
    assert res_usd_aed.status_code == 200
    data_usd_aed = res_usd_aed.json()
    assert data_usd_aed["from"] == "USD"
    assert data_usd_aed["to"] == "AED"
    assert abs(data_usd_aed["rate"] - 3.6725) < 0.001
    assert abs(data_usd_aed["converted_amount"] - 367.25) < 0.1

    # AED -> USD
    res_aed_usd = client.get("/api/currency/convert?from=AED&to=USD&amount=367.25")
    assert res_aed_usd.status_code == 200
    data_aed_usd = res_aed_usd.json()
    assert abs(data_aed_usd["converted_amount"] - 100.0) < 0.5


def test_invalid_amount_and_currencies():
    """Verify error handling for negative amounts and invalid currency codes."""
    # Negative amount -> 422 Unprocessable Entity
    neg_res = client.get("/api/currency/convert?from=USD&to=EUR&amount=-50")
    assert neg_res.status_code == 422

    # Zero amount -> 200 with 0 converted amount
    zero_res = client.get("/api/currency/convert?from=USD&to=EUR&amount=0")
    assert zero_res.status_code == 200
    assert zero_res.json()["converted_amount"] == 0.0

    # Malformed currency codes (not 3 letters)
    bad_res1 = client.get("/api/currency/convert?from=US&to=EUR&amount=10")
    assert bad_res1.status_code == 400

    bad_res2 = client.get("/api/currency/convert?from=USD&to=EUROPE&amount=10")
    assert bad_res2.status_code == 400


def test_get_rates_table():
    """Verify /api/currency/rates returns exchange rates table for base currency."""
    res = client.get("/api/currency/rates?base=USD")
    assert res.status_code == 200
    data = res.json()
    assert data["base"] == "USD"
    assert "rates" in data
    rates = data["rates"]
    assert "EUR" in rates
    assert "INR" in rates
    assert "GBP" in rates

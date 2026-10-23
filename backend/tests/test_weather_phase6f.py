"""
test_weather_phase6f.py — Phase 6F Weather Accuracy & Reliability Audit Tests.

Verifies:
  1. Valid weather responses (current, hourly, 7-day daily forecast).
  2. Correct coordinates for selected destinations & bounds validation.
  3. Ambiguous locations & disambiguation (Paris, TX vs Paris, France; London, UK; geocoding failures).
  4. Destination-local dates and timezone handling.
  5. Missing, null, or malformed weather fields handling.
  6. API timeouts, rate limits (HTTP 429), and network errors.
  7. Cache freshness (10m TTL) and stale-data fallback labelling when refresh fails.
  8. Honest unavailable states & input validation rejection (coordinates out of bounds, missing query).
  9. AI enrich-itinerary integration: weather context provided, probabilistic rules enforced, no hallucinated auto-rescheduling.
  10. Live provider test verifying real Open-Meteo endpoint (clearly distinguished from mocked tests).

Tests use an isolated SQLite test database and mock HTTP requests for deterministic execution,
with one explicit live test validating Open-Meteo contract.
"""

from __future__ import annotations

import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import httpx

from app.main import app
from app.database.session import Base, get_db
from app.models.base import Trip, Activity, ActivityCategory
from app.integrations.weather import (
    fetch_forecast,
    geocode_worldwide,
    geocode_city,
    validate_coordinates,
    _FORECAST_CACHE,
    CACHE_TTL_SECONDS,
)

# ---------------------------------------------------------------------------
# Isolated Test Database
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///./test_weather_6f.db"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=engine_test)
    _FORECAST_CACHE.clear()
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)
    _FORECAST_CACHE.clear()


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Mock Payloads
# ---------------------------------------------------------------------------
MOCK_OPEN_METEO_FORECAST = {
    "latitude": 35.689,
    "longitude": 139.692,
    "timezone": "Asia/Tokyo",
    "current": {
        "time": "2026-10-16T12:00",
        "temperature_2m": 21.5,
        "relative_humidity_2m": 55,
        "apparent_temperature": 21.0,
        "is_day": 1,
        "precipitation": 0.0,
        "weather_code": 1,
        "wind_speed_10m": 12.4,
    },
    "hourly": {
        "time": [f"2026-10-16T{h:02d}:00" for h in range(24)],
        "temperature_2m": [18.0 + (h * 0.2) for h in range(24)],
        "weather_code": [1] * 24,
        "precipitation_probability": [5] * 24,
    },
    "daily": {
        "time": [f"2026-10-{16+i}" for i in range(7)],
        "temperature_2m_max": [22.0, 23.5, 20.0, 19.5, 21.0, 22.0, 23.0],
        "temperature_2m_min": [14.0, 15.0, 13.5, 12.0, 13.0, 14.5, 15.0],
        "precipitation_sum": [0.0, 0.0, 4.5, 0.0, 0.0, 1.2, 0.0],
        "precipitation_probability_max": [10, 5, 80, 20, 15, 60, 10],
        "weather_code": [1, 2, 61, 3, 1, 80, 0],
        "wind_speed_10m_max": [15.0, 12.0, 25.0, 18.0, 14.0, 16.0, 10.0],
        "uv_index_max": [5.5, 6.0, 2.5, 4.0, 5.0, 3.5, 6.0],
        "sunrise": [f"2026-10-{16+i}T05:48" for i in range(7)],
        "sunset": [f"2026-10-{16+i}T17:05" for i in range(7)],
    },
}


class MockResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://api.open-meteo.com/v1/forecast")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(f"HTTP {self.status_code}", request=request, response=response)

    def json(self):
        return self._data


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_1_valid_weather_response_structure():
    """1. Test that valid weather forecast returns current, hourly, and 7-day daily data."""
    with patch("httpx.AsyncClient.get", return_value=MockResponse(MOCK_OPEN_METEO_FORECAST)):
        res = await fetch_forecast(lat=35.689, lon=139.692, city="Tokyo")
        assert res["error"] is None
        assert res["city_name"] == "Tokyo"
        assert res["timezone"] == "Asia/Tokyo"
        assert res["cached"] is False
        assert res["is_stale"] is False
        assert res["data_type"] == "WEATHER_FORECAST"

        # Current conditions
        curr = res["current"]
        assert curr["temperature_c"] == 21.5
        assert curr["condition"] == "Mainly clear"
        assert curr["is_day"] is True

        # Hourly
        assert len(res["hourly"]) == 24
        assert res["hourly"][0]["time"] == "2026-10-16T00:00"

        # Daily (exactly 7 days)
        assert len(res["days"]) == 7
        assert res["days"][0]["date"] == "2026-10-16"
        assert res["days"][0]["temp_max_c"] == 22.0
        assert res["days"][0]["precipitation_probability_max"] == 10
        assert res["days"][0]["sunrise"] == "2026-10-16T05:48"


def test_2_coordinate_validation_and_bounds():
    """2. Test latitude and longitude validation within geographic ranges."""
    # Valid
    ok, err = validate_coordinates(28.6139, 77.2090)
    assert ok is True and err is None

    # Latitude out of bounds
    ok, err = validate_coordinates(90.5, 0)
    assert ok is False
    assert "Latitude 90.5 is out of range" in err

    ok, err = validate_coordinates(-95.0, 0)
    assert ok is False
    assert "Latitude -95.0 is out of range" in err

    # Longitude out of bounds
    ok, err = validate_coordinates(0, 185.0)
    assert ok is False
    assert "Longitude 185.0 is out of range" in err

    ok, err = validate_coordinates(0, -181.0)
    assert ok is False
    assert "Longitude -181.0 is out of range" in err

    # Missing or NaN
    ok, err = validate_coordinates(None, 50)
    assert ok is False
    assert "required" in err

    ok, err = validate_coordinates(float("nan"), 50)
    assert ok is False
    assert "NaN" in err


@pytest.mark.asyncio
async def test_3_ambiguous_locations_and_geocoding_disambiguation():
    """3. Test disambiguation of ambiguous city names using country/state qualifiers."""
    # Mock Open-Meteo geocoding search results for "Paris"
    mock_paris_results = {
        "results": [
            {
                "name": "Paris",
                "country": "France",
                "country_code": "FR",
                "admin1": "Île-de-France",
                "latitude": 48.8534,
                "longitude": 2.3488,
                "timezone": "Europe/Paris",
            },
            {
                "name": "Paris",
                "country": "United States",
                "country_code": "US",
                "admin1": "Texas",
                "latitude": 33.6609,
                "longitude": -95.5555,
                "timezone": "America/Chicago",
            },
            {
                "name": "Paris",
                "country": "United States",
                "country_code": "US",
                "admin1": "Tennessee",
                "latitude": 36.302,
                "longitude": -88.3267,
                "timezone": "America/Chicago",
            },
        ]
    }

    with patch("httpx.AsyncClient.get", return_value=MockResponse(mock_paris_results)):
        # 3a. Searching "Paris, TX" matches Texas, US via abbreviation
        res_tx = await geocode_worldwide("Paris, TX", count=1)
        assert len(res_tx) == 1
        assert res_tx[0]["country"] == "United States"
        assert res_tx[0]["region"] == "Texas"
        assert res_tx[0]["latitude"] == 33.6609

        # 3b. Searching "Paris, France" matches France
        res_fr = await geocode_worldwide("Paris, France", count=1)
        assert len(res_fr) == 1
        assert res_fr[0]["country"] == "France"
        assert res_fr[0]["latitude"] == 48.8534

        # 3c. Searching an impossible country qualification returns empty (no silent fallback!)
        res_none = await geocode_worldwide("Paris, Australia", count=1)
        assert len(res_none) == 0


@pytest.mark.asyncio
async def test_4_destination_local_dates_and_timezone_handling():
    """4. Test that local timezone returned by provider is respected without UTC date shift."""
    tokyo_mock = dict(MOCK_OPEN_METEO_FORECAST)
    with patch("httpx.AsyncClient.get", return_value=MockResponse(tokyo_mock)):
        res = await fetch_forecast(lat=35.689, lon=139.692, city="Tokyo")
        assert res["timezone"] == "Asia/Tokyo"
        # Dates should match the destination's daily forecast array
        assert res["days"][0]["date"] == "2026-10-16"
        assert res["days"][6]["date"] == "2026-10-22"


@pytest.mark.asyncio
async def test_5_missing_and_malformed_weather_fields_handled_safely():
    """5. Test that nulls, missing keys, and sparse weather fields do not crash the integration."""
    sparse_data = {
        "timezone": "UTC",
        "current": {
            "temperature_2m": None,
            "weather_code": None,
        },
        "daily": {
            "time": ["2026-10-16"],
            "temperature_2m_max": [None],
            "temperature_2m_min": [None],
            "weather_code": [None],
            # Precipitation and UV omitted entirely
        },
        "hourly": {
            "time": ["2026-10-16T00:00"],
            "temperature_2m": [None],
        },
    }
    with patch("httpx.AsyncClient.get", return_value=MockResponse(sparse_data)):
        res = await fetch_forecast(lat=0.0, lon=0.0, city="Null Island")
        assert res["error"] is None
        assert res["current"]["temperature_c"] is None
        assert res["current"]["condition"] == "Clear sky"  # Default 0
        assert len(res["days"]) == 1
        assert res["days"][0]["temp_max_c"] is None
        assert res["days"][0]["uv_index"] is None


@pytest.mark.asyncio
async def test_6_api_timeouts_rate_limits_and_network_failures():
    """6. Test handling of timeouts, HTTP 429 rate limits, and network errors."""
    # 6a. Timeout
    with patch("httpx.AsyncClient.get", side_effect=httpx.TimeoutException("Connection timed out")):
        res_timeout = await fetch_forecast(lat=10.0, lon=10.0, city="Timeout City")
        assert "timed out" in res_timeout["error"].lower()
        assert len(res_timeout["days"]) == 0

    # 6b. HTTP 429 Rate Limit
    req = httpx.Request("GET", "https://api.open-meteo.com/v1/forecast")
    resp_429 = httpx.Response(429, request=req)
    with patch("httpx.AsyncClient.get", side_effect=httpx.HTTPStatusError("Rate Limit", request=req, response=resp_429)):
        res_rate = await fetch_forecast(lat=10.0, lon=10.0, city="Rate Limited City")
        assert "rate limit exceeded" in res_rate["error"].lower()

    # 6c. Network Request Error
    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Network unreachable")):
        res_net = await fetch_forecast(lat=10.0, lon=10.0, city="Offline City")
        assert "network error" in res_net["error"].lower()


@pytest.mark.asyncio
async def test_7_cache_freshness_and_stale_data_fallback():
    """7. Test 10-minute cache freshness and stale-data fallback when live update fails."""
    # Step 1: Successful fresh fetch
    with patch("httpx.AsyncClient.get", return_value=MockResponse(MOCK_OPEN_METEO_FORECAST)):
        fresh = await fetch_forecast(lat=35.689, lon=139.692, city="Tokyo")
        assert fresh["cached"] is False
        assert fresh["is_stale"] is False

    # Step 2: Immediate second fetch hits fresh cache (cached=True, is_stale=False)
    cached = await fetch_forecast(lat=35.689, lon=139.692, city="Tokyo")
    assert cached["cached"] is True
    assert cached["is_stale"] is False
    assert cached["warning"] is None

    # Step 3: Fast-forward cache timestamp beyond TTL (15 minutes older)
    cache_key = "35.689:139.692"
    assert cache_key in _FORECAST_CACHE
    cached_timestamp, cached_data = _FORECAST_CACHE[cache_key]
    _FORECAST_CACHE[cache_key] = (cached_timestamp - (CACHE_TTL_SECONDS + 300), cached_data)

    # Step 4: Network fails on refresh -> Must gracefully return stale cache with warning!
    with patch("httpx.AsyncClient.get", side_effect=httpx.TimeoutException("Timeout")):
        stale = await fetch_forecast(lat=35.689, lon=139.692, city="Tokyo")
        assert stale["cached"] is True
        assert stale["is_stale"] is True
        assert "Live weather update failed" in stale["warning"]
        assert len(stale["days"]) == 7


def test_8_api_query_validation_and_rejected_inputs(client):
    """8. Test FastAPI endpoint rejection of malformed or out-of-bounds coordinates."""
    # 8a. Empty query and missing coordinates returns 422
    r_empty = client.get("/api/weather")
    assert r_empty.status_code == 422

    # 8b. Latitude provided without Longitude returns 422
    r_half = client.get("/api/weather?lat=25.0")
    assert r_half.status_code == 422
    assert "Both latitude and longitude" in r_half.json()["detail"]

    # 8c. Latitude out of bounds (> 90) returns 422
    r_oob = client.get("/api/weather?lat=95.0&lon=40.0")
    assert r_oob.status_code == 422


@pytest.mark.asyncio
async def test_9_ai_enrich_receives_weather_and_probabilistic_instructions(client):
    """9. Test that AI enrich-itinerary receives weather context and strict non-hallucination rules."""
    from datetime import date
    db = TestingSessionLocal()
    trip = Trip(
        name="Tokyo Autumn Discovery",
        origin="Delhi",
        destination="Tokyo",
        departure_date=date(2026, 11, 1),
        return_date=date(2026, 11, 4),
        num_days=3,
        num_travellers=1,
        budget_minor=20000000,
        currency="INR",
        is_demo=False,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    act = Activity(
        trip_id=trip.id,
        day_number=1,
        name="Shinjuku Gyoen National Garden",
        category=ActivityCategory.SIGHTSEEING,
        cost_minor=50000,
        currency="INR",
    )
    db.add(act)
    db.commit()

    captured_prompt = {}

    async def mock_generate(prompt: str, system: str = "", max_tokens: int = 1000):
        captured_prompt["prompt"] = prompt
        captured_prompt["system"] = system
        return {
            "text": "Weather recommendation: rain is forecast on day 2, so visit the Mori Art Museum.",
            "is_ai": True,
            "provider": "MockAI",
            "error": None,
        }

    async def mock_get(url: str, params=None):
        if "geocoding" in url:
            return MockResponse({
                "results": [{
                    "name": "Tokyo",
                    "country": "Japan",
                    "admin1": "Tokyo",
                    "latitude": 35.689,
                    "longitude": 139.692,
                    "timezone": "Asia/Tokyo",
                }]
            })
        return MockResponse(MOCK_OPEN_METEO_FORECAST)

    with patch("httpx.AsyncClient.get", side_effect=mock_get), \
         patch("app.api.ai_chat.generate_text", side_effect=mock_generate):
        r = client.post("/api/ai/enrich-itinerary", json={"trip_id": trip.id, "focus": "general"})
        assert r.status_code == 200

        # Verify prompt includes weather outlook
        prompt_text = captured_prompt["prompt"]
        assert "Destination Weather Outlook" in prompt_text
        assert "Mainly clear" in prompt_text or "2026-10-16" in prompt_text


        # Verify probabilistic instructions given to AI
        assert "probabilistic forecasts" in prompt_text.lower()
        assert "never claim that an activity has already been automatically changed" in prompt_text.lower()

        # Verify system prompt enforces no false automatic rescheduling
        assert "distinguish weather forecasts from certainty" in captured_prompt["system"].lower()
        assert "never claim automatic weather rescheduling" in captured_prompt["system"].lower()

    db.close()


def test_10_live_open_meteo_endpoint_verification(client):
    """
    10. Real Live Provider Verification.
    Directly tests live Open-Meteo geocoding and forecast endpoints without mocks.
    """
    # Live Geocoding
    r_geo = client.get("/api/weather/geocoding?q=London, UK&count=1")
    assert r_geo.status_code == 200
    geo_data = r_geo.json().get("results", [])
    assert len(geo_data) > 0
    first = geo_data[0]
    assert first["country"] == "United Kingdom"
    assert first["name"] == "London"

    # Live Forecast (with single retry for transient test-suite socket delays)
    w_data = None
    for attempt in range(2):
        r_weather = client.get(f"/api/weather?lat={first['latitude']}&lon={first['longitude']}&city=London")
        assert r_weather.status_code == 200
        w_data = r_weather.json()
        if w_data.get("error") is None:
            break
        time.sleep(1.0)

    assert w_data is not None
    assert w_data["error"] is None
    assert w_data["source"] == "Open-Meteo (open-meteo.com)"
    assert len(w_data["days"]) == 7
    assert "temperature_c" in w_data["current"]


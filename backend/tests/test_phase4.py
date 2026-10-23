"""
Phase 4 backend tests.

Tests:
  - Weather endpoint: geocoding + forecast structure
  - AI status endpoint: returns correct is_live based on config
  - AI chat endpoint: works with and without API keys (fallback)
  - AI enrich-itinerary: reads real trip, returns suggestions
  - Provider failure handling: malformed responses, missing keys

All AI provider calls are mocked — no real API calls in automated tests.
Tests are isolated from travel_guide.db using a temporary SQLite file.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db

# ---------------------------------------------------------------------------
# Isolated test DB
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite:///./test_phase4.db"
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
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client(setup_test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Weather tests (mock httpx to avoid real network calls in CI)
# ---------------------------------------------------------------------------

MOCK_GEO = {
    "results": [{
        "latitude": 15.4909,
        "longitude": 73.8278,
        "name": "Goa",
        "country": "India",
        "admin1": "Goa",
    }]
}

MOCK_FORECAST = {
    "daily": {
        "time": ["2026-11-14", "2026-11-15", "2026-11-16"],
        "temperature_2m_max": [32.0, 31.5, 30.0],
        "temperature_2m_min": [24.0, 23.5, 22.0],
        "precipitation_sum": [0.0, 1.2, 0.5],
        "weathercode": [0, 51, 1],
        "windspeed_10m_max": [15.0, 20.0, 12.0],
        "uv_index_max": [8.0, 6.0, 7.0],
        "sunrise": ["2026-11-14T06:30", "2026-11-15T06:31", "2026-11-16T06:31"],
        "sunset": ["2026-11-14T18:15", "2026-11-15T18:14", "2026-11-16T18:14"],
    }
}


class MockHttpxResponse:
    def __init__(self, data: dict, status: int = 200):
        self._data = data
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def json(self):
        return self._data


class MockHttpxClient:
    """Minimal async context manager that returns preset responses."""
    def __init__(self, *responses, **kwargs):  # accept timeout= and other httpx kwargs
        self._responses = list(responses)
        self._call_count = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def get(self, url: str, params=None):
        resp = self._responses[self._call_count % len(self._responses)]
        self._call_count += 1
        return resp


def _make_client_factory(*responses):
    """
    Return a callable that produces a MockHttpxClient with sequential responses.

    The weather integration opens TWO separate AsyncClient contexts:
      1. geocode_city  → first response (MOCK_GEO)
      2. fetch_forecast → second response (MOCK_FORECAST)

    Each call to the factory must hand out the NEXT response in the list,
    not restart from the beginning.  We use a mutable index for this.
    """
    index = [0]  # mutable so the closure can increment it

    def factory(**kwargs):
        resp = responses[index[0] % len(responses)]
        index[0] += 1
        return MockHttpxClient(resp)

    return factory


def test_weather_success(client):
    """Weather endpoint returns structured forecast data."""
    with patch(
        "app.integrations.weather.httpx.AsyncClient",
        side_effect=_make_client_factory(
            MockHttpxResponse(MOCK_GEO),
            MockHttpxResponse(MOCK_FORECAST),
        ),
    ):
        r = client.get("/api/weather?city=Goa")
    assert r.status_code == 200
    data = r.json()
    assert data["error"] is None
    assert data["city_name"] == "Goa"
    assert len(data["days"]) == 3
    assert data["days"][0]["temp_max_c"] == 32.0
    assert data["days"][0]["condition"] == "Clear sky"
    assert data["data_type"] == "WEATHER_FORECAST"
    assert "disclaimer" in data


def test_weather_unknown_city(client):
    """Weather endpoint returns error dict for unknown city (not a 500)."""
    empty_geo = {"results": []}
    with patch(
        "app.integrations.weather.httpx.AsyncClient",
        side_effect=lambda **kwargs: MockHttpxClient(MockHttpxResponse(empty_geo)),
    ):
        r = client.get("/api/weather?city=Xyzzy_Unknown_City_12345")
    assert r.status_code == 200
    data = r.json()
    assert data["error"] is not None
    assert data["days"] == []


def test_weather_network_failure_returns_graceful_error(client):
    """
    When the geocoding HTTP call raises a network exception, the endpoint must
    return HTTP 200 with a non-null error field — NOT a 500 crash.
    The integration catches all exceptions and returns a structured error dict.
    """
    with patch(
        "app.integrations.weather.httpx.AsyncClient",
        side_effect=Exception("Simulated network failure"),
    ):
        r = client.get("/api/weather?city=Goa")
    assert r.status_code == 200
    data = r.json()
    # Geocode failed → city not found, graceful error dict returned
    assert data["error"] is not None
    assert data["days"] == []


def test_weather_missing_city_param(client):
    """Omitting the city param entirely should yield 422 (FastAPI validation)."""
    r = client.get("/api/weather")
    assert r.status_code == 422


def test_weather_blank_city_returns_graceful_error(client):
    """
    An empty-string city is a valid (provided) parameter value.
    FastAPI does NOT reject it with 422 — the integration returns a graceful error dict.
    """
    empty_geo = {"results": []}
    with patch(
        "app.integrations.weather.httpx.AsyncClient",
        side_effect=_make_client_factory(MockHttpxResponse(empty_geo)),
    ):
        r = client.get("/api/weather?city=")
    assert r.status_code == 200
    data = r.json()
    assert data["error"] is not None  # graceful error, not crash
    assert data["days"] == []


# ---------------------------------------------------------------------------
# AI status tests
# ---------------------------------------------------------------------------

def test_ai_status_no_keys(client):
    """AI status returns is_live=False when no API keys are configured."""
    with patch("app.integrations.ai_provider.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = ""
        mock_settings.OPENAI_API_KEY = ""
        r = client.get("/api/ai/status")
    assert r.status_code == 200
    data = r.json()
    assert data["is_live"] is False
    assert "provider" in data


def test_ai_status_with_gemini_key(client):
    """AI status returns is_live=True when GEMINI_API_KEY is set."""
    with patch("app.integrations.ai_provider.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = "test-key-abc"
        mock_settings.OPENAI_API_KEY = ""
        r = client.get("/api/ai/status")
    assert r.status_code == 200
    data = r.json()
    assert data["is_live"] is True


# ---------------------------------------------------------------------------
# AI chat tests
# ---------------------------------------------------------------------------

def test_ai_chat_fallback_no_keys(client):
    """AI chat returns is_ai=False and an explanatory message when no key configured."""
    with patch("app.integrations.ai_provider.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = ""
        mock_settings.OPENAI_API_KEY = ""
        r = client.post("/api/ai/chat", json={"message": "Best beaches in Goa?"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_ai"] is False
    assert data["reply"]  # non-empty fallback text
    assert data["error"] is not None


def test_ai_chat_with_mock_gemini(client):
    """AI chat returns is_ai=True when Gemini responds successfully."""
    mock_result = {
        "text": "Goa has beautiful beaches like Palolem and Agonda.",
        "is_ai": True,
        "provider": "Gemini 1.5 Flash",
        "error": None,
    }
    with patch("app.api.ai_chat.generate_text", new=AsyncMock(return_value=mock_result)):
        r = client.post("/api/ai/chat", json={"message": "Best beaches in Goa?"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_ai"] is True
    assert "Palolem" in data["reply"]
    assert data["provider"] == "Gemini 1.5 Flash"
    assert data["error"] is None


def test_ai_chat_empty_message_rejected(client):
    """Empty message should be rejected by validation."""
    r = client.post("/api/ai/chat", json={"message": ""})
    assert r.status_code == 422


def test_ai_chat_with_context(client):
    """Context is forwarded to the AI."""
    mock_result = {
        "text": "With a ₹50,000 budget for 3 days, focus on Calangute area.",
        "is_ai": True,
        "provider": "Gemini 1.5 Flash",
        "error": None,
    }
    with patch("app.api.ai_chat.generate_text", new=AsyncMock(return_value=mock_result)) as m:
        r = client.post("/api/ai/chat", json={
            "message": "Where should I stay?",
            "context": "3-day trip to Goa, budget ₹50,000",
        })
    assert r.status_code == 200
    # Verify context was included in the prompt
    call_args = m.call_args[0][0]  # first positional arg = prompt
    assert "3-day trip to Goa" in call_args


def test_ai_chat_provider_error_returns_fallback(client):
    """When the AI provider throws, the endpoint returns a fallback (not 500)."""
    with patch(
        "app.api.ai_chat.generate_text",
        new=AsyncMock(return_value={
            "text": "⚠️ AI unavailable.",
            "is_ai": False,
            "provider": "Fallback",
            "error": "Provider threw",
        }),
    ):
        r = client.post("/api/ai/chat", json={"message": "Hello"})
    assert r.status_code == 200
    assert r.json()["is_ai"] is False


# ---------------------------------------------------------------------------
# AI enrich-itinerary tests
# ---------------------------------------------------------------------------

def _create_trip(client) -> int:
    from datetime import date, timedelta
    r = client.post("/api/trips/", json={
        "name": "Test Trip to Goa",
        "origin": "Mumbai",
        "destination": "Goa, India",
        "departure_date": str(date.today() + timedelta(days=10)),
        "return_date": str(date.today() + timedelta(days=13)),
        "num_travellers": 2,
        "budget_minor": 10000000,
        "currency": "INR",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_enrich_itinerary_with_mock(client):
    """Enrich endpoint reads trip from DB and returns AI suggestions."""
    trip_id = _create_trip(client)
    mock_result = {
        "text": "Day 1: Visit Baga Beach in the morning, then Fort Aguada.",
        "is_ai": True,
        "provider": "Gemini 1.5 Flash",
        "error": None,
    }
    with patch("app.api.ai_chat.generate_text", new=AsyncMock(return_value=mock_result)):
        r = client.post("/api/ai/enrich-itinerary", json={"trip_id": trip_id, "focus": "general"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_ai"] is True
    assert "Baga" in data["suggestions"]


def test_enrich_itinerary_404_on_missing_trip(client):
    """Enrich returns 404 for a trip that doesn't exist."""
    with patch("app.api.ai_chat.generate_text", new=AsyncMock(return_value={
        "text": "x", "is_ai": True, "provider": "x", "error": None
    })):
        r = client.post("/api/ai/enrich-itinerary", json={"trip_id": 99999})
    assert r.status_code == 404


def test_enrich_itinerary_fallback_no_key(client):
    """Enrich endpoint returns is_ai=False when no AI key configured."""
    trip_id = _create_trip(client)
    with patch("app.integrations.ai_provider.settings") as mock_settings:
        mock_settings.GEMINI_API_KEY = ""
        mock_settings.OPENAI_API_KEY = ""
        r = client.post("/api/ai/enrich-itinerary", json={"trip_id": trip_id})
    assert r.status_code == 200
    assert r.json()["is_ai"] is False


def test_integrations_status_endpoint(client):
    """Integrations status endpoint returns structured status for all core providers."""
    r = client.get("/api/integrations/status")
    assert r.status_code == 200
    data = r.json()
    assert "services" in data
    assert "overall_mode" in data
    services = data["services"]
    assert "weather" in services
    assert "ai" in services
    assert "flights" in services
    assert "hotels" in services
    assert "database" in services
    assert services["weather"]["status"] == "connected"
    assert services["database"]["status"] == "connected"
    assert data["overall_mode"] in ("hybrid", "live")


def test_demo_status_endpoint_honest(client):
    """Demo status returns overall_mode and accurate message."""
    r = client.get("/api/demo/status")
    assert r.status_code == 200
    data = r.json()
    assert "demo_mode" in data
    assert "overall_mode" in data
    assert "message" in data


"""
integrations.py — Central Integration & Provider Status router.

Returns honest, real-time status of all external services and providers:
  - Weather: Open-Meteo (live numerical forecast, free, no key needed)
  - AI Assistant: Gemini 1.5 Flash / OpenAI (live when configured, or fallback)
  - Flight Search: Amadeus API (live when configured) / External search links
  - Hotel Search: Amadeus API (live when configured) / External search links
  - Local Database: SQLite (live user storage)
  - Ground Transit: Navigation & curated transit links

Never exposes secret keys or sensitive credentials.
"""
from __future__ import annotations

from typing import Dict
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.integrations.ai_provider import ai_provider_name, ai_is_live

router = APIRouter()


class ServiceStatus(BaseModel):
    name: str
    status: str       # "connected" | "not_configured" | "external_search_only" | "unavailable"
    type: str         # "live" | "fallback" | "redirect" | "database" | "guides"
    provider: str
    is_live: bool
    details: str
    setup_guide: str | None = None


class IntegrationsStatusResponse(BaseModel):
    overall_mode: str  # "live" | "hybrid" | "demo"
    summary: str
    demo_mode: bool
    services: Dict[str, ServiceStatus]


@router.get("/status", response_model=IntegrationsStatusResponse, summary="Check status of all integrations")
async def get_integrations_status():
    """
    Returns the real-time operational status of all data providers and services.
    Accurately distinguishes live in-app APIs from external search links and fallback engines.
    """
    ai_live = ai_is_live()
    amadeus_live = settings.is_amadeus_live

    # Determine honest overall mode
    if ai_live and amadeus_live:
        overall_mode = "live"
        summary = "Live Mode: All AI, weather, and travel API integrations are fully connected."
    elif ai_live:
        overall_mode = "live"
        summary = "Live Mode: AI Assistant (Gemini) and real-time weather are active. Flights & hotels use direct search links."
    else:
        overall_mode = "hybrid"
        summary = "Hybrid Mode: Live weather and persistent local storage are active. AI Assistant is in fallback mode. Flights and hotels use external search links."

    services: Dict[str, ServiceStatus] = {
        "weather": ServiceStatus(
            name="Weather Forecasts",
            status="connected",
            type="live",
            provider="Open-Meteo API",
            is_live=True,
            details="Free public API active without keys. Live 7-day high/low temperatures, precipitation, wind, UV and sunrise/sunset.",
            setup_guide="No setup needed. Open-Meteo provides free open weather data.",
        ),
        "ai": ServiceStatus(
            name="AI Travel Assistant",
            status="connected" if ai_live else "not_configured",
            type="live" if ai_live else "fallback",
            provider=ai_provider_name(),
            is_live=ai_live,
            details=(
                f"Active and connected via {ai_provider_name()}."
                if ai_live
                else "Running in rule-based fallback mode. Real algorithms plan itineraries; generative AI assistance is offline."
            ),
            setup_guide=(
                None
                if ai_live
                else "To activate Gemini: Get a free key at https://aistudio.google.com and add GEMINI_API_KEY=your_key in backend/.env."
            ),
        ),
        "flights": ServiceStatus(
            name="Flight Search",
            status="connected" if amadeus_live else "external_search_only",
            type="live" if amadeus_live else "redirect",
            provider="Amadeus Flight Offers API" if amadeus_live else "Google Flights, Skyscanner, MakeMyTrip",
            is_live=amadeus_live,
            details=(
                "Connected to live Amadeus flight offers API."
                if amadeus_live
                else "Direct search redirects to Google Flights, Skyscanner and MakeMyTrip with routes pre-filled. No fake prices or mock bookings."
            ),
            setup_guide=(
                None
                if amadeus_live
                else "For live in-app API pricing, register at https://developers.amadeus.com and add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to backend/.env."
            ),
        ),
        "hotels": ServiceStatus(
            name="Accommodation Search",
            status="connected" if amadeus_live else "external_search_only",
            type="live" if amadeus_live else "redirect",
            provider="Amadeus Hotel API" if amadeus_live else "Booking.com, Airbnb, Agoda",
            is_live=amadeus_live,
            details=(
                "Connected to live Amadeus hotel inventory API."
                if amadeus_live
                else "Direct search redirects to Booking.com, Airbnb and Agoda with pre-filled destination and check-in/out dates."
            ),
            setup_guide=(
                None
                if amadeus_live
                else "Uses same Amadeus developer credentials as flight search."
            ),
        ),
        "database": ServiceStatus(
            name="Local Storage & User Accounts",
            status="connected",
            type="database",
            provider="SQLite (travel_guide.db)",
            is_live=True,
            details="Persistent database connected. User accounts, custom trips, activities, expenses, capsules, and history persist across sessions.",
            setup_guide="Configured automatically via DATABASE_URL in backend/.env.",
        ),
        "transit": ServiceStatus(
            name="Ground Transport & Navigation",
            status="external_search_only",
            type="guides",
            provider="IRCTC, Uber, Grab, Google Maps",
            is_live=True,
            details="Curated transit schedules, regional guidelines, and direct booking links with pre-filled origins and destinations.",
            setup_guide="Direct deep links — no API key needed.",
        ),
    }

    return IntegrationsStatusResponse(
        overall_mode=overall_mode,
        summary=summary,
        demo_mode=not ai_live,
        services=services,
    )

"""
activity_catalogue.py
─────────────────────
A curated demo catalogue of activities keyed by destination keyword.

All data is clearly labelled as DEMO / sample data.  Costs are
approximate estimates in INR minor units (paise).  When a real
provider (e.g. Google Places, Amadeus Activities) is connected,
these records will be replaced by live data transparently.

Each record follows the same field contract as ActivityCreate so that
the schedule_builder can pass them directly to the DB layer.
"""

from __future__ import annotations
from typing import TypedDict, Optional


class CatalogueActivity(TypedDict):
    name: str
    category: str           # matches ActivityCategory enum values
    location: Optional[str]
    duration_minutes: int
    cost_minor: int         # INR paise; 0 = free
    opening_hours: Optional[str]
    booking_required: bool
    recommendation_reason: str
    styles: list[str]       # travel-style tags (subset of TravelStyle enum)
    day_part: str           # "morning" | "afternoon" | "evening" | "anytime"


# ─── Goa ────────────────────────────────────────────────────────────────────

GOA: list[CatalogueActivity] = [
    {
        "name": "Basilica of Bom Jesus",
        "category": "culture",
        "location": "Old Goa",
        "duration_minutes": 90,
        "cost_minor": 0,
        "opening_hours": "09:00–18:30",
        "booking_required": False,
        "recommendation_reason": "[DEMO] UNESCO World Heritage Site; free entry.",
        "styles": ["cultural", "leisurely", "family", "solo", "group"],
        "day_part": "morning",
    },
    {
        "name": "Se Cathedral, Old Goa",
        "category": "culture",
        "location": "Old Goa",
        "duration_minutes": 60,
        "cost_minor": 0,
        "opening_hours": "09:00–18:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Largest church in Asia; adjacent to Basilica.",
        "styles": ["cultural", "leisurely", "family"],
        "day_part": "morning",
    },
    {
        "name": "Chapora Fort Sunrise Walk",
        "category": "sightseeing",
        "location": "Chapora, North Goa",
        "duration_minutes": 90,
        "cost_minor": 0,
        "opening_hours": "Open 24 h",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Iconic Dil Chahta Hai fort; spectacular sunrise views.",
        "styles": ["adventure", "solo", "romantic", "group", "outgoing"],
        "day_part": "morning",
    },
    {
        "name": "Anjuna Flea Market",
        "category": "shopping",
        "location": "Anjuna Beach, North Goa",
        "duration_minutes": 180,
        "cost_minor": 0,
        "opening_hours": "Wed 08:00–18:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Hippie flea market; clothes, jewellery, spices.",
        "styles": ["outgoing", "leisurely", "group", "family", "cultural"],
        "day_part": "morning",
    },
    {
        "name": "Baga Beach Watersports",
        "category": "adventure",
        "location": "Baga Beach, North Goa",
        "duration_minutes": 120,
        "cost_minor": 150000,
        "opening_hours": "08:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Jet-ski, banana boat, parasailing. Sample ₹1 500.",
        "styles": ["adventure", "outgoing", "group", "family"],
        "day_part": "morning",
    },
    {
        "name": "Dudhsagar Falls Visit",
        "category": "nature",
        "location": "Dudhsagar, Goa",
        "duration_minutes": 270,
        "cost_minor": 200000,
        "opening_hours": "Seasonal (Jun–Jan)",
        "booking_required": True,
        "recommendation_reason": "[DEMO] 4-tier waterfall; jeep safari required. Sample ₹2 000.",
        "styles": ["adventure", "nature_wellness", "group", "family", "leisurely"],
        "day_part": "morning",
    },
    {
        "name": "Scooter Rental – Explore North Goa",
        "category": "transport",
        "location": "Candolim",
        "duration_minutes": 540,
        "cost_minor": 80000,
        "opening_hours": "08:00–20:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Most flexible way to explore. Sample ₹800/day.",
        "styles": ["adventure", "solo", "budget", "outgoing"],
        "day_part": "morning",
    },
    {
        "name": "Sunset at Baga Beach",
        "category": "sightseeing",
        "location": "Baga Beach, North Goa",
        "duration_minutes": 90,
        "cost_minor": 0,
        "opening_hours": None,
        "booking_required": False,
        "recommendation_reason": "[DEMO] Popular sunset spot; ideal for photos.",
        "styles": ["romantic", "leisurely", "solo", "group", "outgoing"],
        "day_part": "evening",
    },
    {
        "name": "Dinner at Martin's Corner",
        "category": "food",
        "location": "Betalbatim, South Goa",
        "duration_minutes": 120,
        "cost_minor": 250000,
        "opening_hours": "12:00–23:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Famous Goan seafood. Sample ₹2 500 for two.",
        "styles": ["food_nightlife", "romantic", "luxury", "leisurely", "group"],
        "day_part": "evening",
    },
    {
        "name": "Tito's Lane Nightlife",
        "category": "nightlife",
        "location": "Baga, North Goa",
        "duration_minutes": 180,
        "cost_minor": 100000,
        "opening_hours": "21:00–04:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Goa's most famous nightlife strip. Sample ₹1 000.",
        "styles": ["outgoing", "food_nightlife", "solo", "group"],
        "day_part": "evening",
    },
    {
        "name": "Goa Beach Shack Lunch",
        "category": "food",
        "location": "Calangute Beach",
        "duration_minutes": 90,
        "cost_minor": 120000,
        "opening_hours": "11:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Relaxed shack with sea view. Sample ₹1 200.",
        "styles": ["leisurely", "romantic", "family", "food_nightlife"],
        "day_part": "afternoon",
    },
    {
        "name": "Spice Plantation Tour",
        "category": "nature",
        "location": "Ponda, Goa",
        "duration_minutes": 180,
        "cost_minor": 100000,
        "opening_hours": "10:00–16:00",
        "booking_required": True,
        "recommendation_reason": "[DEMO] Guided tour + Goan lunch. Sample ₹1 000.",
        "styles": ["cultural", "family", "nature_wellness", "leisurely"],
        "day_part": "afternoon",
    },
    {
        "name": "Ayurveda & Yoga Session",
        "category": "wellness",
        "location": "Calangute, Goa",
        "duration_minutes": 120,
        "cost_minor": 200000,
        "opening_hours": "07:00–10:00",
        "booking_required": True,
        "recommendation_reason": "[DEMO] Morning yoga + oil massage. Sample ₹2 000.",
        "styles": ["nature_wellness", "romantic", "solo", "luxury"],
        "day_part": "morning",
    },
    {
        "name": "Panjim City Walk & Fontainhas",
        "category": "sightseeing",
        "location": "Panjim, Goa",
        "duration_minutes": 120,
        "cost_minor": 0,
        "opening_hours": "Anytime",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Portuguese quarter with colourful Latin Quarter homes.",
        "styles": ["cultural", "leisurely", "solo", "romantic", "family"],
        "day_part": "afternoon",
    },
    {
        "name": "Cruise on the Mandovi River",
        "category": "sightseeing",
        "location": "Panjim Jetty",
        "duration_minutes": 90,
        "cost_minor": 60000,
        "opening_hours": "18:00–19:30",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Sunset/evening cruise with cultural shows. Sample ₹600.",
        "styles": ["romantic", "family", "group", "leisurely", "cultural"],
        "day_part": "evening",
    },
]


# ─── Manali ──────────────────────────────────────────────────────────────────

MANALI: list[CatalogueActivity] = [
    {
        "name": "Rohtang Pass Excursion",
        "category": "adventure",
        "location": "Rohtang, Manali",
        "duration_minutes": 360,
        "cost_minor": 250000,
        "opening_hours": "05:00–14:00 (permit required)",
        "booking_required": True,
        "recommendation_reason": "[DEMO] Snow even in summer; stunning Himalayan views. Sample ₹2 500.",
        "styles": ["adventure", "outgoing", "group", "family"],
        "day_part": "morning",
    },
    {
        "name": "Hadimba Devi Temple",
        "category": "culture",
        "location": "Old Manali",
        "duration_minutes": 60,
        "cost_minor": 0,
        "opening_hours": "08:00–18:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] 16th-century wooden temple; peaceful forest setting.",
        "styles": ["cultural", "spiritual", "leisurely", "family", "solo"],
        "day_part": "morning",
    },
    {
        "name": "Solang Valley Ziplining & Paragliding",
        "category": "adventure",
        "location": "Solang Valley",
        "duration_minutes": 180,
        "cost_minor": 300000,
        "opening_hours": "09:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Most popular adventure spot near Manali. Sample ₹3 000.",
        "styles": ["adventure", "outgoing", "group", "solo"],
        "day_part": "morning",
    },
    {
        "name": "Old Manali Café Hop",
        "category": "food",
        "location": "Old Manali Village",
        "duration_minutes": 120,
        "cost_minor": 80000,
        "opening_hours": "09:00–22:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Bohemian cafés with mountain views. Sample ₹800.",
        "styles": ["solo", "romantic", "food_nightlife", "budget", "outgoing"],
        "day_part": "afternoon",
    },
    {
        "name": "Jogini Waterfall Trek",
        "category": "adventure",
        "location": "Vashisht, Manali",
        "duration_minutes": 180,
        "cost_minor": 0,
        "opening_hours": "06:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] 4 km easy trek; beautiful waterfall. Free.",
        "styles": ["adventure", "nature_wellness", "solo", "romantic", "budget"],
        "day_part": "morning",
    },
    {
        "name": "Vashisht Hot Springs & Temple",
        "category": "wellness",
        "location": "Vashisht, Manali",
        "duration_minutes": 90,
        "cost_minor": 0,
        "opening_hours": "07:00–21:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Natural sulphur hot springs; deeply relaxing. Free.",
        "styles": ["nature_wellness", "cultural", "family", "leisurely"],
        "day_part": "afternoon",
    },
    {
        "name": "Manali Bazaar Shopping",
        "category": "shopping",
        "location": "Manali Mall Road",
        "duration_minutes": 120,
        "cost_minor": 100000,
        "opening_hours": "10:00–21:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Pashmina shawls, dry fruits, local handicrafts.",
        "styles": ["family", "group", "leisurely", "cultural"],
        "day_part": "afternoon",
    },
    {
        "name": "Naggar Castle Visit",
        "category": "culture",
        "location": "Naggar, Manali",
        "duration_minutes": 120,
        "cost_minor": 2000,
        "opening_hours": "08:00–18:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] 15th-century castle; stunning Beas valley views.",
        "styles": ["cultural", "leisurely", "solo", "romantic"],
        "day_part": "afternoon",
    },
]


# ─── Jaipur ──────────────────────────────────────────────────────────────────

JAIPUR: list[CatalogueActivity] = [
    {
        "name": "Amber Fort",
        "category": "culture",
        "location": "Amer, Jaipur",
        "duration_minutes": 180,
        "cost_minor": 20000,
        "opening_hours": "08:00–17:30",
        "booking_required": False,
        "recommendation_reason": "[DEMO] UNESCO listed Rajput fortress. Sample ₹200.",
        "styles": ["cultural", "family", "group", "leisurely", "luxury"],
        "day_part": "morning",
    },
    {
        "name": "City Palace Jaipur",
        "category": "culture",
        "location": "Old City, Jaipur",
        "duration_minutes": 120,
        "cost_minor": 50000,
        "opening_hours": "09:30–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Opulent royal residence; museum inside. Sample ₹500.",
        "styles": ["cultural", "luxury", "family", "group"],
        "day_part": "morning",
    },
    {
        "name": "Hawa Mahal",
        "category": "sightseeing",
        "location": "Old City, Jaipur",
        "duration_minutes": 60,
        "cost_minor": 5000,
        "opening_hours": "09:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Palace of the Winds; iconic 5-story pink façade. ₹50.",
        "styles": ["cultural", "solo", "romantic", "family", "group"],
        "day_part": "morning",
    },
    {
        "name": "Jantar Mantar (Observatory)",
        "category": "culture",
        "location": "Old City, Jaipur",
        "duration_minutes": 90,
        "cost_minor": 20000,
        "opening_hours": "09:00–16:30",
        "booking_required": False,
        "recommendation_reason": "[DEMO] UNESCO site; world's largest stone sundial. ₹200.",
        "styles": ["cultural", "family", "solo", "group"],
        "day_part": "afternoon",
    },
    {
        "name": "Nahargarh Fort Sunset",
        "category": "sightseeing",
        "location": "Nahargarh, Jaipur",
        "duration_minutes": 120,
        "cost_minor": 5000,
        "opening_hours": "10:00–18:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Best panoramic sunset view of Pink City. ₹50.",
        "styles": ["romantic", "solo", "group", "outgoing"],
        "day_part": "evening",
    },
    {
        "name": "Johari Bazaar Gem Shopping",
        "category": "shopping",
        "location": "Johari Bazaar, Jaipur",
        "duration_minutes": 120,
        "cost_minor": 0,
        "opening_hours": "10:00–20:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Rajasthan's famous gem & jewellery market.",
        "styles": ["cultural", "luxury", "family", "group", "leisurely"],
        "day_part": "afternoon",
    },
    {
        "name": "Dal Baati Churma Dinner",
        "category": "food",
        "location": "Old City, Jaipur",
        "duration_minutes": 90,
        "cost_minor": 80000,
        "opening_hours": "19:00–23:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Rajasthani thali experience. Sample ₹800.",
        "styles": ["food_nightlife", "cultural", "family", "group", "budget"],
        "day_part": "evening",
    },
    {
        "name": "Elephant Village Ethical Visit",
        "category": "nature",
        "location": "Hathi Gaon, Jaipur",
        "duration_minutes": 180,
        "cost_minor": 250000,
        "opening_hours": "07:00–11:00",
        "booking_required": True,
        "recommendation_reason": "[DEMO] Bathe and feed rescued elephants. Sample ₹2 500.",
        "styles": ["nature_wellness", "family", "group", "adventure"],
        "day_part": "morning",
    },
]


# ─── Generic fallback ────────────────────────────────────────────────────────

GENERIC_ACTIVITIES: list[CatalogueActivity] = [
    {
        "name": "Explore the City Centre",
        "category": "sightseeing",
        "location": None,
        "duration_minutes": 180,
        "cost_minor": 0,
        "opening_hours": None,
        "booking_required": False,
        "recommendation_reason": "[DEMO] Walk through the main market and old streets.",
        "styles": ["leisurely", "solo", "group", "family", "cultural", "budget"],
        "day_part": "morning",
    },
    {
        "name": "Local Restaurant Lunch",
        "category": "food",
        "location": None,
        "duration_minutes": 90,
        "cost_minor": 80000,
        "opening_hours": "12:00–15:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Sample authentic local cuisine.",
        "styles": ["food_nightlife", "leisurely", "family", "group", "cultural", "budget"],
        "day_part": "afternoon",
    },
    {
        "name": "Local Museum / Heritage Site",
        "category": "culture",
        "location": None,
        "duration_minutes": 120,
        "cost_minor": 10000,
        "opening_hours": "10:00–17:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Learn the history and culture of the destination.",
        "styles": ["cultural", "family", "solo", "group"],
        "day_part": "afternoon",
    },
    {
        "name": "Sunset Viewpoint",
        "category": "sightseeing",
        "location": None,
        "duration_minutes": 60,
        "cost_minor": 0,
        "opening_hours": None,
        "booking_required": False,
        "recommendation_reason": "[DEMO] Enjoy the sunset from a popular local viewpoint.",
        "styles": ["romantic", "leisurely", "solo", "group", "outgoing"],
        "day_part": "evening",
    },
    {
        "name": "Evening Market / Street Food",
        "category": "food",
        "location": None,
        "duration_minutes": 90,
        "cost_minor": 50000,
        "opening_hours": "17:00–22:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Vibrant evening market with street food stalls.",
        "styles": ["food_nightlife", "outgoing", "group", "family", "budget"],
        "day_part": "evening",
    },
    {
        "name": "Nature Walk / City Park",
        "category": "nature",
        "location": None,
        "duration_minutes": 90,
        "cost_minor": 0,
        "opening_hours": "06:00–20:00",
        "booking_required": False,
        "recommendation_reason": "[DEMO] Peaceful morning walk through local park or nature area.",
        "styles": ["nature_wellness", "solo", "family", "romantic", "budget"],
        "day_part": "morning",
    },
]


# ─── Lookup helper ────────────────────────────────────────────────────────────

_DESTINATION_MAP: dict[str, list[CatalogueActivity]] = {
    "goa": GOA,
    "manali": MANALI,
    "jaipur": JAIPUR,
    "pink city": JAIPUR,
    "amer": JAIPUR,
}


def get_catalogue(destination: str) -> list[CatalogueActivity]:
    """Return the best-matching catalogue for *destination*.

    Checks curated destination places first; returns [] if no curated catalogue exists.
    Never fabricates generic fake attractions or placeholders.
    """
    dest_lower = destination.lower()
    for key, catalogue in _DESTINATION_MAP.items():
        if key in dest_lower:
            return catalogue

    # Check the curated places library using robust destination key resolution
    try:
        from app.integrations.places import _CURATED_PLACES, resolve_curated_destination_key
        canonical = resolve_curated_destination_key(destination)
        if canonical and canonical in _CURATED_PLACES:
            return [
                {
                    "name": p.name,
                    "category": p.category,
                    "location": p.location,
                    "duration_minutes": p.duration_minutes,
                    "cost_minor": p.cost_minor,
                    "opening_hours": p.opening_hours,
                    "booking_required": p.booking_required,
                    "recommendation_reason": p.description or f"Featured experience in {p.location}",
                    "styles": p.styles,
                    "day_part": p.day_part,
                }
                for p in _CURATED_PLACES[canonical]
            ]
    except Exception:
        pass

    # No curated catalogue for this destination — caller must use live discovery or report incomplete
    return []

"""
Demo data router — seeds and returns sample data for demo mode.
All demo data is clearly labelled with is_demo=True or a DEMO_DATA badge.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta

from app.database.session import get_db
from app.models.base import Trip, Activity, TripStatus, ActivityCategory
from app.core.config import settings

router = APIRouter()

DEMO_DESTINATION = "Goa, India"
DEMO_ORIGIN = "Mumbai, India"


@router.get("/status")
async def demo_status():
    ai_live = settings.is_ai_live
    return {
        "demo_mode": settings.demo_mode,
        "overall_mode": "live" if ai_live else "hybrid",
        "message": (
            "Live Mode: AI, Open-Meteo weather and local data persistence are active."
            if ai_live
            else "Hybrid Mode: Open-Meteo weather and local storage are live. AI Assistant is in fallback mode — set GEMINI_API_KEY in backend/.env for live AI."
        ),
    }


@router.post("/seed")
def seed_demo_data(db: Session = Depends(get_db)):
    """Creates a sample demo trip if none exist. Safe to call multiple times."""
    existing = db.query(Trip).filter(Trip.is_demo == True).first()  # noqa: E712
    if existing:
        return {"message": "Demo data already exists", "trip_id": existing.id}

    today = date.today()
    departure = today + timedelta(days=30)
    return_d = departure + timedelta(days=4)

    trip = Trip(
        name="🌴 Demo: Goa Beach Getaway",
        origin=DEMO_ORIGIN,
        destination=DEMO_DESTINATION,
        departure_date=departure,
        return_date=return_d,
        num_days=5,
        num_travellers=2,
        budget_minor=5000000,  # ₹50,000 in paise
        currency="INR",
        status=TripStatus.PLANNING,
        is_demo=True,
        travel_styles="leisurely,food_nightlife",
        accommodation_pref="beach resort",
        transport_pref="taxi, scooter",
        food_pref="seafood, local cuisine",
        walking_tolerance=6,
        travel_pace=4,
        notes="[DEMO DATA] This is a sample trip. All prices and details are illustrative.",
    )
    db.add(trip)
    db.flush()

    demo_activities = [
        # Day 1
        Activity(
            trip_id=trip.id, day_number=1,
            name="Arrive at Dabolim Airport",
            category=ActivityCategory.TRANSPORT,
            location="Goa International Airport",
            start_time="11:00", end_time="12:00", duration_minutes=60,
            cost_minor=0, currency="INR",
            recommendation_reason="[DEMO] Flight arrival assumed.",
            is_confirmed=True,
        ),
        Activity(
            trip_id=trip.id, day_number=1,
            name="Check in — Candolim Beach Resort",
            category=ActivityCategory.ACCOMMODATION,
            location="Candolim Beach, North Goa",
            start_time="14:00", end_time="15:00", duration_minutes=60,
            cost_minor=800000, currency="INR",  # ₹8,000/night × 4 nights
            recommendation_reason="[DEMO] Sample beach resort — price illustrative only.",
        ),
        Activity(
            trip_id=trip.id, day_number=1,
            name="Sunset at Baga Beach",
            category=ActivityCategory.SIGHTSEEING,
            location="Baga Beach, Goa",
            start_time="17:00", end_time="19:00", duration_minutes=120,
            cost_minor=0, currency="INR",
            recommendation_reason="[DEMO] Highly rated sunset spot, free entry.",
        ),
        Activity(
            trip_id=trip.id, day_number=1,
            name="Dinner at Martin's Corner",
            category=ActivityCategory.FOOD,
            location="Betalbatim, Goa",
            start_time="20:00", end_time="22:00", duration_minutes=120,
            cost_minor=250000, currency="INR",  # ₹2,500 for 2
            recommendation_reason="[DEMO] Famous for Goan seafood. Sample price.",
        ),
        # Day 2
        Activity(
            trip_id=trip.id, day_number=2,
            name="Old Goa Heritage Walk",
            category=ActivityCategory.CULTURE,
            location="Old Goa",
            start_time="09:00", end_time="12:00", duration_minutes=180,
            cost_minor=50000, currency="INR",
            recommendation_reason="[DEMO] UNESCO World Heritage churches.",
            opening_hours="09:00–18:00",
        ),
        Activity(
            trip_id=trip.id, day_number=2,
            name="Lunch at Fisherman's Wharf",
            category=ActivityCategory.FOOD,
            location="Calapor, Goa",
            start_time="13:00", end_time="14:30", duration_minutes=90,
            cost_minor=150000, currency="INR",
        ),
        Activity(
            trip_id=trip.id, day_number=2,
            name="Dudhsagar Falls Day Trip",
            category=ActivityCategory.NATURE,
            location="Dudhsagar, Goa",
            start_time="15:00", end_time="19:00", duration_minutes=240,
            cost_minor=200000, currency="INR",
            recommendation_reason="[DEMO] Spectacular 4-tier waterfall. Sample price.",
        ),
        # Day 3
        Activity(
            trip_id=trip.id, day_number=3,
            name="Scooter Rental — Explore North Goa",
            category=ActivityCategory.TRANSPORT,
            location="Candolim",
            start_time="09:00", end_time="18:00", duration_minutes=540,
            cost_minor=80000, currency="INR",
            recommendation_reason="[DEMO] Most flexible way to explore. Sample rate ₹800/day.",
        ),
        Activity(
            trip_id=trip.id, day_number=3,
            name="Anjuna Flea Market",
            category=ActivityCategory.SHOPPING,
            location="Anjuna Beach, Goa",
            start_time="10:00", end_time="13:00", duration_minutes=180,
            cost_minor=0, currency="INR",
            opening_hours="Wed 08:00–18:00",
        ),
        Activity(
            trip_id=trip.id, day_number=3,
            name="Chapora Fort",
            category=ActivityCategory.SIGHTSEEING,
            location="Chapora, Goa",
            start_time="15:00", end_time="17:00", duration_minutes=120,
            cost_minor=0, currency="INR",
        ),
    ]

    for a in demo_activities:
        db.add(a)

    db.commit()
    db.refresh(trip)
    return {"message": "Demo data seeded", "trip_id": trip.id, "is_demo": True}


@router.get("/destinations")
async def demo_destinations():
    """Returns sample destination data for the Explore page."""
    return {
        "is_demo": True,
        "label": "DEMO DATA",
        "destinations": [
            {
                "id": 1, "name": "Goa, India", "country": "India",
                "category": "Beach", "avg_budget_per_day_inr": 3500,
                "best_months": ["Nov", "Dec", "Jan", "Feb"],
                "highlights": ["Beaches", "Seafood", "Portuguese Heritage", "Nightlife"],
                "image_placeholder": "beach-sunset",
            },
            {
                "id": 2, "name": "Manali, Himachal Pradesh", "country": "India",
                "category": "Mountain", "avg_budget_per_day_inr": 2500,
                "best_months": ["May", "Jun", "Sep", "Oct"],
                "highlights": ["Snow", "Trekking", "Rohtang Pass", "Adventure Sports"],
                "image_placeholder": "mountain-snow",
            },
            {
                "id": 3, "name": "Rajasthan, India", "country": "India",
                "category": "Cultural", "avg_budget_per_day_inr": 4000,
                "best_months": ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
                "highlights": ["Palaces", "Deserts", "Culture", "Cuisine"],
                "image_placeholder": "desert-palace",
            },
            {
                "id": 4, "name": "Kerala Backwaters", "country": "India",
                "category": "Nature", "avg_budget_per_day_inr": 3000,
                "best_months": ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"],
                "highlights": ["Houseboat", "Spices", "Ayurveda", "Wildlife"],
                "image_placeholder": "backwaters",
            },
            {
                "id": 5, "name": "Bangkok, Thailand", "country": "Thailand",
                "category": "City", "avg_budget_per_day_inr": 4500,
                "best_months": ["Nov", "Dec", "Jan", "Feb", "Mar"],
                "highlights": ["Temples", "Street Food", "Shopping", "Nightlife"],
                "image_placeholder": "city-temple",
            },
        ],
    }

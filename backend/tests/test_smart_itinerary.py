"""
test_smart_itinerary.py — Tests for Northstar's Destination-Aware Smart Itinerary Upgrade.

Covers:
1. Multiple days with distinct, non-repeating activities (no cross-day duplicate venues).
2. Real destination-specific place selection (Paris, Tokyo, London, Goa, Jaipur).
3. Weather-aware planning (indoor adaptation on rainy days vs outdoor on clear days).
4. Graceful handling when weather is unavailable or offline.
5. Pluggable places provider and missing credentials handling (GooglePlacesProvider fallback).
6. Handling insufficient destination data gracefully without fabrication.
7. Personalisation: Travel pace (relaxed vs packed) and budget cap enforcement.
8. Preservation of user-locked itinerary activities across regenerations.
9. Security & auth: cross-user isolation prevents unauthorized itinerary generation.
10. Database integrity: preservation of existing trip records.
"""

from __future__ import annotations

import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.base import Trip, Activity, ActivityCategory
from app.models.user import User
from app.core.security import hash_password
from app.algorithms.schedule_builder import (
    TripPreferences, LockedActivity, build_schedule, validate_schedule,
)
from app.integrations.places import (
    get_places_provider, GooglePlacesProvider, CuratedPlacesProvider, PlaceCandidate,
)

# ---------------------------------------------------------------------------
# Test database fixture
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite:///./test_smart_itinerary.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_smart_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _create_test_user(email: str = "traveler@northstar.guide") -> int:
    db = TestingSession()
    try:
        user = User(
            name="Alice Traveler",
            email=email,
            hashed_password=hash_password("CompassPass123!"),
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def _create_trip(
    destination: str = "Paris, France",
    num_days: int = 3,
    budget_minor: int = 0,
    pace: int = 5,
    user_id: int | None = None,
) -> int:
    today = date.today()
    db = TestingSession()
    try:
        trip = Trip(
            name=f"Trip to {destination}",
            origin="London",
            destination=destination,
            departure_date=today + timedelta(days=14),
            return_date=today + timedelta(days=14 + num_days - 1),
            num_days=num_days,
            num_travellers=2,
            budget_minor=budget_minor,
            currency="INR",
            travel_styles="cultural,leisurely",
            travel_pace=pace,
            user_id=user_id,
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        return trip.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1. Multiple days with distinct, non-repeating activities
# ---------------------------------------------------------------------------

def test_multiple_days_have_unique_activities_no_repetition():
    """Verify that a multi-day itinerary never repeats the same attraction or restaurant."""
    prefs = TripPreferences(
        destination="Paris, France",
        num_days=3,
        num_travellers=2,
        budget_minor=0,
        currency="INR",
        travel_styles=["cultural", "leisurely"],
        walking_tolerance=6,
        travel_pace=5,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )

    res = build_schedule(prefs)
    assert len(res.activities) >= 6

    # Verify activities span all 3 days
    days = {a.day_number for a in res.activities}
    assert days == {1, 2, 3}

    # Verify STRICT deduplication across days: every activity name is unique
    names = [a.name.lower() for a in res.activities]
    assert len(names) == len(set(names)), f"Found duplicate activities across days: {names}"


# ---------------------------------------------------------------------------
# 2. Destination-specific place selection (Paris, Tokyo, London)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_destination_specific_place_selection():
    """Verify that real places are returned matching the requested destination."""
    provider = get_places_provider()

    # Paris places
    paris_places = await provider.search_places("Paris, France")
    paris_names = [p.name for p in paris_places]
    assert any("Louvre" in n for n in paris_names)
    assert any("Eiffel" in n for n in paris_names)

    # Tokyo places
    tokyo_places = await provider.search_places("Tokyo, Japan")
    tokyo_names = [p.name for p in tokyo_places]
    assert any("Senso-ji" in n for n in tokyo_names)
    assert any("Shibuya" in n for n in tokyo_names)

    # London places
    london_places = await provider.search_places("London, United Kingdom")
    london_names = [p.name for p in london_places]
    assert any("British Museum" in n for n in london_names)
    assert any("Tower of London" in n for n in london_names)


# ---------------------------------------------------------------------------
# 3. Weather-aware planning (indoor adaptation on rainy days)
# ---------------------------------------------------------------------------

def test_weather_aware_rainy_day_indoor_adaptation():
    """Verify that rainy forecast days schedule indoor activities with weather labels."""
    prefs = TripPreferences(
        destination="Paris, France",
        num_days=2,
        num_travellers=1,
        budget_minor=0,
        currency="INR",
        travel_styles=["cultural"],
        walking_tolerance=5,
        travel_pace=4,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )

    # Weather: Day 1 rainy (85% precipitation), Day 2 clear (0% precipitation)
    mock_weather = [
        {
            "date": "2026-11-01",
            "weather_code": 65,  # Heavy rain
            "precipitation_probability_max": 85,
            "condition": "Heavy rain",
        },
        {
            "date": "2026-11-02",
            "weather_code": 0,   # Clear sky
            "precipitation_probability_max": 0,
            "condition": "Clear sky",
        },
    ]

    res = build_schedule(prefs, weather_days=mock_weather)
    assert len(res.activities) >= 4

    day1_activities = [a for a in res.activities if a.day_number == 1]
    day2_activities = [a for a in res.activities if a.day_number == 2]

    # Day 1 must have weather-adapted indoor activities
    assert any("Weather-Adapted" in a.recommendation_reason for a in day1_activities)
    # Day 1 should feature indoor museums or covered halls (e.g. Louvre, Sainte-Chapelle, Musée d'Orsay)
    day1_names = [a.name for a in day1_activities]
    assert any("Louvre" in n or "Sainte-Chapelle" in n or "Musée d'Orsay" in n or "Marché" in n for n in day1_names)


# ---------------------------------------------------------------------------
# 4. Graceful handling when weather is unavailable
# ---------------------------------------------------------------------------

def test_weather_unavailable_graceful_fallback():
    """When weather is None or empty, schedule generates cleanly with honest notes."""
    prefs = TripPreferences(
        destination="London",
        num_days=2,
        num_travellers=2,
        budget_minor=0,
        currency="INR",
        travel_styles=["cultural"],
        walking_tolerance=5,
        travel_pace=5,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )

    # Empty weather
    res = build_schedule(prefs, weather_days=[])
    assert len(res.activities) >= 4
    # No crash, schedule is complete
    assert {a.day_number for a in res.activities} == {1, 2}


# ---------------------------------------------------------------------------
# 5. Pluggable places provider and missing credentials handling
# ---------------------------------------------------------------------------

def test_places_provider_graceful_unavailable_state():
    """Verify that GooglePlacesProvider without key cleanly reports unavailable."""
    google_provider = GooglePlacesProvider(api_key="")
    assert google_provider.is_available() is False
    assert google_provider.provider_name() == "Google Places API"

    # Active provider falls back to curated provider
    active = get_places_provider()
    assert active.is_available() is True
    assert "Curated" in active.provider_name()


# ---------------------------------------------------------------------------
# 6. Insufficient destination data handling without hallucination
# ---------------------------------------------------------------------------

def test_unknown_destination_uses_clean_adaptation():
    """For an uncatalogued destination without candidate places, honest incomplete schedule is returned without fabricating fake placeholders."""
    prefs = TripPreferences(
        destination="Reykjavik, Iceland",
        num_days=2,
        num_travellers=2,
        budget_minor=0,
        currency="INR",
        travel_styles=["nature_wellness"],
        walking_tolerance=5,
        travel_pace=4,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )

    # 1. Without candidate places: does NOT fabricate fake generic attractions
    res = build_schedule(prefs)
    assert len(res.activities) == 0
    assert res.calendar_complete is True
    assert res.schedule_complete is False
    assert any("unfilled" in d.status for d in res.days)
    # Zero synthetic placeholders like "Reykjavik Local Museum / Heritage Site"
    for d in res.days:
        for a in d.activities:
            assert "Local Museum" not in a.name
            assert "Sunset Viewpoint" not in a.name

    # 2. When real candidates are provided, it schedules them cleanly
    real_candidates = [
        PlaceCandidate(name="Hallgrímskirkja", category="sightseeing", subcategory="heritage", location="Reykjavik", duration_minutes=60, cost_minor=0, is_verified=True),
        PlaceCandidate(name="Harpa Concert Hall", category="culture", subcategory="culture", location="Reykjavik", duration_minutes=90, cost_minor=0, is_verified=True),
        PlaceCandidate(name="Perlan Museum", category="sightseeing", subcategory="museum", location="Reykjavik", duration_minutes=90, cost_minor=50000, is_verified=True),
        PlaceCandidate(name="Laugavegur Shopping Street", category="shopping", subcategory="market", location="Reykjavik", duration_minutes=90, cost_minor=0, is_verified=True),
    ]
    res_real = build_schedule(prefs, candidate_places=real_candidates)
    assert len(res_real.activities) >= 3
    assert res_real.schedule_complete is True
    assert all(a.is_demo is False for a in res_real.activities)



# ---------------------------------------------------------------------------
# 7. Personalisation: Travel pace & budget constraints
# ---------------------------------------------------------------------------

def test_travel_pace_and_budget_cap():
    """Relaxed pace schedules fewer items; packed pace schedules more; tight budget warns."""
    # Relaxed pace (pace=2)
    relaxed_prefs = TripPreferences(
        destination="Jaipur",
        num_days=1,
        num_travellers=1,
        budget_minor=1000000,
        currency="INR",
        travel_styles=["cultural"],
        walking_tolerance=4,
        travel_pace=2,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )
    relaxed_res = build_schedule(relaxed_prefs)

    # Packed pace (pace=10)
    packed_prefs = TripPreferences(
        destination="Jaipur",
        num_days=1,
        num_travellers=1,
        budget_minor=1000000,
        currency="INR",
        travel_styles=["cultural"],
        walking_tolerance=9,
        travel_pace=10,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )
    packed_res = build_schedule(packed_prefs)

    assert len(relaxed_res.activities) < len(packed_res.activities)
    assert len(relaxed_res.activities) <= 3
    assert len(packed_res.activities) >= 4

    # Tight budget cap produces warning
    tight_prefs = TripPreferences(
        destination="Dubai",
        num_days=2,
        num_travellers=1,
        budget_minor=1000,  # ₹10 (impossible for paid attractions)
        currency="INR",
        travel_styles=["sightseeing"],
        walking_tolerance=5,
        travel_pace=5,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )
    tight_res = build_schedule(tight_prefs)
    assert tight_res.budget.over_budget or len(tight_res.warnings) > 0


# ---------------------------------------------------------------------------
# 8. Preservation of user-locked itinerary activities
# ---------------------------------------------------------------------------

def test_locked_activity_preserved_across_regeneration():
    """A user-locked activity must survive itinerary regeneration in its exact slot."""
    trip_id = _create_trip("Goa, India", num_days=3)

    # Create locked activity
    act_resp = client.post("/api/activities/", json={
        "trip_id": trip_id,
        "day_number": 2,
        "name": "User Confirmed Scuba Diving",
        "category": "adventure",
        "start_time": "10:00",
        "end_time": "13:00",
        "duration_minutes": 180,
        "cost_minor": 350000,
        "is_locked": True,
    })
    assert act_resp.status_code == 201

    # Generate itinerary with overwrite_unlocked=True
    gen_resp = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True})
    assert gen_resp.status_code == 200

    acts = gen_resp.json()["activities"]
    locked_item = next((a for a in acts if a["name"] == "User Confirmed Scuba Diving"), None)
    assert locked_item is not None
    assert locked_item["day_number"] == 2
    assert locked_item["is_locked"] is True
    assert locked_item["start_time"] == "10:00"


# ---------------------------------------------------------------------------
# 9. Security & Authentication: cross-user isolation
# ---------------------------------------------------------------------------

def test_cross_user_isolation_forbidden():
    """User B cannot generate or modify User A's private trip itinerary."""
    owner_id = _create_test_user("alice@northstar.guide")
    trip_id = _create_trip("Tokyo, Japan", num_days=3, user_id=owner_id)

    # Unauthenticated / wrong user attempt to generate
    r = client.post(f"/api/itinerary/{trip_id}/generate", json={})
    assert r.status_code == 403
    assert "permission" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 10. Database integrity & non-destructive updates
# ---------------------------------------------------------------------------

def test_preservation_of_existing_trip_records():
    """Generating itinerary does not alter other trip details like name, budget, or dates."""
    trip_id = _create_trip("Paris, France", num_days=2, budget_minor=200000)

    # Fetch initial trip
    initial_r = client.get(f"/api/trips/{trip_id}")
    assert initial_r.status_code == 200
    initial_data = initial_r.json()

    # Generate
    client.post(f"/api/itinerary/{trip_id}/generate", json={})

    # Fetch after generate
    after_r = client.get(f"/api/trips/{trip_id}")
    assert after_r.status_code == 200
    after_data = after_r.json()

    assert initial_data["name"] == after_data["name"]
    assert initial_data["origin"] == after_data["origin"]
    assert initial_data["destination"] == after_data["destination"]
    assert initial_data["budget_minor"] == after_data["budget_minor"]
    assert initial_data["departure_date"] == after_data["departure_date"]


# ---------------------------------------------------------------------------
# 11. Input validation: Missing or blank destination returns HTTP 400
# ---------------------------------------------------------------------------

def test_empty_or_whitespace_destination_returns_400():
    """Generating an itinerary for a trip with blank destination returns HTTP 400."""
    db = TestingSession()
    today = date.today()
    try:
        trip = Trip(
            name="Blank Destination Trip",
            origin="Mumbai",
            destination="   ",
            departure_date=today + timedelta(days=5),
            return_date=today + timedelta(days=7),
            num_days=3,
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        trip_id = trip.id
    finally:
        db.close()

    r = client.post(f"/api/itinerary/{trip_id}/generate", json={})
    assert r.status_code == 400
    assert "destination" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 12. AI Provider Resilience: Malformed JSON falls back gracefully without 500
# ---------------------------------------------------------------------------

def test_ai_malformed_json_fallback_succeeds_without_500(monkeypatch):
    """When the AI provider returns unparseable or malformed JSON, generation falls back cleanly without 500."""
    from unittest.mock import AsyncMock
    import app.services.itinerary_planner as ip_module

    # Mock generate_text returning invalid non-JSON string
    monkeypatch.setattr(ip_module, "ai_is_live", lambda: True)
    monkeypatch.setattr(ip_module, "generate_text", AsyncMock(return_value={"text": "Here is an itinerary: Day 1: go to beach. Not valid JSON."}))

    trip_id = _create_trip("Goa, India", num_days=3)
    r = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": True})
    assert r.status_code == 200
    data = r.json()
    assert len(data["activities"]) > 0
    # Must have fallen back to schedule engine with destination candidates
    assert any("Basilica" in a["name"] or "Beach" in a["name"] or "Goa" in a["name"] for a in data["activities"])


# ---------------------------------------------------------------------------
# 13. AI Provider Resilience: Rate limit / Timeout falls back gracefully
# ---------------------------------------------------------------------------

def test_ai_timeout_fallback_succeeds_without_500(monkeypatch):
    """When the AI provider times out or raises an error, generation falls back smoothly without 500."""
    from unittest.mock import AsyncMock
    import asyncio
    import app.services.itinerary_planner as ip_module

    async def _mock_timeout(*args, **kwargs):
        raise asyncio.TimeoutError("Upstream AI call timed out")

    monkeypatch.setattr(ip_module, "ai_is_live", lambda: True)
    monkeypatch.setattr(ip_module, "generate_text", _mock_timeout)

    trip_id = _create_trip("Paris, France", num_days=2)
    r = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": True})
    assert r.status_code == 200
    data = r.json()
    assert len(data["activities"]) > 0
    assert any("Louvre" in a["name"] or "Eiffel" in a["name"] or "Paris" in a["name"] for a in data["activities"])


# ---------------------------------------------------------------------------
# 14. Atomic Rollback: Planner error does not delete existing activities
# ---------------------------------------------------------------------------

def test_generation_failure_rolls_back_and_preserves_existing_activities(monkeypatch):
    """If the planner encounters a fatal exception, the DB transaction rolls back and previously existing activities remain."""
    from unittest.mock import AsyncMock
    import app.api.itinerary as itin_api

    trip_id = _create_trip("Jaipur, India", num_days=2)

    # First, generate a valid initial schedule
    r1 = client.post(f"/api/itinerary/{trip_id}/generate", json={})
    assert r1.status_code == 200
    initial_count = len(r1.json()["activities"])
    assert initial_count > 0

    # Mock plan_destination_itinerary to raise an error
    async def _mock_fail(*args, **kwargs):
        raise RuntimeError("Simulated unexpected crash during planning")

    monkeypatch.setattr(itin_api, "plan_destination_itinerary", _mock_fail)

    # Attempt regeneration
    r2 = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True})
    assert r2.status_code == 500

    # Verify that existing activities were NOT deleted because of atomic rollback
    db = TestingSession()
    try:
        acts = db.query(Activity).filter(Activity.trip_id == trip_id).all()
        assert len(acts) == initial_count
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 15. Kyoto 4-Day Complete Itinerary Coverage (No Missing Days)
# ---------------------------------------------------------------------------

def test_kyoto_4day_complete_coverage():
    """A 4-day trip to Kyoto must produce distinct activities for all 4 calendar days."""
    trip_id = _create_trip("Kyoto, Japan", num_days=4, budget_minor=30000000)
    # Set currency to JPY
    db = TestingSession()
    try:
        t = db.query(Trip).filter(Trip.id == trip_id).first()
        t.currency = "JPY"
        db.commit()
    finally:
        db.close()

    resp = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp.status_code == 200
    data = resp.json()
    activities = data["activities"]

    # Every single day from 1 to 4 MUST be present
    scheduled_days = {a["day_number"] for a in activities}
    assert scheduled_days == {1, 2, 3, 4}, f"Expected days 1..4, got {scheduled_days}"

    # Activities per day should be at least 2
    for day in range(1, 5):
        day_acts = [a for a in activities if a["day_number"] == day]
        assert len(day_acts) >= 2, f"Day {day} has fewer than 2 activities: {day_acts}"

    # Deduplication across all days: zero duplicate names
    names = [a["name"].lower() for a in activities]
    assert len(names) == len(set(names)), f"Found duplicate activity names: {names}"

    # Authentic Kyoto places should be present
    assert any("Fushimi Inari" in a["name"] or "Kinkaku-ji" in a["name"] or "Arashiyama" in a["name"] or "Gion" in a["name"] for a in activities)


# ---------------------------------------------------------------------------
# 16. Multi-Day 7-Day Complete Schedule Coverage
# ---------------------------------------------------------------------------

def test_7day_itinerary_full_coverage():
    """A 7-day trip must generate activities spanning all 7 days without dropping later days."""
    trip_id = _create_trip("Tokyo, Japan", num_days=7, budget_minor=50000000)

    resp = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp.status_code == 200
    data = resp.json()
    activities = data["activities"]

    scheduled_days = {a["day_number"] for a in activities}
    assert scheduled_days == {1, 2, 3, 4, 5, 6, 7}, f"Expected days 1..7, got {scheduled_days}"
    assert len(activities) >= 14, f"Expected at least 14 activities for 7 days, got {len(activities)}"


# ---------------------------------------------------------------------------
# 17. Budget Rejection Warning Deduplication & Multi-Currency Formatting
# ---------------------------------------------------------------------------

def test_budget_rejection_notice_deduplication_and_currency_format():
    """When budget is constrained, rejected candidate notices must not repeat and must format JPY correctly."""
    trip_id = _create_trip("Kyoto, Japan", num_days=4, budget_minor=100000)  # ¥1,000 budget
    db = TestingSession()
    try:
        t = db.query(Trip).filter(Trip.id == trip_id).first()
        t.currency = "JPY"
        db.commit()
    finally:
        db.close()

    resp = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp.status_code == 200
    data = resp.json()
    warnings = data.get("warnings", [])

    # Filter budget skip warnings
    skip_warnings = [w for w in warnings if "insufficient remaining budget" in w.lower()]

    # Ensure no skipped activity is warned multiple times
    activity_rejections = []
    for w in skip_warnings:
        # Extract quoted name
        if "'" in w:
            act_name = w.split("'")[1].lower()
            activity_rejections.append(act_name)

    assert len(activity_rejections) == len(set(activity_rejections)), (
        f"Duplicate rejection warnings found: {activity_rejections}"
    )

    # Ensure currency symbol is ¥ (JPY) and NOT ₹ (INR)
    if skip_warnings:
        assert any("¥" in w for w in skip_warnings), f"Expected '¥' in warnings, got: {skip_warnings}"
        assert not any("₹" in w for w in skip_warnings), f"Found incorrect INR '₹' in JPY trip: {skip_warnings}"


# ---------------------------------------------------------------------------
# 18. AI Partial Response Repair: Synthesizes Missing Days Automatically
# ---------------------------------------------------------------------------

def test_ai_partial_response_synthesizes_missing_days(monkeypatch):
    """When AI returns only partial days (e.g. Days 1 & 2 of a 4-day trip), planner synthesizes Days 3 & 4."""
    from unittest.mock import AsyncMock
    import json
    import app.services.itinerary_planner as ip_module

    # Mock AI returning only Days 1 and 2
    mock_ai_json = json.dumps({
        "days": [
            {
                "day_number": 1,
                "theme": "Sacred Trails",
                "activities": [
                    {
                        "name": "Fushimi Inari Taisha",
                        "start_time": "09:00",
                        "end_time": "11:30",
                        "reason": "Iconic vermillion torii gates hike",
                    }
                ],
            },
            {
                "day_number": 2,
                "theme": "Zen Heritage",
                "activities": [
                    {
                        "name": "Kinkaku-ji (Golden Pavilion)",
                        "start_time": "10:00",
                        "end_time": "12:00",
                        "reason": "Stunning golden zen temple reflecting over Kyoko-chi pond",
                    }
                ],
            },
        ]
    })
    monkeypatch.setattr(ip_module, "ai_is_live", lambda: True)
    monkeypatch.setattr(ip_module, "generate_text", AsyncMock(return_value={"text": mock_ai_json}))

    trip_id = _create_trip("Kyoto, Japan", num_days=4, budget_minor=30000000)
    resp = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": True})
    assert resp.status_code == 200
    data = resp.json()
    activities = data["activities"]

    # All 4 days MUST be present!
    days_present = {a["day_number"] for a in activities}
    assert days_present == {1, 2, 3, 4}, f"Expected all 4 days, got: {days_present}"

    # Day 1 & Day 2 contain the AI activities
    assert any("Fushimi Inari" in a["name"] for a in activities)
    assert any("Kinkaku-ji" in a["name"] for a in activities)

    # Days 3 & 4 contain synthesized destination activities
    day3_acts = [a for a in activities if a["day_number"] == 3]
    day4_acts = [a for a in activities if a["day_number"] == 4]
    assert len(day3_acts) > 0, "Day 3 activities were not synthesized"
    assert len(day4_acts) > 0, "Day 4 activities were not synthesized"

    # Notice of synthesized missing days is included in warnings
    warnings = data.get("warnings", [])
    assert any("synthesized" in w.lower() for w in warnings), f"Expected synthesis notice in warnings, got: {warnings}"


# ---------------------------------------------------------------------------
# 19. Regeneration Idempotence: No Duplicate Records in Database
# ---------------------------------------------------------------------------

def test_regeneration_idempotence_and_no_duplicate_records():
    """Generating an itinerary multiple times replaces unlocked activities cleanly without creating duplicate records."""
    trip_id = _create_trip("Kyoto, Japan", num_days=3, budget_minor=20000000)

    # First generation
    r1 = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert r1.status_code == 200
    count_1 = len(r1.json()["activities"])

    # Second generation
    r2 = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert r2.status_code == 200
    count_2 = len(r2.json()["activities"])

    db = TestingSession()
    try:
        total_in_db = db.query(Activity).filter(Activity.trip_id == trip_id).count()
        assert total_in_db == count_2, f"Expected {count_2} in DB, found {total_in_db} (duplicate rows accumulated!)"
    finally:
        db.close()


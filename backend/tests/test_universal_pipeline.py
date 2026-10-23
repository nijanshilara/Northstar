"""
test_universal_pipeline.py — Phase 9 Universal Destination Discovery & Smart Itinerary Tests.

Covers all 15 mandatory scenarios:
1. New Delhi — structured destination string with city, region, country.
2. Agra — heritage destination.
3. London — major international city.
4. Kyoto — established curated destination.
5. Unfamiliar / uncatalogued destination (e.g. Florence, Italy) via OpenStreetMap.
6. Small town with limited mapped places (honest partially filled days).
7. Ambiguous city names in different countries / states (disambiguation).
8. Geocoding failure handling (graceful incomplete itinerary, no fake places).
9. Overpass timeout / mirror unavailable handling (failover & safe fallback).
10. Gemini / AI unavailable (deterministic Python baseline).
11. 5-day and 7-day multi-day itineraries (all days created, no repetition).
12. Preservation of locked activities during regeneration.
13. Restrictive budget filtering & breakdown.
14. Regeneration idempotence and atomic DB persistence.
15. Badge verification: No generic placeholders incorrectly marked as real.
16. Live network provider test (Open-Meteo & Nominatim).
"""

from __future__ import annotations

import pytest
import asyncio
import uuid
from datetime import date, timedelta
from unittest.mock import patch, MagicMock, AsyncMock
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
from app.integrations.geocoding import (
    UniversalDestinationGeocoder, ResolvedDestination, get_geocoder,
)
from app.integrations.places import (
    PlaceCandidate, OpenStreetMapPlacesProvider, CompositePlacesProvider, CuratedPlacesProvider,
    get_places_provider,
)
from app.services.itinerary_planner import plan_destination_itinerary


# ---------------------------------------------------------------------------
# Test database fixture
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///./test_universal_pipeline.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    return TestClient(app)


def _make_prefs(
    destination: str,
    num_days: int = 3,
    budget_minor: int = 0,
    pace: int = 5,
    walking_tolerance: int = 5,
    travel_styles: list[str] | None = None,
    currency: str = "INR",
    must_visit: str | None = None,
    avoid: str | None = None,
) -> TripPreferences:
    return TripPreferences(
        destination=destination,
        num_days=num_days,
        num_travellers=1,
        budget_minor=budget_minor,
        currency=currency,
        travel_styles=travel_styles or ["cultural", "sightseeing"],
        walking_tolerance=walking_tolerance,
        travel_pace=pace,
        food_pref=None,
        must_visit=must_visit,
        avoid=avoid,
    )


def _create_test_user(db) -> User:
    user = User(
        name="Northstar Traveler",
        email=f"traveler_{uuid.uuid4().hex[:8]}@northstar.example",
        hashed_password=hash_password("compass123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_trip(db, destination: str, num_days: int = 3, budget_minor: int = 10000000, user_id: int | None = None) -> int:
    dep = date.today() + timedelta(days=7)
    ret = dep + timedelta(days=num_days - 1)
    trip = Trip(
        user_id=user_id,
        name=f"Trip to {destination}",
        origin="London, UK",
        destination=destination,
        departure_date=dep,
        return_date=ret,
        num_days=num_days,
        num_travellers=2,
        budget_minor=budget_minor,
        currency="INR",
        travel_pace=3,
        walking_tolerance=4,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip.id


# ---------------------------------------------------------------------------
# 1. New Delhi — structured destination string
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_1_new_delhi_structured_destination():
    dest_str = "New Delhi, National Capital Territory of Delhi, India"
    geocoder = UniversalDestinationGeocoder()
    resolved = await geocoder.resolve(dest_str)
    assert resolved is not None
    assert "Delhi" in resolved.canonical_name or "New Delhi" in resolved.canonical_name
    assert 28.0 <= resolved.latitude <= 29.0
    assert 76.5 <= resolved.longitude <= 77.8
    assert resolved.country == "India"

    # Schedule using realistic New Delhi candidates from OSM
    delhi_candidates = [
        PlaceCandidate(name="India Gate", category="sightseeing", subcategory="monument", location="Rajpath", duration_minutes=60, cost_minor=0, latitude=28.6129, longitude=77.2295, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Humayun's Tomb", category="sightseeing", subcategory="heritage", location="Nizamuddin", duration_minutes=90, cost_minor=50000, latitude=28.5933, longitude=77.2507, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Qutub Minar", category="sightseeing", subcategory="heritage", location="Mehrauli", duration_minutes=90, cost_minor=50000, latitude=28.5244, longitude=77.1855, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="National Museum", category="culture", subcategory="museum", location="Janpath", duration_minutes=120, cost_minor=20000, latitude=28.6118, longitude=77.2193, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Chandni Chowk Market", category="shopping", subcategory="market", location="Old Delhi", duration_minutes=90, cost_minor=0, latitude=28.6506, longitude=77.2303, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Lodhi Gardens", category="nature", subcategory="park", location="Lodhi Estate", duration_minutes=75, cost_minor=0, latitude=28.5931, longitude=77.2197, source="openstreetmap", is_verified=True),
    ]

    prefs = _make_prefs(dest_str, num_days=2, budget_minor=10000000)
    result = build_schedule(prefs, candidate_places=delhi_candidates)
    assert result.calendar_complete is True
    assert result.schedule_complete is True
    assert len(result.days) == 2
    assert all(d.status == "scheduled" for d in result.days)
    assert not any("Local Museum" in a.name for a in result.activities)
    assert not any("Sunset Viewpoint" in a.name for a in result.activities)


# ---------------------------------------------------------------------------
# 2. Agra — heritage destination
# ---------------------------------------------------------------------------
def test_2_agra_heritage_destination():
    dest_str = "Agra, Uttar Pradesh, India"
    agra_candidates = [
        PlaceCandidate(name="Taj Mahal", category="sightseeing", subcategory="heritage", location="Dharmapuri", duration_minutes=120, cost_minor=110000, latitude=27.1751, longitude=78.0421, source="curated", is_verified=True),
        PlaceCandidate(name="Agra Fort", category="sightseeing", subcategory="heritage", location="Rakabganj", duration_minutes=90, cost_minor=65000, latitude=27.1795, longitude=78.0211, source="curated", is_verified=True),
        PlaceCandidate(name="Mehtab Bagh", category="nature", subcategory="garden", location="Nagla Devjit", duration_minutes=60, cost_minor=25000, latitude=27.1800, longitude=78.0420, source="curated", is_verified=True),
        PlaceCandidate(name="Sadar Bazaar", category="shopping", subcategory="market", location="Agra Cantt", duration_minutes=60, cost_minor=0, latitude=27.1600, longitude=78.0100, source="curated", is_verified=True),
    ]
    prefs = _make_prefs(dest_str, num_days=2, budget_minor=5000000)
    result = build_schedule(prefs, candidate_places=agra_candidates)
    assert result.calendar_complete is True
    assert result.schedule_complete is True
    assert any("Taj Mahal" in a.name for a in result.activities)
    assert any("Agra Fort" in a.name for a in result.activities)


# ---------------------------------------------------------------------------
# 3. London — major international city
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_3_london_major_international_city():
    dest_str = "London, England, United Kingdom"
    provider = get_places_provider()
    places = await provider.search_places(dest_str)
    assert len(places) >= 5
    assert all(p.is_verified for p in places)
    assert not any("[DEMO]" in p.description for p in places)

    prefs = _make_prefs(dest_str, num_days=3, budget_minor=50000000, currency="GBP")
    result = build_schedule(prefs, candidate_places=places)
    assert result.calendar_complete is True
    assert result.schedule_complete is True
    assert len(result.days) == 3


# ---------------------------------------------------------------------------
# 4. Kyoto — established curated destination
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_4_kyoto_established_curated_destination():
    dest_str = "Kyoto, Japan"
    provider = get_places_provider()
    places = await provider.search_places(dest_str)
    assert len(places) >= 6
    names = [p.name for p in places]
    assert any("Fushimi Inari" in n for n in names)
    assert any("Kinkaku-ji" in n for n in names)

    prefs = _make_prefs(dest_str, num_days=3, budget_minor=20000000, currency="JPY")
    result = build_schedule(prefs, candidate_places=places)
    assert result.schedule_complete is True
    # Verify no place repeats across days
    act_names = [a.name for a in result.activities]
    assert len(act_names) == len(set(act_names))


# ---------------------------------------------------------------------------
# 5. Unfamiliar / uncatalogued destination (Florence, Italy) via OpenStreetMap
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_5_uncatalogued_valid_destination():
    dest_str = "Florence, Tuscany, Italy"
    # Curated catalogue should be empty for Florence
    curated = CuratedPlacesProvider()
    assert len(await curated.search_places(dest_str)) == 0

    # Mocked OSM places simulating real Overpass response for Florence
    osm_florence_places = [
        PlaceCandidate(name="Galleria degli Uffizi", category="culture", subcategory="museum", location="Piazzale degli Uffizi", duration_minutes=120, cost_minor=200000, latitude=43.7678, longitude=11.2553, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Cattedrale di Santa Maria del Fiore", category="sightseeing", subcategory="heritage", location="Piazza del Duomo", duration_minutes=75, cost_minor=0, latitude=43.7731, longitude=11.2560, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Ponte Vecchio", category="sightseeing", subcategory="viewpoint", location="Arno River", duration_minutes=45, cost_minor=0, latitude=43.7680, longitude=11.2532, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Piazzale Michelangelo", category="sightseeing", subcategory="viewpoint", location="Oltrarno", duration_minutes=60, cost_minor=0, latitude=43.7629, longitude=11.2650, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Giardino di Boboli", category="nature", subcategory="park", location="Piazza Pitti", duration_minutes=90, cost_minor=100000, latitude=43.7625, longitude=11.2483, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Mercato Centrale", category="shopping", subcategory="market", location="San Lorenzo", duration_minutes=60, cost_minor=0, latitude=43.7766, longitude=11.2535, source="openstreetmap", is_verified=True),
    ]

    with patch.object(OpenStreetMapPlacesProvider, "search_places", AsyncMock(return_value=osm_florence_places)):
        provider = CompositePlacesProvider()
        places = await provider.search_places(dest_str)
        assert len(places) == 6
        assert all(p.source == "openstreetmap" for p in places)
        assert all(p.is_verified is True for p in places)

        prefs = _make_prefs(dest_str, num_days=2, budget_minor=30000000, currency="EUR")
        result = build_schedule(prefs, candidate_places=places)
        assert result.calendar_complete is True
        assert result.schedule_complete is True
        assert not any("Local Museum" in a.name for a in result.activities)


# ---------------------------------------------------------------------------
# 6. Small town with limited mapped places (honest partially filled days)
# ---------------------------------------------------------------------------
def test_6_small_town_limited_places():
    dest_str = "Hallstatt, Upper Austria, Austria"
    # Only 2 places exist for a 3-day trip
    scanty_places = [
        PlaceCandidate(name="Hallstatt Skywalk", category="sightseeing", subcategory="viewpoint", location="Salzberg", duration_minutes=60, cost_minor=40000, latitude=47.5615, longitude=13.6441, source="openstreetmap", is_verified=True),
        PlaceCandidate(name="Hallstätter See Promenade", category="nature", subcategory="park", location="Seestraße", duration_minutes=45, cost_minor=0, latitude=47.5622, longitude=13.6490, source="openstreetmap", is_verified=True),
    ]
    prefs = _make_prefs(dest_str, num_days=3, budget_minor=10000000, currency="EUR")
    result = build_schedule(prefs, candidate_places=scanty_places)

    assert result.calendar_complete is True
    # Must NOT claim activity schedule is complete when days are unfilled
    assert result.schedule_complete is False
    # Exactly 3 calendar days must exist
    assert len(result.days) == 3
    # At least one day must be honestly marked unfilled
    unfilled_days = [d for d in result.days if d.status == "unfilled"]
    assert len(unfilled_days) >= 1
    assert any("No further verified destination places" in (d.unfilled_reason or "") for d in unfilled_days)
    # Zero fake generic placeholders injected
    for d in result.days:
        for a in d.activities:
            assert "Sunset Viewpoint" not in a.name
            assert "Local Museum" not in a.name


# ---------------------------------------------------------------------------
# 7. Ambiguous city names in different countries / states
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_7_ambiguous_city_names():
    geocoder = UniversalDestinationGeocoder()
    # Springfield, IL vs Springfield, MO
    res_il = await geocoder.resolve("Springfield, Illinois, United States")
    assert res_il is not None
    assert "Illinois" in res_il.region or "IL" in res_il.region or res_il.country == "United States"

    # Paris, France vs Paris, Texas
    res_paris_fr = await geocoder.resolve("Paris, France")
    assert res_paris_fr is not None
    assert res_paris_fr.country in ["France", "FR"]
    assert 48.0 <= res_paris_fr.latitude <= 49.0

    res_paris_tx = await geocoder.resolve("Paris, Texas, United States")
    assert res_paris_tx is not None
    assert res_paris_tx.country in ["United States", "US"]
    assert 33.0 <= res_paris_tx.latitude <= 34.5


# ---------------------------------------------------------------------------
# 8. Geocoding failure handling
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_8_geocoding_failure_handling():
    dest_str = "Nonexistentgibberishplace9999999"
    with patch("app.integrations.places.get_geocoder") as mock_get:
        mock_geo = MagicMock()
        mock_geo.resolve = AsyncMock(return_value=None)
        mock_get.return_value = mock_geo

        provider = OpenStreetMapPlacesProvider()
        places = await provider.search_places(dest_str)
        assert places == []

        # Scheduler returns honest incomplete schedule with 0 activities
        prefs = _make_prefs(dest_str, num_days=2, budget_minor=1000000)
        res = build_schedule(prefs, candidate_places=places)
        assert res.calendar_complete is True
        assert res.schedule_complete is False
        assert len(res.activities) == 0
        assert all(d.status == "unfilled" for d in res.days)


# ---------------------------------------------------------------------------
# 9. Overpass timeout / mirror unavailable handling
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_9_overpass_timeout_or_unavailable():
    dest_str = "Bruges, Belgium"
    resolved = ResolvedDestination(
        query=dest_str,
        canonical_name="Bruges, Flanders, Belgium",
        city="Bruges",
        region="Flanders",
        country="Belgium",
        country_code="be",
        latitude=51.2093,
        longitude=3.2247,
        bounding_box=(51.15, 3.15, 51.25, 3.30),
    )
    with patch("app.integrations.places.get_geocoder") as mock_get:
        mock_geo = MagicMock()
        mock_geo.resolve = AsyncMock(return_value=resolved)
        mock_get.return_value = mock_geo

        provider = OpenStreetMapPlacesProvider()
        with patch("httpx.AsyncClient.post", side_effect=Exception("Connection timed out")):
            places = await provider.search_places(dest_str)
            # Does NOT crash or throw 500; returns empty list
            assert places == []

            # Itinerary scheduler produces honest unfilled days rather than fake attractions
            prefs = _make_prefs(dest_str, num_days=2, budget_minor=1000000)
            res = build_schedule(prefs, candidate_places=places)
            assert res.calendar_complete is True
            assert res.schedule_complete is False
            assert len(res.activities) == 0


# ---------------------------------------------------------------------------
# 10. Gemini unavailable (deterministic Python baseline)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_10_gemini_unavailable_deterministic_baseline():
    local_db = TestingSession()
    try:
        trip_id = _create_trip(local_db, "Kyoto, Japan", num_days=3)
        trip = local_db.query(Trip).filter(Trip.id == trip_id).first()

        # Generate with use_ai=False
        result = await plan_destination_itinerary(trip=trip, locked_activities=[], use_ai=False)
        assert result.ai_enhanced is False
        assert "AI" in (result.ai_unavailable_reason or "")
        assert result.calendar_complete is True
        assert result.schedule_complete is True
        assert len(result.activities) > 0
    finally:
        local_db.close()




# ---------------------------------------------------------------------------
# 11. 5-day and 7-day multi-day itineraries
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_11_five_day_and_seven_day_itineraries():
    dest = "Tokyo, Japan"
    provider = get_places_provider()
    tokyo_places = await provider.search_places(dest)
    assert len(tokyo_places) >= 10

    # 5-day test
    prefs5 = _make_prefs(dest, num_days=5, budget_minor=50000000, currency="JPY")
    res5 = build_schedule(prefs5, candidate_places=tokyo_places)
    assert len(res5.days) == 5
    assert res5.calendar_complete is True
    assert res5.schedule_complete is True

    # 7-day test
    prefs7 = _make_prefs(dest, num_days=7, budget_minor=70000000, currency="JPY")
    res7 = build_schedule(prefs7, candidate_places=tokyo_places)
    assert len(res7.days) == 7
    assert res7.calendar_complete is True
    # Verify no duplicate activity names
    names = [a.name for a in res7.activities]
    assert len(names) == len(set(names))


# ---------------------------------------------------------------------------
# 12. Preservation of locked activities during regeneration
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_12_locked_activities_preserved():
    dest = "Kyoto, Japan"
    provider = get_places_provider()
    kyoto_places = await provider.search_places(dest)

    locked = [
        LockedActivity(
            id=999,
            day_number=2,
            start_time="14:00",
            end_time="16:00",
            name="Traditional Tea Ceremony Experience",
            category="culture",
            location="Gion",
            duration_minutes=120,
            cost_minor=500000,
            opening_hours=None,
            booking_required=False,
            recommendation_reason="Locked by user",
        )
    ]
    prefs = _make_prefs(dest, num_days=3, budget_minor=20000000, currency="JPY")
    result = build_schedule(prefs, locked=locked, candidate_places=kyoto_places)

    assert result.calendar_complete is True
    # Locked activity is present exactly on Day 2 at 14:00
    day2_acts = [a for a in result.activities if a.day_number == 2]
    tea = next((a for a in day2_acts if a.name == "Traditional Tea Ceremony Experience"), None)
    assert tea is not None
    assert tea.start_time == "14:00"
    assert tea.end_time == "16:00"
    assert tea.is_locked is True


# ---------------------------------------------------------------------------
# 13. Restrictive budget filtering & breakdown
# ---------------------------------------------------------------------------
def test_13_budget_restrictions_filtering():
    dest = "Paris, France"
    places = [
        PlaceCandidate(name="Expensive VIP Gala", category="culture", subcategory="event", location="Opera", duration_minutes=120, cost_minor=5000000, is_verified=True), # 50,000 INR
        PlaceCandidate(name="Louvre Museum Free Access", category="culture", subcategory="museum", location="Louvre", duration_minutes=120, cost_minor=0, is_verified=True),
        PlaceCandidate(name="Seine River Walk", category="sightseeing", subcategory="walk", location="Seine", duration_minutes=60, cost_minor=0, is_verified=True),
        PlaceCandidate(name="Tuileries Garden Walk", category="nature", subcategory="park", location="Tuileries", duration_minutes=60, cost_minor=0, is_verified=True),
    ]
    # Tight budget cap of 1,000 INR (100,000 minor units)
    prefs = _make_prefs(dest, num_days=2, budget_minor=100000, currency="INR")
    result = build_schedule(prefs, candidate_places=places)

    assert result.calendar_complete is True
    assert result.budget.total_minor <= 100000
    assert not any(a.name == "Expensive VIP Gala" for a in result.activities)


# ---------------------------------------------------------------------------
# 14. Regeneration idempotence and atomic DB persistence
# ---------------------------------------------------------------------------
def test_14_regeneration_persistence_and_database(client):
    db = TestingSession()
    try:
        trip_id = _create_trip(db, "Kyoto, Japan", num_days=2)
    finally:
        db.close()

    # 1. Generate itinerary
    r1 = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["calendar_complete"] is True
    assert data1["schedule_complete"] is True
    count1 = len(data1["activities"])
    assert count1 >= 4

    # 2. Get itinerary from GET endpoint (reloads from DB)
    r_get = client.get(f"/api/itinerary/{trip_id}")
    assert r_get.status_code == 200
    data_get = r_get.json()
    assert len(data_get["activities"]) == count1
    assert data_get["schedule_complete"] is True

    # 3. Regenerate — verify no duplicate activities created
    r2 = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert r2.status_code == 200
    data2 = r2.json()
    assert len(data2["activities"]) == count1


# ---------------------------------------------------------------------------
# 15. Badge verification: No generic placeholders incorrectly marked as real
# ---------------------------------------------------------------------------
def test_15_no_generic_placeholders_marked_as_real():
    # If a day has 0 real activities, schedule_complete MUST be False
    prefs = _make_prefs("EmptyDestination", num_days=2, budget_minor=0)
    result = build_schedule(prefs, candidate_places=[])

    assert result.calendar_complete is True
    # Crucial badge requirement:
    assert result.schedule_complete is False
    assert len(result.activities) == 0

    # Ensure zero synthetic placeholder items created
    for day in result.days:
        for a in day.activities:
            assert "Local Museum" not in a.name
            assert "Sunset Viewpoint" not in a.name
            assert "Market" not in a.name


# ---------------------------------------------------------------------------
# 16. Live network provider test (Open-Meteo & Nominatim)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_16_live_network_provider_resolution():
    geocoder = UniversalDestinationGeocoder()
    resolved = await geocoder.resolve("New Delhi, India")
    assert resolved is not None
    assert resolved.canonical_name is not None
    assert resolved.country == "India"
    assert 28.0 <= resolved.latitude <= 29.0

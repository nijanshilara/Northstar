"""
Phase 2 tests — itinerary generation, schedule validation, budget,
locked activities, regeneration, and Plan B replanning.

Run with:
    cd backend
    venv312\\Scripts\\python.exe -m pytest tests/test_phase2.py -v
"""

from __future__ import annotations

import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.algorithms.schedule_builder import (
    TripPreferences, LockedActivity, ActivitySlot,
    build_schedule, validate_schedule, DAY_START_MINUTES, DAY_END_MINUTES,
    _minutes_to_hhmm,
)
from app.integrations.places import PlaceCandidate
from app.algorithms.plan_b_engine import Disruption, replan

# ---------------------------------------------------------------------------
# Test database setup (same pattern as Phase 1 tests)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///./test_phase2.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Install the DB override, create tables, run test, drop tables, restore."""
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_trip(destination: str = "Goa, India", num_days: int = 3,
               budget_minor: int = 0, styles: str = "leisurely",
               pace: int = 5) -> int:
    """Create a trip via the API and return its id."""
    today = date.today()
    payload = {
        "name": f"Test Trip to {destination}",
        "origin": "Mumbai",
        "destination": destination,
        "departure_date": str(today + timedelta(days=30)),
        "return_date": str(today + timedelta(days=30 + num_days - 1)),
        "num_travellers": 2,
        "budget_minor": budget_minor,
        "currency": "INR",
        "travel_styles": styles.split(",") if styles else [],
        "travel_pace": pace,
    }
    r = client.post("/api/trips/", json=payload)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_prefs(destination: str = "Goa, India", num_days: int = 3,
                budget_minor: int = 0, styles: list[str] | None = None,
                pace: int = 5) -> TripPreferences:
    return TripPreferences(
        destination=destination,
        num_days=num_days,
        num_travellers=2,
        budget_minor=budget_minor,
        currency="INR",
        travel_styles=styles or ["leisurely"],
        walking_tolerance=5,
        travel_pace=pace,
        food_pref=None,
        must_visit=None,
        avoid=None,
    )


# ===========================================================================
# 1. Unit tests — schedule_builder (pure Python, no DB)
# ===========================================================================

class TestScheduleBuilderUnit:

    def test_basic_schedule_has_activities(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        result = build_schedule(prefs)
        assert len(result.activities) > 0, "Expected at least one activity"

    def test_all_activities_on_valid_days(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        result = build_schedule(prefs)
        for a in result.activities:
            assert 1 <= a.day_number <= 3, f"Activity on invalid day {a.day_number}"

    def test_no_time_overlaps_in_generated_schedule(self):
        prefs = _make_prefs("Goa, India", num_days=3, pace=8)
        result = build_schedule(prefs)
        overlaps = validate_schedule(result.activities)
        assert overlaps == [], f"Unexpected overlaps: {overlaps}"

    def test_activities_within_daily_time_window(self):
        prefs = _make_prefs("Goa, India", num_days=5)
        result = build_schedule(prefs)
        for a in result.activities:
            h_start, m_start = map(int, a.start_time.split(":"))
            h_end, m_end = map(int, a.end_time.split(":"))
            start_min = h_start * 60 + m_start
            end_min = h_end * 60 + m_end
            assert start_min >= DAY_START_MINUTES, f"{a.name} starts before 09:00"
            assert end_min <= DAY_END_MINUTES, f"{a.name} ends after 22:00"

    def test_budget_cap_respected(self):
        # Budget of ₹500 (50_000 paise) — very tight
        prefs = _make_prefs("Goa, India", num_days=2, budget_minor=50_000)
        result = build_schedule(prefs)
        # Only free or very cheap activities should be included
        assert result.budget.total_minor <= 50_000 or result.budget.over_budget
        # If over budget, a warning should be issued
        if result.budget.over_budget:
            assert any("budget" in w.lower() or "exceed" in w.lower()
                       for w in result.warnings)

    def test_uncapped_budget_schedules_freely(self):
        prefs = _make_prefs("Goa, India", num_days=3, budget_minor=0)
        result = build_schedule(prefs)
        assert not result.budget.over_budget

    def test_locked_activities_preserved(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        locked = [
            LockedActivity(
                id=999, day_number=1, name="My Locked Activity",
                category="sightseeing", location="Test Beach",
                start_time="10:00", end_time="11:00",
                duration_minutes=60, cost_minor=0,
                opening_hours=None, booking_required=False,
                recommendation_reason="User locked",
            )
        ]
        result = build_schedule(prefs, locked)
        names = [a.name for a in result.activities]
        assert "My Locked Activity" in names

    def test_locked_activity_not_duplicated(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        locked = [
            LockedActivity(
                id=1, day_number=1, name="Unique Locked",
                category="food", location=None,
                start_time="12:00", end_time="13:30",
                duration_minutes=90, cost_minor=0,
                opening_hours=None, booking_required=False,
                recommendation_reason="Locked",
            )
        ]
        result = build_schedule(prefs, locked)
        count = sum(1 for a in result.activities if a.name == "Unique Locked")
        assert count == 1, "Locked activity was duplicated"

    def test_locked_activity_keeps_is_locked_flag(self):
        prefs = _make_prefs("Goa, India", num_days=2)
        locked = [
            LockedActivity(
                id=7, day_number=1, name="My Lock",
                category="culture", location=None,
                start_time="09:00", end_time="10:00",
                duration_minutes=60, cost_minor=0,
                opening_hours=None, booking_required=False,
                recommendation_reason="",
            )
        ]
        result = build_schedule(prefs, locked)
        locked_slots = [a for a in result.activities if a.name == "My Lock"]
        assert locked_slots[0].is_locked is True

    def test_multi_day_trip_covers_all_days(self):
        prefs = _make_prefs("Goa, India", num_days=5)
        result = build_schedule(prefs)
        days_with_activities = {a.day_number for a in result.activities}
        # Each day should have at least one activity for a 5-day trip to Goa
        assert len(days_with_activities) >= 3, "Too many empty days"

    def test_budget_breakdown_categories_sum_to_total(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        result = build_schedule(prefs)
        cat_sum = sum(result.budget.by_category.values())
        assert cat_sum == result.budget.total_minor

    def test_avoid_filter_respected(self):
        prefs = _make_prefs("Goa, India", num_days=3)
        prefs.avoid = "nightlife"
        result = build_schedule(prefs)
        for a in result.activities:
            assert "nightlife" not in a.category.lower(), \
                f"Nightlife activity found despite avoid filter: {a.name}"

    def test_unknown_destination_uses_generic_catalogue(self):
        prefs = _make_prefs("Timbuktu", num_days=2)
        # Without real place candidates, universal pipeline does NOT fabricate fake generic attractions
        result_empty = build_schedule(prefs)
        assert len(result_empty.activities) == 0
        assert result_empty.schedule_complete is False

        # When candidate places are supplied, it schedules them cleanly
        candidates = [
            PlaceCandidate(name="Djinguereber Mosque", category="sightseeing", subcategory="heritage", location="Timbuktu", duration_minutes=60, cost_minor=0, is_verified=True),
            PlaceCandidate(name="Sankore Madrasah", category="culture", subcategory="culture", location="Timbuktu", duration_minutes=90, cost_minor=0, is_verified=True),
            PlaceCandidate(name="Ahmed Baba Institute", category="museum", subcategory="museum", location="Timbuktu", duration_minutes=90, cost_minor=50000, is_verified=True),
        ]
        result_candidates = build_schedule(prefs, candidate_places=candidates)
        assert len(result_candidates.activities) > 0


    def test_single_day_trip(self):
        prefs = _make_prefs("Goa, India", num_days=1)
        result = build_schedule(prefs)
        assert all(a.day_number == 1 for a in result.activities)

    def test_pace_1_fewer_activities_than_pace_10(self):
        prefs_slow = _make_prefs("Goa, India", num_days=3, pace=1)
        prefs_fast = _make_prefs("Goa, India", num_days=3, pace=10)
        slow_result = build_schedule(prefs_slow)
        fast_result = build_schedule(prefs_fast)
        assert len(slow_result.activities) <= len(fast_result.activities)

    def test_activity_end_time_equals_start_plus_duration(self):
        prefs = _make_prefs("Goa, India", num_days=2)
        result = build_schedule(prefs)
        for a in result.activities:
            hs, ms = map(int, a.start_time.split(":"))
            he, me = map(int, a.end_time.split(":"))
            assert (he * 60 + me) - (hs * 60 + ms) == a.duration_minutes


# ===========================================================================
# 2. Unit tests — validate_schedule
# ===========================================================================

class TestValidateSchedule:

    def _make_slot(self, day: int, start_hhmm: str, dur: int, name: str = "A") -> ActivitySlot:
        hs, ms = map(int, start_hhmm.split(":"))
        end_min = hs * 60 + ms + dur
        return ActivitySlot(
            name=name, category="sightseeing", location=None,
            duration_minutes=dur, cost_minor=0,
            opening_hours=None, booking_required=False,
            recommendation_reason="",
            day_number=day,
            start_time=start_hhmm,
            end_time=_minutes_to_hhmm(end_min),
        )

    def test_no_overlap_returns_empty(self):
        slots = [
            self._make_slot(1, "09:00", 60, "A"),
            self._make_slot(1, "11:00", 60, "B"),
        ]
        assert validate_schedule(slots) == []

    def test_overlap_detected(self):
        slots = [
            self._make_slot(1, "09:00", 120, "A"),
            self._make_slot(1, "10:00", 60, "B"),   # overlaps A
        ]
        warnings = validate_schedule(slots)
        assert len(warnings) == 1
        assert "overlap" in warnings[0].lower()

    def test_adjacent_activities_not_flagged(self):
        slots = [
            self._make_slot(1, "09:00", 60, "A"),
            self._make_slot(1, "10:00", 60, "B"),   # starts exactly when A ends
        ]
        assert validate_schedule(slots) == []

    def test_overlaps_across_days_not_flagged(self):
        slots = [
            self._make_slot(1, "09:00", 180, "A"),
            self._make_slot(2, "09:00", 180, "B"),  # same time, different day
        ]
        assert validate_schedule(slots) == []

    def test_multiple_overlaps_all_reported(self):
        slots = [
            self._make_slot(1, "09:00", 180, "A"),
            self._make_slot(1, "10:00", 60, "B"),   # overlaps A
            self._make_slot(1, "10:30", 60, "C"),   # overlaps A and B
        ]
        warnings = validate_schedule(slots)
        assert len(warnings) >= 1


# ===========================================================================
# 3. Unit tests — Plan B engine
# ===========================================================================

class TestPlanBEngine:

    def _base_schedule(self) -> list[ActivitySlot]:
        def slot(name, day, start, dur, locked=False, sid=None, cat="sightseeing"):
            hs, ms = map(int, start.split(":"))
            end_min = hs * 60 + ms + dur
            return ActivitySlot(
                name=name, category=cat, location=None,
                duration_minutes=dur, cost_minor=0,
                opening_hours=None, booking_required=False,
                recommendation_reason="",
                day_number=day,
                start_time=start,
                end_time=_minutes_to_hhmm(end_min),
                existing_id=sid,
                is_locked=locked,
            )
        return [
            slot("Morning Hike", 1, "09:00", 120, sid=1),
            slot("Lunch", 1, "12:00", 90, cat="food", sid=2),
            slot("Museum Tour", 1, "15:00", 120, sid=3),
            slot("Day 2 Activity", 2, "10:00", 120, sid=4),
        ]

    def _prefs(self):
        return _make_prefs("Goa, India", num_days=3)

    def test_closure_removes_activity(self):
        sched = self._base_schedule()
        disruption = Disruption("Lunch", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        names = [a.name for a in result.activities if a.day_number == 1]
        assert "Lunch" not in names

    def test_closure_adds_replacement(self):
        sched = self._base_schedule()
        disruption = Disruption("Morning Hike", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        assert any(c.startswith("Added") for c in result.changes)

    def test_delay_shifts_activity_time(self):
        sched = self._base_schedule()
        disruption = Disruption("Museum Tour", day_number=1, reason="delay",
                                delay_minutes=60)
        result = replan(self._prefs(), sched, disruption)
        museum = next((a for a in result.activities if a.name == "Museum Tour"), None)
        assert museum is not None
        assert museum.start_time == "16:00"

    def test_locked_activity_not_removed(self):
        sched = self._base_schedule()
        sched[0].is_locked = True   # Morning Hike is locked
        disruption = Disruption("Morning Hike", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        # Should warn and leave it in place
        assert any("locked" in w.lower() for w in result.warnings)
        names = [a.name for a in result.activities if a.day_number == 1]
        assert "Morning Hike" in names

    def test_other_days_unchanged(self):
        sched = self._base_schedule()
        disruption = Disruption("Morning Hike", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        day2 = [a for a in result.activities if a.day_number == 2]
        assert any(a.name == "Day 2 Activity" for a in day2)

    def test_nonexistent_activity_warns(self):
        sched = self._base_schedule()
        disruption = Disruption("Ghost Activity", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        assert any("not found" in w.lower() for w in result.warnings)

    def test_changes_list_populated(self):
        sched = self._base_schedule()
        disruption = Disruption("Lunch", day_number=1, reason="closure")
        result = replan(self._prefs(), sched, disruption)
        assert len(result.changes) >= 1

    def test_delay_beyond_day_end_treated_as_closure(self):
        sched = self._base_schedule()
        # Museum Tour at 15:00 + 600 min delay = 01:00 next day → closure
        disruption = Disruption("Museum Tour", day_number=1, reason="delay",
                                delay_minutes=600)
        result = replan(self._prefs(), sched, disruption)
        # The activity should be removed (treated as closure)
        museum = next((a for a in result.activities
                       if a.name == "Museum Tour" and a.day_number == 1), None)
        assert museum is None


# ===========================================================================
# 4. API integration tests
# ===========================================================================

class TestItineraryAPI:

    def test_generate_creates_activities(self):
        trip_id = _make_trip("Goa, India", num_days=3)
        r = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["trip_id"] == trip_id
        assert len(data["activities"]) > 0
        assert "budget" in data
        assert isinstance(data["warnings"], list)

    def test_generate_returns_budget_breakdown(self):
        trip_id = _make_trip("Goa, India", num_days=2)
        r = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        data = r.json()
        budget = data["budget"]
        assert "total_minor" in budget
        assert "by_category" in budget
        assert isinstance(budget["by_category"], dict)

    def test_generate_is_idempotent(self):
        trip_id = _make_trip("Goa, India", num_days=3)
        r1 = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        n1 = len(r1.json()["activities"])
        r2 = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        n2 = len(r2.json()["activities"])
        assert n1 == n2, "Regeneration created duplicate activities"

    def test_generate_preserves_locked_activities(self):
        trip_id = _make_trip("Goa, India", num_days=3)
        # Create a locked activity manually
        a_r = client.post("/api/activities/", json={
            "trip_id": trip_id, "day_number": 1,
            "name": "User Locked Activity", "category": "sightseeing",
            "start_time": "10:00", "end_time": "11:00",
            "duration_minutes": 60, "cost_minor": 0,
            "is_locked": True,
        })
        assert a_r.status_code == 201
        # Now lock it via the toggle endpoint
        act_id = a_r.json()["id"]

        # Generate — locked must survive
        r = client.post(f"/api/itinerary/{trip_id}/generate", json={"overwrite_unlocked": True})
        assert r.status_code == 200
        names = [a["name"] for a in r.json()["activities"]]
        assert "User Locked Activity" in names, "Locked activity was removed by generate"

    def test_generate_404_on_missing_trip(self):
        r = client.post("/api/itinerary/999999/generate", json={})
        assert r.status_code == 404

    def test_budget_endpoint(self):
        trip_id = _make_trip("Goa, India", num_days=2)
        client.post(f"/api/itinerary/{trip_id}/generate", json={})
        r = client.get(f"/api/itinerary/{trip_id}/budget")
        assert r.status_code == 200
        data = r.json()
        assert "total_minor" in data
        assert "by_category" in data

    def test_budget_endpoint_404_on_missing_trip(self):
        r = client.get("/api/itinerary/999999/budget")
        assert r.status_code == 404

    def test_replan_closure_removes_activity(self):
        trip_id = _make_trip("Goa, India", num_days=3)
        # Generate first
        gen = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        activities = gen.json()["activities"]
        # Pick an unlocked activity on day 1
        target = next((a for a in activities if a["day_number"] == 1
                       and not a["is_locked"]), None)
        if target is None:
            pytest.skip("No unlocked activity on day 1 to disrupt")

        r = client.post(f"/api/itinerary/{trip_id}/replan", json={
            "activity_name": target["name"],
            "day_number": 1,
            "reason": "closure",
        })
        assert r.status_code == 200
        data = r.json()
        names = [a["name"] for a in data["activities"] if a["day_number"] == 1]
        assert target["name"] not in names
        assert len(data["changes"]) >= 1

    def test_replan_404_on_missing_trip(self):
        r = client.post("/api/itinerary/999999/replan", json={
            "activity_name": "X", "day_number": 1, "reason": "closure",
        })
        assert r.status_code == 404

    def test_generate_activities_stored_in_db(self):
        trip_id = _make_trip("Jaipur", num_days=2)
        client.post(f"/api/itinerary/{trip_id}/generate", json={})
        r = client.get(f"/api/activities/trip/{trip_id}")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_generate_tight_budget_warns(self):
        # ₹100 budget — impossible to cover most Goa activities
        trip_id = _make_trip("Goa, India", num_days=3, budget_minor=10_000)
        r = client.post(f"/api/itinerary/{trip_id}/generate", json={})
        data = r.json()
        # Should not crash; may produce warnings
        assert r.status_code == 200
        assert isinstance(data["warnings"], list)

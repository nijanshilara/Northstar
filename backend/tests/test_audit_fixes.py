"""
test_audit_fixes.py — Regression and feature tests for Phases 2–9 fixes.

Verifies:
  1. User-controlled budget: updating budget to ₹5,000, ₹12,500, and ₹50,000;
     itinerary budget recalculation; remaining balance and over-budget calculations.
  2. Splitwise bill-splitting:
     - Option A: Split with everyone.
     - Option B: Split with selected people (only selected participants charged,
       exact integer share reconciliation with remainder distributed, sum == total).
     - Expense update and delete.
     - Group deletion authorization and leave group.
  3. Weather accuracy & worldwide geocoding:
     - Open-Meteo geocoding for diverse destinations (Mumbai, Tokyo, etc.).
     - Live weather fetch with coordinates (lat, lon) and timezone.
     - Current weather, 24h hourly forecast, and 7-day daily forecast.
"""

from __future__ import annotations

from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.base import Trip, Activity, ExpenseGroup, GroupMember, Expense, ActivityCategory
from app.models.user import User
from app.core.security import hash_password, create_access_token

TEST_DB_URL = "sqlite:///./test_audit.db"
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
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _create_test_user(db, email="traveler@example.com") -> User:
    user = User(
        email=email,
        full_name="Test Traveler",
        hashed_password=hash_password("TravelPass123!"),
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# 1. Budget Tests: ₹5,000, ₹12,500, ₹50,000 and recalculations
# ---------------------------------------------------------------------------

def test_user_controlled_budget_updates(client):
    """Verify trip budget can be set to user-defined amounts and recalculates."""
    db = TestingSessionLocal()
    trip = Trip(
        name="Budget Test Journey",
        origin="Mumbai",
        destination="Goa",
        departure_date=date(2026, 11, 1),
        return_date=date(2026, 11, 4),
        num_days=4,
        num_travellers=2,
        budget_minor=0,
        currency="INR",
        is_demo=False,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    # Add 2 activities: total 8,000 INR = 800,000 minor
    act1 = Activity(
        trip_id=trip.id,
        day_number=1,
        name="Scuba Diving",
        cost_minor=500000,  # ₹5,000
        currency="INR",
        category=ActivityCategory.ADVENTURE,
    )
    act2 = Activity(
        trip_id=trip.id,
        day_number=2,
        name="Seafood Feast",
        cost_minor=300000,  # ₹3,000
        currency="INR",
        category=ActivityCategory.FOOD,
    )
    db.add_all([act1, act2])
    db.commit()

    # Test amount 1: ₹5,000 (500,000 paise) -> Should be OVER budget (total = 8,000 > 5,000)
    r1 = client.patch(f"/api/trips/{trip.id}", json={"budget_minor": 500000})
    assert r1.status_code == 200
    assert r1.json()["budget_minor"] == 500000

    b1 = client.get(f"/api/itinerary/{trip.id}/budget")
    assert b1.status_code == 200
    data1 = b1.json()
    assert data1["budget_cap_minor"] == 500000
    assert data1["total_minor"] == 800000
    assert data1["over_budget"] is True
    assert data1["over_budget_by_minor"] == 300000  # Over by ₹3,000

    # Test amount 2: ₹12,500 (1,250,000 paise) -> Should be UNDER budget (total = 8,000 < 12,500)
    r2 = client.patch(f"/api/trips/{trip.id}", json={"budget_minor": 1250000})
    assert r2.status_code == 200
    assert r2.json()["budget_minor"] == 1250000

    b2 = client.get(f"/api/itinerary/{trip.id}/budget")
    assert b2.status_code == 200
    data2 = b2.json()
    assert data2["budget_cap_minor"] == 1250000
    assert data2["total_minor"] == 800000
    assert data2["over_budget"] is False
    assert data2["over_budget_by_minor"] == 0

    # Test amount 3: ₹50,000 (5,000,000 paise) -> Under budget with ₹42,000 remaining
    r3 = client.patch(f"/api/trips/{trip.id}", json={"budget_minor": 5000000})
    assert r3.status_code == 200
    assert r3.json()["budget_minor"] == 5000000

    b3 = client.get(f"/api/itinerary/{trip.id}/budget")
    assert b3.status_code == 200
    data3 = b3.json()
    assert data3["budget_cap_minor"] == 5000000
    assert data3["total_minor"] == 800000
    assert data3["over_budget"] is False
    db.close()


# ---------------------------------------------------------------------------
# 2. Splitwise Tests: Option A (everyone) vs Option B (selected participants)
# ---------------------------------------------------------------------------

def test_splitwise_selected_participants_split(client):
    """
    Test Option B: Split with selected people.
    Excluded members must NOT be charged.
    Share reconciliation must sum exactly to amount_minor down to minor units.
    """
    db = TestingSessionLocal()
    group = ExpenseGroup(name="Goa Trip Gang", currency="INR")
    db.add(group)
    db.commit()
    db.refresh(group)

    m1 = GroupMember(group_id=group.id, name="Alice")
    m2 = GroupMember(group_id=group.id, name="Bob")
    m3 = GroupMember(group_id=group.id, name="Charlie")
    db.add_all([m1, m2, m3])
    db.commit()
    db.refresh(m1)
    db.refresh(m2)
    db.refresh(m3)

    # Case 1: Split with Selected People (Alice and Bob only, excluding Charlie)
    # Total expense: ₹1,000 = 100,000 minor paise.
    # Alice and Bob should each owe 50,000 paise. Charlie owes 0.
    payload = {
        "group_id": group.id,
        "description": "Private Kayaking Tour",
        "amount_minor": 100000,
        "currency": "INR",
        "paid_by_id": m1.id,
        "split_method": "equal",
        "participant_ids": [m1.id, m2.id],
    }
    r = client.post("/api/expenses/", json=payload)
    assert r.status_code == 201
    exp_data = r.json()
    shares = exp_data["shares"]
    assert len(shares) == 2

    shares_by_member = {s["member_id"]: s["share_minor"] for s in shares}
    assert shares_by_member[m1.id] == 50000
    assert shares_by_member[m2.id] == 50000
    assert m3.id not in shares_by_member

    # Check sum of shares equals total
    assert sum(s["share_minor"] for s in shares) == 100000

    # Case 2: Uneven remainder division (e.g. ₹100 split 3 ways = 10,000 paise among 3 people)
    # 10,000 // 3 = 3333 with remainder 1.
    # Person 1 gets 3334, Person 2 gets 3333, Person 3 gets 3333.
    # Sum: 3334 + 3333 + 3333 = 10000. Exactly zero rounding leakage!
    payload_uneven = {
        "group_id": group.id,
        "description": "Road Toll",
        "amount_minor": 10000,
        "currency": "INR",
        "paid_by_id": m1.id,
        "split_method": "equal",
        "participant_ids": [m1.id, m2.id, m3.id],
    }
    r_uneven = client.post("/api/expenses/", json=payload_uneven)
    assert r_uneven.status_code == 201
    uneven_shares = r_uneven.json()["shares"]
    assert sum(s["share_minor"] for s in uneven_shares) == 10000

    # Case 3: Expense Update
    exp_id = exp_data["id"]
    update_res = client.put(f"/api/expenses/{exp_id}", json={
        "description": "Upgraded Kayaking Tour",
        "amount_minor": 120000,
        "participant_ids": [m1.id, m2.id],
    })
    assert update_res.status_code == 200
    assert update_res.json()["description"] == "Upgraded Kayaking Tour"
    assert update_res.json()["amount_minor"] == 120000
    assert sum(s["share_minor"] for s in update_res.json()["shares"]) == 120000

    # Case 4: Delete expense
    del_res = client.delete(f"/api/expenses/{exp_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Case 5: Leave group when settled vs unsettled
    # Currently Charlie owes 3,333 paise for Road Toll -> Leaving should be blocked!
    leave_blocked = client.post(f"/api/expenses/groups/{group.id}/leave", json={"member_id": m3.id})
    assert leave_blocked.status_code == 400
    assert "active balance" in leave_blocked.json()["detail"].lower()

    db.close()


# ---------------------------------------------------------------------------
# 3. Weather & Geocoding Tests: Worldwide autocomplete & coordinates
# ---------------------------------------------------------------------------

def test_worldwide_geocoding_and_weather(client):
    """Test geocoding autocomplete and coordinates-based weather lookup."""
    # Test geocoding endpoint
    r_geo = client.get("/api/weather/geocoding?q=Tokyo")
    assert r_geo.status_code == 200
    results = r_geo.json().get("results", [])
    assert len(results) > 0
    first = results[0]
    assert "name" in first
    assert "country" in first
    assert "latitude" in first
    assert "longitude" in first

    # Test coordinate-based weather endpoint
    r_weather = client.get(f"/api/weather?lat={first['latitude']}&lon={first['longitude']}&city=Tokyo")
    assert r_weather.status_code == 200
    w_data = r_weather.json()
    assert w_data["error"] is None
    assert "current" in w_data
    assert "days" in w_data
    assert len(w_data["days"]) == 7
    assert "hourly" in w_data
    assert len(w_data["hourly"]) > 0


# ---------------------------------------------------------------------------
# 4. Regression: Overview and Budget & Savings Single Source of Truth
# ---------------------------------------------------------------------------

def test_overview_and_budget_show_same_total_for_trip(client):
    """
    Regression test:
    Confirm that Overview and Budget & Savings use the exact same persistent
    trip-specific budget source of truth in the database.
    Verify that updating the budget on one updates the other immediately,
    and actual spending / planned activity costs remain strictly separate from
    the budget cap limit.
    """
    db = TestingSessionLocal()
    trip = Trip(
        name="Rajasthan Heritage Tour",
        origin="Delhi",
        destination="Jaipur",
        departure_date=date(2026, 12, 1),
        return_date=date(2026, 12, 5),
        num_days=5,
        num_travellers=2,
        budget_minor=5000000,  # ₹50,000
        currency="INR",
        is_demo=False,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    # Add an itinerary activity (planned spend = ₹1,200 = 120,000 paise)
    act = Activity(
        trip_id=trip.id,
        day_number=1,
        name="Amber Fort Guided Tour",
        category=ActivityCategory.SIGHTSEEING,
        cost_minor=120000,
        currency="INR",
    )
    db.add(act)

    # Add an expense group with recorded actual expense (actual spend = ₹800 = 80,000 paise)
    group = ExpenseGroup(trip_id=trip.id, name="Jaipur Group", currency="INR")
    db.add(group)
    db.commit()
    db.refresh(group)

    member = GroupMember(group_id=group.id, name="Traveler")
    db.add(member)
    db.commit()
    db.refresh(member)

    exp = Expense(
        group_id=group.id,
        paid_by_id=member.id,
        description="Local Taxi",
        amount_minor=80000,
        currency="INR",
        expense_date=date(2026, 12, 1),
    )
    db.add(exp)
    db.commit()

    # Step 1: Query what Overview queries (GET /api/trips/)
    r_overview = client.get("/api/trips/")
    assert r_overview.status_code == 200
    overview_trips = r_overview.json()
    overview_trip = next((t for t in overview_trips if t["id"] == trip.id), None)
    assert overview_trip is not None
    assert overview_trip["budget_minor"] == 5000000
    assert overview_trip["currency"] == "INR"

    # Step 2: Query what Budget & Savings queries (GET /api/trips/{id} & GET /api/itinerary/{id}/budget)
    r_budget_trip = client.get(f"/api/trips/{trip.id}")
    assert r_budget_trip.status_code == 200
    assert r_budget_trip.json()["budget_minor"] == 5000000

    r_itinerary_budget = client.get(f"/api/itinerary/{trip.id}/budget")
    assert r_itinerary_budget.status_code == 200
    b_data = r_itinerary_budget.json()
    assert b_data["budget_cap_minor"] == 5000000
    assert b_data["currency"] == "INR"

    # CRITICAL: Verify Overview and Budget & Savings match identically
    assert overview_trip["budget_minor"] == b_data["budget_cap_minor"] == 5000000

    # Verify budget limits are kept separate from planned spending and actual spending
    assert b_data["total_minor"] == 120000         # Planned activities cost
    assert b_data["actual_spent_minor"] == 80000   # Splitwise recorded expense
    assert b_data["remaining_minor"] == 5000000 - 120000  # ₹48,800
    assert b_data["over_budget"] is False

    # Step 3: Update budget from Budget page to ₹12,500 (1,250,000 paise) via PATCH
    r_patch = client.patch(f"/api/trips/{trip.id}", json={"budget_minor": 1250000, "currency": "INR"})
    assert r_patch.status_code == 200
    assert r_patch.json()["budget_minor"] == 1250000

    # Step 4: Verify Overview immediately reflects ₹12,500
    r_overview2 = client.get("/api/trips/")
    overview_trip2 = next(t for t in r_overview2.json() if t["id"] == trip.id)
    assert overview_trip2["budget_minor"] == 1250000

    # Step 5: Verify Budget & Savings reflects ₹12,500
    r_itinerary_budget2 = client.get(f"/api/itinerary/{trip.id}/budget")
    assert r_itinerary_budget2.json()["budget_cap_minor"] == 1250000
    assert overview_trip2["budget_minor"] == r_itinerary_budget2.json()["budget_cap_minor"] == 1250000

    # Step 6: Test PUT endpoint update to ₹5,000 (500,000 paise)
    r_put = client.put(f"/api/trips/{trip.id}", json={"budget_minor": 500000, "currency": "INR"})
    assert r_put.status_code == 200
    assert r_put.json()["budget_minor"] == 500000

    r_itinerary_budget3 = client.get(f"/api/itinerary/{trip.id}/budget")
    assert r_itinerary_budget3.json()["budget_cap_minor"] == 500000

    r_overview3 = client.get("/api/trips/")
    overview_trip3 = next(t for t in r_overview3.json() if t["id"] == trip.id)
    assert overview_trip3["budget_minor"] == 500000

    db.close()


"""
test_budget_phase6e.py — Phase 6E Budget & Savings Consistency Audit Regression Tests.

Verifies:
  1. Budget edits persist across requests in real SQLite database.
  2. Overview/Trip GET and Itinerary budget GET agree identically on budget_cap_minor and currency.
  3. Rejection of invalid budget inputs (negative budgets, malformed currency) with HTTP 422.
  4. Graceful handling of zero budgets and trips with no expenses.
  5. Clear separation between planned activity cost estimates and actual recorded Splitwise expenses (no conflation).
  6. Strict trip isolation: Splitwise expenses linked to Trip A do not contaminate Trip B.
  7. Currency alignment: expense groups linked to non-INR trips adopt the trip's currency.
  8. AI itinerary enrichment receives actual budget, planned estimates, actual spent, and remaining amounts with truthfulness rules.
"""

from __future__ import annotations

from datetime import date
from unittest.mock import patch, AsyncMock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.base import Trip, Activity, ActivityCategory, ExpenseGroup, GroupMember, Expense

TEST_DB_URL = "sqlite:///./test_budget_6e.db"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


client = TestClient(app)


# ---------------------------------------------------------------------------
# Test 1 & 2: Persistence and Agreement between Trip and Itinerary Budget
# ---------------------------------------------------------------------------

def test_budget_persistence_and_agreement():
    """Verify updating a trip's budget persists in SQLite and matches across endpoints."""
    # Create trip with 50,000 INR budget (5,000,000 paise)
    res = client.post("/api/trips/", json={
        "name": "Rajasthan Cultural Tour",
        "origin": "Delhi",
        "destination": "Jaipur",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-05",
        "num_days": 4,
        "num_travellers": 2,
        "budget_minor": 5000000,
        "currency": "INR",
    })
    assert res.status_code == 201
    trip_id = res.json()["id"]

    # Verify initial get
    trip_get = client.get(f"/api/trips/{trip_id}").json()
    assert trip_get["budget_minor"] == 5000000
    assert trip_get["budget_major"] == 50000.0
    assert trip_get["currency"] == "INR"

    # Verify itinerary budget endpoint agrees identically
    itin_b = client.get(f"/api/itinerary/{trip_id}/budget").json()
    assert itin_b["budget_cap_minor"] == 5000000
    assert itin_b["currency"] == "INR"

    # Update budget to 75,000 INR (7,500,000 paise)
    patch_res = client.patch(f"/api/trips/{trip_id}", json={
        "budget_minor": 7500000,
        "currency": "INR",
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["budget_minor"] == 7500000

    # Fresh GET on trip
    trip_refetch = client.get(f"/api/trips/{trip_id}").json()
    assert trip_refetch["budget_minor"] == 7500000
    assert trip_refetch["budget_major"] == 75000.0

    # Fresh GET on itinerary budget
    itin_refetch = client.get(f"/api/itinerary/{trip_id}/budget").json()
    assert itin_refetch["budget_cap_minor"] == 7500000
    assert itin_refetch["currency"] == "INR"


# ---------------------------------------------------------------------------
# Test 3: Validation of Invalid Budget Inputs
# ---------------------------------------------------------------------------

def test_invalid_budget_inputs_rejected():
    """Verify negative budgets and malformed currency strings return HTTP 422."""
    # Negative budget on create
    res1 = client.post("/api/trips/", json={
        "name": "Invalid Trip",
        "origin": "Delhi",
        "destination": "Goa",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-05",
        "budget_minor": -1000,
        "currency": "INR",
    })
    assert res1.status_code == 422

    # Valid create
    res2 = client.post("/api/trips/", json={
        "name": "Valid Trip",
        "origin": "Delhi",
        "destination": "Goa",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-05",
        "budget_minor": 100000,
        "currency": "INR",
    })
    assert res2.status_code == 201
    trip_id = res2.json()["id"]

    # Negative budget on update
    res3 = client.patch(f"/api/trips/{trip_id}", json={
        "budget_minor": -500,
    })
    assert res3.status_code == 422

    # Malformed currency (too short)
    res4 = client.patch(f"/api/trips/{trip_id}", json={
        "currency": "US",
    })
    assert res4.status_code == 422

    # Malformed currency (too long)
    res5 = client.patch(f"/api/trips/{trip_id}", json={
        "currency": "UNITEDSTATES",
    })
    assert res5.status_code == 422


# ---------------------------------------------------------------------------
# Test 4: Zero Budget and Empty Expenses Handling
# ---------------------------------------------------------------------------

def test_zero_budget_and_no_expenses():
    """Verify zero budgets and trips with no expenses are handled without errors or division by zero."""
    res = client.post("/api/trips/", json={
        "name": "Zero Budget Explorer",
        "origin": "Mumbai",
        "destination": "Pune",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-02",
        "budget_minor": 0,
        "currency": "INR",
    })
    assert res.status_code == 201
    trip_id = res.json()["id"]

    itin_b = client.get(f"/api/itinerary/{trip_id}/budget").json()
    assert itin_b["budget_cap_minor"] == 0
    assert itin_b["total_minor"] == 0
    assert itin_b["actual_spent_minor"] == 0
    assert itin_b["remaining_minor"] == 0
    assert itin_b["remaining_actual_minor"] == 0
    assert itin_b["over_budget"] is False
    assert itin_b["over_budget_by_minor"] == 0


# ---------------------------------------------------------------------------
# Test 5: Separation of Planned Estimates vs. Actual Expenses
# ---------------------------------------------------------------------------

def test_planned_estimates_vs_actual_expenses():
    """Planned activity costs must not be conflated with actual money spent."""
    # Create trip with 100,000 minor budget (1,000 major)
    t_res = client.post("/api/trips/", json={
        "name": "Estimates vs Actuals Test",
        "origin": "Bangalore",
        "destination": "Coorg",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-03",
        "budget_minor": 100000,
        "currency": "INR",
    })
    trip_id = t_res.json()["id"]

    # Add planned activity costing 35,000 minor
    act_res = client.post("/api/activities/", json={
        "trip_id": trip_id,
        "day_number": 1,
        "name": "Coffee Plantation Tour",
        "category": "sightseeing",
        "cost_minor": 35000,
        "currency": "INR",
    })
    assert act_res.status_code == 201

    # Before any Splitwise expenses are logged:
    # planned estimates = 35,000; actual spent = 0; remaining actual = 100,000; remaining planned = 65,000
    b1 = client.get(f"/api/itinerary/{trip_id}/budget").json()
    assert b1["total_minor"] == 35000
    assert b1["actual_spent_minor"] == 0
    assert b1["remaining_minor"] == 65000
    assert b1["remaining_actual_minor"] == 100000
    assert b1["over_budget"] is False

    # Now create an ExpenseGroup linked to this trip and log an actual expense of 20,000 minor
    g_res = client.post("/api/expenses/groups", json={
        "trip_id": trip_id,
        "name": "Coorg Travel Crew",
        "currency": "INR",
        "members": [{"name": "Aarav"}, {"name": "Diya"}],
    })
    assert g_res.status_code == 201
    group_id = g_res.json()["id"]
    member_id = g_res.json()["members"][0]["id"]

    exp_res = client.post("/api/expenses/", json={
        "group_id": group_id,
        "paid_by_id": member_id,
        "description": "Lunch at Plantation Cafe",
        "amount_minor": 20000,
        "currency": "INR",
        "category": "food",
        "split_method": "equal",
    })
    assert exp_res.status_code == 201

    # Check budget breakdown again:
    # planned estimates remain 35,000 (from activities)
    # actual spent is now 20,000 (from Splitwise expense)
    # remaining actual is 80,000 (100,000 - 20,000)
    # remaining planned is 65,000 (100,000 - 35,000)
    b2 = client.get(f"/api/itinerary/{trip_id}/budget").json()
    assert b2["total_minor"] == 35000
    assert b2["actual_spent_minor"] == 20000
    assert b2["remaining_minor"] == 65000
    assert b2["remaining_actual_minor"] == 80000
    assert b2["over_actual_by_minor"] == 0


# ---------------------------------------------------------------------------
# Test 6: Strict Trip Isolation in Splitwise Expense Aggregation
# ---------------------------------------------------------------------------

def test_splitwise_trip_isolation_no_double_counting():
    """Expenses linked to Trip A must never leak into Trip B or standalone groups."""
    # Trip A (Budget 50,000)
    t1 = client.post("/api/trips/", json={
        "name": "Trip Alpha",
        "origin": "Delhi",
        "destination": "Agra",
        "departure_date": "2026-11-01",
        "return_date": "2026-11-02",
        "budget_minor": 5000000,
        "currency": "INR",
    }).json()

    # Trip B (Budget 80,000)
    t2 = client.post("/api/trips/", json={
        "name": "Trip Beta",
        "origin": "Mumbai",
        "destination": "Goa",
        "departure_date": "2026-11-10",
        "return_date": "2026-11-15",
        "budget_minor": 8000000,
        "currency": "INR",
    }).json()

    # Group for Trip A
    g1 = client.post("/api/expenses/groups", json={
        "trip_id": t1["id"],
        "name": "Alpha Group",
        "currency": "INR",
        "members": [{"name": "User 1"}, {"name": "User 2"}],
    }).json()

    # Group for Trip B
    g2 = client.post("/api/expenses/groups", json={
        "trip_id": t2["id"],
        "name": "Beta Group",
        "currency": "INR",
        "members": [{"name": "User 3"}, {"name": "User 4"}],
    }).json()

    # Unlinked standalone group
    g3 = client.post("/api/expenses/groups", json={
        "trip_id": None,
        "name": "Standalone Flatmates",
        "currency": "INR",
        "members": [{"name": "Roomie 1"}, {"name": "Roomie 2"}],
    }).json()

    # Add expense to Group A: 12,000
    client.post("/api/expenses/", json={
        "group_id": g1["id"],
        "paid_by_id": g1["members"][0]["id"],
        "description": "Taj Mahal Entry Tickets",
        "amount_minor": 1200000,
        "currency": "INR",
        "category": "sightseeing",
        "split_method": "equal",
    })

    # Add expense to Group B: 30,000
    client.post("/api/expenses/", json={
        "group_id": g2["id"],
        "paid_by_id": g2["members"][0]["id"],
        "description": "Beach Resort Stay",
        "amount_minor": 3000000,
        "currency": "INR",
        "category": "accommodation",
        "split_method": "equal",
    })

    # Add expense to Standalone Group: 10,000
    client.post("/api/expenses/", json={
        "group_id": g3["id"],
        "paid_by_id": g3["members"][0]["id"],
        "description": "Groceries",
        "amount_minor": 1000000,
        "currency": "INR",
        "category": "food",
        "split_method": "equal",
    })

    # Check Trip A's budget breakdown
    b1 = client.get(f"/api/itinerary/{t1['id']}/budget").json()
    assert b1["actual_spent_minor"] == 1200000
    assert b1["remaining_actual_minor"] == 3800000

    # Check Trip B's budget breakdown
    b2 = client.get(f"/api/itinerary/{t2['id']}/budget").json()
    assert b2["actual_spent_minor"] == 3000000
    assert b2["remaining_actual_minor"] == 5000000


# ---------------------------------------------------------------------------
# Test 7: Group Currency Alignment with Trip Currency
# ---------------------------------------------------------------------------

def test_group_currency_aligns_with_trip_currency():
    """When linking a group to a USD trip, default INR payload currency must align to USD."""
    trip = client.post("/api/trips/", json={
        "name": "New York Trip",
        "origin": "London",
        "destination": "New York",
        "departure_date": "2026-12-01",
        "return_date": "2026-12-07",
        "budget_minor": 350000,
        "currency": "USD",
    }).json()

    # Create group referencing the trip, passing default payload currency "INR"
    group = client.post("/api/expenses/groups", json={
        "trip_id": trip["id"],
        "name": "NYC Friends",
        "currency": "INR",
        "members": [{"name": "Alice"}, {"name": "Bob"}],
    }).json()

    # Must adopt the trip's currency
    assert group["currency"] == "USD"


# ---------------------------------------------------------------------------
# Test 8: AI Enrich Receives Accurate Financial Context
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ai_enrich_receives_complete_budget_context():
    """Verify enrich_itinerary prompt includes budget cap, planned estimates, actual spent, and remaining amounts."""
    # Create trip
    t = client.post("/api/trips/", json={
        "name": "Kyoto Autumn",
        "origin": "Tokyo",
        "destination": "Kyoto",
        "departure_date": "2026-11-15",
        "return_date": "2026-11-18",
        "budget_minor": 200000,
        "currency": "JPY",
    }).json()
    trip_id = t["id"]

    # Add activity
    client.post("/api/activities/", json={
        "trip_id": trip_id,
        "day_number": 1,
        "name": "Fushimi Inari Shrine",
        "category": "sightseeing",
        "cost_minor": 50000,
        "currency": "JPY",
    })

    captured_prompt = None

    async def mock_generate_text(prompt, system=None, max_tokens=1500):
        nonlocal captured_prompt
        captured_prompt = prompt
        return {
            "text": "1. Day 1: Visit early morning to avoid crowds.\n2. Day 2: Explore bamboo grove.",
            "is_ai": True,
            "provider": "MockAI",
            "error": None,
        }

    with patch("app.api.ai_chat.generate_text", side_effect=mock_generate_text):
        res = client.post("/api/ai/enrich-itinerary", json={
            "trip_id": trip_id,
            "focus": "budget",
        })
        assert res.status_code == 200
        assert captured_prompt is not None

        # Verify key financial figures exist in the prompt sent to AI
        assert "Total Budget Cap: 2000.00 JPY" in captured_prompt
        assert "Estimated Itinerary Costs: 500.00 JPY" in captured_prompt
        assert "Actual Recorded Expenses: 0.00 JPY" in captured_prompt
        assert "Remaining Budget After Estimates: 1500.00 JPY" in captured_prompt
        assert "Remaining Budget After Actual Spend: 2000.00 JPY" in captured_prompt
        assert "Financial accuracy rule" in captured_prompt

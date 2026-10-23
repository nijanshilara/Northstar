"""
Phase 1 backend tests.
Tests the database, trip CRUD, expense splitting and demo endpoints.
Run with: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import date, timedelta

from app.main import app
from app.database.session import Base, get_db

# ---------------------------------------------------------------------------
# Isolated file-based SQLite test database (separate file per test module)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///./test_phase1.db"

test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Install the DB override, create tables, run test, drop tables, restore."""
    # Install override for this test module
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    # Remove override after test so other modules can set their own
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


# ---------------------------------------------------------------------------
# Trip CRUD
# ---------------------------------------------------------------------------

VALID_TRIP = {
    "name": "Test Trip to Goa",
    "origin": "Mumbai",
    "destination": "Goa",
    "departure_date": str(date.today() + timedelta(days=10)),
    "return_date": str(date.today() + timedelta(days=14)),
    "num_travellers": 2,
    "budget_minor": 5000000,
    "currency": "INR",
}


def test_create_trip():
    response = client.post("/api/trips/", json=VALID_TRIP)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Trip to Goa"
    assert data["destination"] == "Goa"
    assert data["num_days"] == 5
    assert data["budget_major"] == 50000.0


def test_list_trips():
    client.post("/api/trips/", json=VALID_TRIP)
    response = client.get("/api/trips/")
    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_get_trip():
    create_resp = client.post("/api/trips/", json=VALID_TRIP)
    trip_id = create_resp.json()["id"]
    response = client.get(f"/api/trips/{trip_id}")
    assert response.status_code == 200
    assert response.json()["id"] == trip_id


def test_get_trip_not_found():
    response = client.get("/api/trips/99999")
    assert response.status_code == 404


def test_return_date_before_departure_rejected():
    invalid_trip = {**VALID_TRIP, "return_date": str(date.today() + timedelta(days=5))}
    invalid_trip["departure_date"] = str(date.today() + timedelta(days=14))
    response = client.post("/api/trips/", json=invalid_trip)
    assert response.status_code == 422


def test_trip_persists_after_recreation():
    """Trip must be retrievable by ID after creation (persistence check)."""
    create_resp = client.post("/api/trips/", json=VALID_TRIP)
    trip_id = create_resp.json()["id"]
    # Get twice to ensure it's not ephemeral
    r1 = client.get(f"/api/trips/{trip_id}")
    r2 = client.get(f"/api/trips/{trip_id}")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


def test_delete_trip():
    create_resp = client.post("/api/trips/", json=VALID_TRIP)
    trip_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/trips/{trip_id}")
    assert del_resp.status_code == 204
    get_resp = client.get(f"/api/trips/{trip_id}")
    assert get_resp.status_code == 404


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

def test_create_activity():
    trip = client.post("/api/trips/", json=VALID_TRIP).json()
    activity_payload = {
        "trip_id": trip["id"],
        "day_number": 1,
        "name": "Baga Beach Visit",
        "category": "sightseeing",
        "start_time": "10:00",
        "end_time": "12:00",
        "duration_minutes": 120,
        "cost_minor": 0,
        "currency": "INR",
    }
    response = client.post("/api/activities/", json=activity_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Baga Beach Visit"
    assert data["day_number"] == 1


def test_list_activities_for_trip():
    trip = client.post("/api/trips/", json=VALID_TRIP).json()
    for i in range(3):
        client.post("/api/activities/", json={
            "trip_id": trip["id"], "day_number": 1,
            "name": f"Activity {i}", "category": "sightseeing",
            "duration_minutes": 60, "cost_minor": 0, "currency": "INR",
        })
    response = client.get(f"/api/activities/trip/{trip['id']}")
    assert response.status_code == 200
    assert len(response.json()) == 3


# ---------------------------------------------------------------------------
# Expense splitting
# ---------------------------------------------------------------------------

def _create_group_with_members():
    payload = {
        "name": "Goa Trip Group",
        "currency": "INR",
        "members": [
            {"name": "Alice"}, {"name": "Bob"}, {"name": "Charlie"}
        ],
    }
    resp = client.post("/api/expenses/groups", json=payload)
    assert resp.status_code == 201
    return resp.json()


def test_create_expense_group():
    group = _create_group_with_members()
    assert group["name"] == "Goa Trip Group"
    assert len(group["members"]) == 3


def test_equal_split_sums_to_total():
    """Equal shares must always sum to the original expense amount."""
    group = _create_group_with_members()
    group_id = group["id"]
    paid_by = group["members"][0]["id"]

    # Amount that is NOT cleanly divisible by 3
    amount = 100001  # 3 members → 33333 + 33334 + 33334
    resp = client.post("/api/expenses/", json={
        "group_id": group_id,
        "paid_by_id": paid_by,
        "description": "Hotel bill",
        "amount_minor": amount,
        "currency": "INR",
        "split_method": "equal",
        "expense_date": str(date.today()),
    })
    assert resp.status_code == 201
    shares = resp.json()["shares"]
    total_shares = sum(s["share_minor"] for s in shares)
    assert total_shares == amount, f"Shares {total_shares} != amount {amount}"


def test_net_group_balances_sum_to_zero():
    """Sum of all net balances must be zero."""
    group = _create_group_with_members()
    gid = group["id"]
    members = group["members"]

    # Alice pays 300, Bob pays 150, Charlie pays 0
    for payer_idx, amt in [(0, 30000), (1, 15000)]:
        client.post("/api/expenses/", json={
            "group_id": gid,
            "paid_by_id": members[payer_idx]["id"],
            "description": f"Expense {payer_idx}",
            "amount_minor": amt,
            "currency": "INR",
            "split_method": "equal",
            "expense_date": str(date.today()),
        })

    resp = client.get(f"/api/expenses/groups/{gid}/settlements")
    assert resp.status_code == 200
    balances = resp.json()["balances"]
    net_sum = sum(b["net_minor"] for b in balances)
    assert net_sum == 0, f"Net balances do not sum to zero: {net_sum}"


def test_settlements_clear_balances():
    """After applying suggested settlements, all balances should become zero."""
    group = _create_group_with_members()
    gid = group["id"]
    members = group["members"]

    client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members[0]["id"],
        "description": "Full dinner",
        "amount_minor": 60000,
        "currency": "INR",
        "split_method": "equal",
        "expense_date": str(date.today()),
    })

    resp = client.get(f"/api/expenses/groups/{gid}/settlements")
    plan = resp.json()
    # Each settlement amount must be > 0
    for s in plan["settlements"]:
        assert s["amount_minor"] > 0


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

def test_demo_status():
    response = client.get("/api/demo/status")
    assert response.status_code == 200
    assert "demo_mode" in response.json()


def test_demo_seed_and_idempotent():
    r1 = client.post("/api/demo/seed")
    assert r1.status_code == 200
    r2 = client.post("/api/demo/seed")
    assert r2.status_code == 200
    # Second call should not create a duplicate
    assert r1.json()["trip_id"] == r2.json()["trip_id"]


def test_demo_destinations():
    response = client.get("/api/demo/destinations")
    assert response.status_code == 200
    data = response.json()
    assert data["is_demo"] is True
    assert len(data["destinations"]) >= 3

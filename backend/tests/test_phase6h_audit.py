"""
Phase 6H Regression, Security & Destination Search Audit Tests.

Covers:
1. Critical Regression & User Data Isolation:
   - User registration and login token issuance.
   - Private trip ownership enforcement: User B cannot view, update, delete, generate
     itinerary, or enrich User A's private trip.
   - Unauthenticated user cannot view or mutate private trips or see them in trip list.
   - Unowned / demo trips remain accessible for preview and legacy operations.

2. Expense & Splitwise Group Security:
   - User B cannot attach an expense group to User A's trip (403).
   - User B cannot add members, record expenses, update expenses, delete expenses,
     settle debts, or delete expense groups attached to User A's trip (403).
   - User A has full CRUD access to their own trip groups and expenses.

3. Minimal Destination Search Audit (replacing Phase 6G):
   - International destination searches across Europe, Asia, Americas, and Oceania.
   - Disambiguation of ambiguous city queries (e.g. "Paris, TX", "London, UK", "Hyderabad, Pakistan").
   - Clear error on failed searches (no fake weather or unrelated fallback destination).
   - Coordinate validation (lat/lon bounds, single coordinate omission).
"""

import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.user import User
from app.models.base import Trip, ExpenseGroup, GroupMember, Expense, SplitMethod
from app.core.security import hash_password, create_access_token
from app.integrations.weather import validate_coordinates, geocode_worldwide

TEST_DB_URL = "sqlite:///./test_phase6h_audit.db"
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


@pytest.fixture
def test_users():
    """Create Alice (User 1) and Bob (User 2) in the isolated test DB."""
    db = TestingSessionLocal()
    try:
        user1 = User(
            email="alice@audit6h.test",
            name="Alice",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        user2 = User(
            email="bob@audit6h.test",
            name="Bob",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        db.add(user1)
        db.add(user2)
        db.commit()
        db.refresh(user1)
        db.refresh(user2)

        token1 = create_access_token(user1.id, user1.email)
        token2 = create_access_token(user2.id, user2.email)

        return {
            "alice": {"user": user1, "token": token1, "headers": {"Authorization": f"Bearer {token1}"}},
            "bob": {"user": user2, "token": token2, "headers": {"Authorization": f"Bearer {token2}"}},
        }
    finally:
        db.close()


# ==============================================================================
# 1. User Data Isolation & Trip Security
# ==============================================================================

def test_trip_creation_and_ownership_isolation(client, test_users):
    """Alice creates a trip. Bob must not be able to view, edit, or delete it."""
    alice_headers = test_users["alice"]["headers"]
    bob_headers = test_users["bob"]["headers"]

    today = date.today()
    trip_payload = {
        "name": "Alice's Private Japan Tour",
        "origin": "London",
        "destination": "Tokyo, Japan",
        "departure_date": str(today + timedelta(days=20)),
        "return_date": str(today + timedelta(days=27)),
        "num_travellers": 2,
        "budget_minor": 45000000,
        "currency": "JPY",
        "travel_styles": ["cultural", "food_nightlife"],
    }

    # Alice creates her trip
    res = client.post("/api/trips/", json=trip_payload, headers=alice_headers)
    assert res.status_code == 201
    trip_data = res.json()
    trip_id = trip_data["id"]
    db = TestingSessionLocal()
    db_trip = db.query(Trip).filter(Trip.id == trip_id).first()
    assert db_trip.user_id == test_users["alice"]["user"].id
    assert db_trip.is_demo is False
    db.close()

    # Alice can view her trip
    res_alice_get = client.get(f"/api/trips/{trip_id}", headers=alice_headers)
    assert res_alice_get.status_code == 200
    assert res_alice_get.json()["name"] == "Alice's Private Japan Tour"

    # Bob CANNOT view Alice's trip (403 Forbidden)
    res_bob_get = client.get(f"/api/trips/{trip_id}", headers=bob_headers)
    assert res_bob_get.status_code == 403
    assert "permission" in res_bob_get.json()["detail"].lower()

    # Unauthenticated user CANNOT view Alice's trip (403 Forbidden)
    res_anon_get = client.get(f"/api/trips/{trip_id}")
    assert res_anon_get.status_code == 403

    # Bob CANNOT update Alice's trip (403 Forbidden)
    res_bob_patch = client.patch(
        f"/api/trips/{trip_id}",
        json={"name": "Hacked by Bob", "budget_minor": 100},
        headers=bob_headers,
    )
    assert res_bob_patch.status_code == 403

    # Bob CANNOT delete Alice's trip (403 Forbidden)
    res_bob_delete = client.delete(f"/api/trips/{trip_id}", headers=bob_headers)
    assert res_bob_delete.status_code == 403

    # Bob CANNOT generate or replan Alice's itinerary (403 Forbidden)
    res_bob_gen = client.post(
        f"/api/itinerary/{trip_id}/generate",
        json={"overwrite_unlocked": True},
        headers=bob_headers,
    )
    assert res_bob_gen.status_code == 403

    # Bob CANNOT view Alice's trip budget (403 Forbidden)
    res_bob_budget = client.get(f"/api/itinerary/{trip_id}/budget", headers=bob_headers)
    assert res_bob_budget.status_code == 403

    # Bob CANNOT request AI itinerary enrichment for Alice's trip (403 Forbidden)
    res_bob_enrich = client.post(
        "/api/ai/enrich-itinerary",
        json={"trip_id": trip_id, "focus": "general"},
        headers=bob_headers,
    )
    assert res_bob_enrich.status_code == 403

    # Unauthenticated GET /api/trips/ must NOT expose Alice's private trip
    res_public_list = client.get("/api/trips/")
    assert res_public_list.status_code == 200
    public_ids = [t["id"] for t in res_public_list.json()]
    assert trip_id not in public_ids

    # Bob's trip list must NOT include Alice's trip
    res_bob_list = client.get("/api/trips/", headers=bob_headers)
    assert res_bob_list.status_code == 200
    bob_ids = [t["id"] for t in res_bob_list.json()]
    assert trip_id not in bob_ids

    # Alice's trip list DOES include her trip
    res_alice_list = client.get("/api/trips/", headers=alice_headers)
    assert res_alice_list.status_code == 200
    alice_ids = [t["id"] for t in res_alice_list.json()]
    assert trip_id in alice_ids

    # Alice CAN successfully update her own trip
    res_alice_patch = client.patch(
        f"/api/trips/{trip_id}",
        json={"notes": "Updated packing list: passport and camera"},
        headers=alice_headers,
    )
    assert res_alice_patch.status_code == 200
    assert res_alice_patch.json()["notes"] == "Updated packing list: passport and camera"

    # Alice CAN successfully delete her own trip
    res_alice_del = client.delete(f"/api/trips/{trip_id}", headers=alice_headers)
    assert res_alice_del.status_code == 204

    # Verify trip is deleted
    assert client.get(f"/api/trips/{trip_id}", headers=alice_headers).status_code == 404


def test_unowned_and_demo_trips_remain_accessible(client):
    """Trips created without user_id (demo or test trips) must remain accessible without auth."""
    today = date.today()
    payload = {
        "name": "Public Demo Trip",
        "origin": "Mumbai",
        "destination": "Goa, India",
        "departure_date": str(today + timedelta(days=10)),
        "return_date": str(today + timedelta(days=14)),
        "num_travellers": 2,
        "budget_minor": 5000000,
        "currency": "INR",
        "travel_styles": ["leisurely"],
    }
    # Unauthenticated creation (demo / legacy mode)
    create_res = client.post("/api/trips/", json=payload)
    assert create_res.status_code == 201
    trip_id = create_res.json()["id"]

    # Unauthenticated view
    get_res = client.get(f"/api/trips/{trip_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Public Demo Trip"

    # Unauthenticated patch
    patch_res = client.patch(f"/api/trips/{trip_id}", json={"budget_minor": 6000000})
    assert patch_res.status_code == 200
    assert patch_res.json()["budget_minor"] == 6000000

    # Unauthenticated delete
    del_res = client.delete(f"/api/trips/{trip_id}")
    assert del_res.status_code == 204


# ==============================================================================
# 2. Expense Group Authorization Checks
# ==============================================================================

def test_expense_group_trip_authorization(client, test_users):
    """User B cannot tamper with an expense group attached to User A's private trip."""
    alice_headers = test_users["alice"]["headers"]
    bob_headers = test_users["bob"]["headers"]

    today = date.today()
    # 1. Alice creates a trip
    trip_res = client.post("/api/trips/", json={
        "name": "Alice Paris Vacation",
        "origin": "London",
        "destination": "Paris, France",
        "departure_date": str(today + timedelta(days=15)),
        "return_date": str(today + timedelta(days=20)),
        "num_travellers": 2,
        "budget_minor": 200000,
        "currency": "EUR",
    }, headers=alice_headers)
    assert trip_res.status_code == 201
    trip_id = trip_res.json()["id"]

    # 2. Bob attempts to attach an expense group to Alice's trip -> 403 Forbidden
    bob_group_res = client.post("/api/expenses/groups", json={
        "trip_id": trip_id,
        "name": "Bob's Sneaky Group",
        "currency": "EUR",
        "members": [{"name": "Bob"}, {"name": "Charlie"}],
    }, headers=bob_headers)
    assert bob_group_res.status_code == 403

    # 3. Alice attaches an expense group to her trip -> 201 Created
    alice_group_res = client.post("/api/expenses/groups", json={
        "trip_id": trip_id,
        "name": "Paris Trip Expenses",
        "currency": "EUR",
        "members": [{"name": "Alice"}, {"name": "Bob"}],
    }, headers=alice_headers)
    assert alice_group_res.status_code == 201
    group_data = alice_group_res.json()
    group_id = group_data["id"]
    alice_member_id = group_data["members"][0]["id"]
    bob_member_id = group_data["members"][1]["id"]

    # 4. Bob tries to add a member to Alice's trip group -> 403 Forbidden
    bob_add_member = client.post(
        f"/api/expenses/groups/{group_id}/members",
        json={"name": "Attacker"},
        headers=bob_headers,
    )
    assert bob_add_member.status_code == 403

    # 5. Alice creates an expense in the group
    exp_res = client.post("/api/expenses/", json={
        "group_id": group_id,
        "paid_by_id": alice_member_id,
        "description": "Eiffel Tower tickets",
        "amount_minor": 6000,
        "currency": "EUR",
        "category": "entertainment",
        "split_method": "equal",
    }, headers=alice_headers)
    assert exp_res.status_code == 201
    expense_id = exp_res.json()["id"]

    # 6. Bob tries to create an expense in Alice's trip group -> 403 Forbidden
    bob_add_exp = client.post("/api/expenses/", json={
        "group_id": group_id,
        "paid_by_id": bob_member_id,
        "description": "Bob's unauthorized expense",
        "amount_minor": 10000,
        "currency": "EUR",
        "category": "food",
        "split_method": "equal",
    }, headers=bob_headers)
    assert bob_add_exp.status_code == 403

    # 7. Bob tries to update Alice's expense -> 403 Forbidden
    bob_update_exp = client.put(
        f"/api/expenses/{expense_id}",
        json={"amount_minor": 12000},
        headers=bob_headers,
    )
    assert bob_update_exp.status_code == 403

    # 8. Bob tries to delete Alice's expense -> 403 Forbidden
    bob_del_exp = client.delete(f"/api/expenses/{expense_id}", headers=bob_headers)
    assert bob_del_exp.status_code == 403

    # 9. Bob tries to settle debts in Alice's trip group -> 403 Forbidden
    bob_settle = client.post(
        f"/api/expenses/groups/{group_id}/settle",
        json={"from_member_id": bob_member_id, "to_member_id": alice_member_id, "amount_minor": 3000},
        headers=bob_headers,
    )
    assert bob_settle.status_code == 403

    # 10. Bob tries to delete Alice's expense group -> 403 Forbidden
    bob_del_group = client.delete(f"/api/expenses/groups/{group_id}", headers=bob_headers)
    assert bob_del_group.status_code == 403


# ==============================================================================
# 3. Minimal Destination Search Audit (replacing Phase 6G)
# ==============================================================================

@pytest.mark.asyncio
async def test_international_destinations_search():
    """Verify Open-Meteo geocoding across major continents."""
    # Asia
    res_tokyo = await geocode_worldwide("Tokyo", count=3)
    assert len(res_tokyo) > 0
    assert any("japan" in r["country"].lower() for r in res_tokyo)

    # Europe
    res_london = await geocode_worldwide("London", count=3)
    assert len(res_london) > 0
    assert any("united kingdom" in r["country"].lower() or "uk" in r["country"].lower() for r in res_london)

    # Americas
    res_ny = await geocode_worldwide("New York", count=3)
    assert len(res_ny) > 0
    assert any("united states" in r["country"].lower() for r in res_ny)

    # Oceania
    res_sydney = await geocode_worldwide("Sydney", count=3)
    assert len(res_sydney) > 0
    assert any("australia" in r["country"].lower() for r in res_sydney)


@pytest.mark.asyncio
async def test_ambiguous_destination_disambiguation():
    """Verify multi-part queries correctly disambiguate identical city names."""
    # Paris, TX vs Paris, France
    res_paris_tx = await geocode_worldwide("Paris, TX", count=3)
    assert len(res_paris_tx) > 0
    assert all("texas" in (r["region"] or "").lower() or "united states" in r["country"].lower() for r in res_paris_tx)

    # London, UK
    res_london_uk = await geocode_worldwide("London, UK", count=3)
    assert len(res_london_uk) > 0
    assert all("united kingdom" in r["country"].lower() or "gb" in r["country"].lower() for r in res_london_uk)

    # Hyderabad, Pakistan vs Hyderabad, India
    res_hyd_pk = await geocode_worldwide("Hyderabad, Pakistan", count=3)
    assert len(res_hyd_pk) > 0
    assert all("pakistan" in r["country"].lower() for r in res_hyd_pk)


@pytest.mark.asyncio
async def test_failed_destination_search_returns_clear_error(client):
    """Non-existent locations must return empty geocoding and a clear error rather than fake weather."""
    # 1. Geocoding autocomplete returns empty
    res_geo = client.get("/api/weather/geocoding?q=zzqxynotrealcity12345")
    assert res_geo.status_code == 200
    assert res_geo.json()["results"] == []

    # 2. Weather endpoint returns error payload
    res_weather = client.get("/api/weather?city=zzqxynotrealcity12345")
    assert res_weather.status_code == 200
    data = res_weather.json()
    assert data["error"] is not None
    assert "could not find coordinates" in data["error"].lower()
    assert data["days"] == []


def test_coordinate_validation_before_weather_request(client):
    """Latitude and longitude bounds must be validated to prevent provider errors."""
    # 1. Latitude > 90
    r_lat_high = client.get("/api/weather?lat=95.0&lon=72.0")
    assert r_lat_high.status_code == 422

    # 2. Latitude < -90
    r_lat_low = client.get("/api/weather?lat=-95.0&lon=72.0")
    assert r_lat_low.status_code == 422

    # 3. Longitude > 180
    r_lon_high = client.get("/api/weather?lat=19.0&lon=185.0")
    assert r_lon_high.status_code == 422

    # 4. Longitude < -180
    r_lon_low = client.get("/api/weather?lat=19.0&lon=-185.0")
    assert r_lon_low.status_code == 422

    # 5. Mismatched single coordinate (lat without lon)
    r_mismatch = client.get("/api/weather?lat=19.0")
    assert r_mismatch.status_code == 422
    assert "both latitude and longitude" in r_mismatch.json()["detail"].lower()

    # 6. Valid coordinates helper function
    valid, err = validate_coordinates(19.076, 72.877)
    assert valid is True
    assert err is None

    invalid, err_msg = validate_coordinates(100.0, 72.0)
    assert invalid is False
    assert "between -90.0 and 90.0" in err_msg

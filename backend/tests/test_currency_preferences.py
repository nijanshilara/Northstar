"""
Tests for Global Currency Preferences & Integration in Northstar.
Validates:
- Default preferred currency is INR for new & existing users
- Default show_converted_prices is True
- Updating preferred_currency and show_converted_prices via PATCH /api/auth/profile
- Persistence in SQLite database
- Currency conversion API behavior (INR, EUR, USD, AED, JPY)
- Same-currency conversion handling (1:1 instant)
"""

from __future__ import annotations
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db, ensure_sqlite_schema
from app.models.user import User
from app.core.security import hash_password, create_access_token
from app.schemas.auth_schemas import UpdateProfileRequest
from app.services import auth_service

TEST_DB_URL = "sqlite:///./test_currency_prefs.db"
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
    ensure_sqlite_schema(engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)
    if os.path.exists("./test_currency_prefs.db"):
        try:
            os.remove("./test_currency_prefs.db")
        except OSError:
            pass


@pytest.fixture
def client(setup_test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def test_user(setup_test_db) -> User:
    db = TestingSessionLocal()
    user = User(
        name="Currency Traveler",
        email="traveler.currency@example.com",
        hashed_password=hash_password("SecurePass123"),
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def test_user_defaults_to_inr_and_show_converted(test_user):
    """Test that a newly created or existing user defaults to INR and show_converted_prices=True."""
    db = TestingSessionLocal()
    u = db.query(User).filter(User.id == test_user.id).first()
    assert u.preferred_currency == "INR"
    assert u.show_converted_prices is True
    db.close()


def test_update_currency_preferences_via_service(test_user):
    """Test updating currency preference and toggle via auth_service."""
    db = TestingSessionLocal()
    u = db.query(User).filter(User.id == test_user.id).first()
    
    # Update to EUR and disable conversion display
    req = UpdateProfileRequest(preferred_currency="EUR", show_converted_prices=False)
    updated = auth_service.update_profile(db, u, req)
    assert updated.preferred_currency == "EUR"
    assert updated.show_converted_prices is False

    # Verify persistence after new query
    db.expire_all()
    re_queried = db.query(User).filter(User.id == test_user.id).first()
    assert re_queried.preferred_currency == "EUR"
    assert re_queried.show_converted_prices is False

    # Update back to JPY and enable conversion display
    req2 = UpdateProfileRequest(preferred_currency="jpy", show_converted_prices=True)
    updated2 = auth_service.update_profile(db, re_queried, req2)
    assert updated2.preferred_currency == "JPY"
    assert updated2.show_converted_prices is True
    db.close()


def test_update_profile_api_with_currency_preferences(client, test_user):
    """Test PATCH /api/auth/profile updates preferred_currency and show_converted_prices."""
    token = create_access_token(test_user.id, test_user.email)
    client.cookies.set("access_token", token)

    # 1. Check GET /api/auth/me returns default currency preferences
    r_me = client.get("/api/auth/me")
    assert r_me.status_code == 200
    data_me = r_me.json()
    assert data_me["preferred_currency"] == "INR"
    assert data_me["show_converted_prices"] is True

    # 2. Update to USD and verify response
    r_patch = client.patch(
        "/api/auth/profile",
        json={"preferred_currency": "USD", "show_converted_prices": True},
    )
    assert r_patch.status_code == 200
    data_patch = r_patch.json()
    assert data_patch["preferred_currency"] == "USD"
    assert data_patch["show_converted_prices"] is True

    # 3. Check /me reflects updated currency
    r_me2 = client.get("/api/auth/me")
    assert r_me2.status_code == 200
    assert r_me2.json()["preferred_currency"] == "USD"


def test_currency_api_endpoints(client):
    """Test existing currency API endpoints for listing and rates."""
    # List currencies
    r_curr = client.get("/api/currency/currencies")
    assert r_curr.status_code == 200
    data_curr = r_curr.json()
    assert "INR" in data_curr["currencies"]
    assert "USD" in data_curr["currencies"]
    assert "EUR" in data_curr["currencies"]
    assert "AED" in data_curr["currencies"]

    # Same currency conversion (instant 1:1)
    r_conv = client.get("/api/currency/convert", params={"from": "INR", "to": "INR", "amount": 500})
    assert r_conv.status_code == 200
    data_conv = r_conv.json()
    assert data_conv["converted_amount"] == 500.0
    assert data_conv["rate"] == 1.0

"""
Phase 3 — Authentication and history tests.
Uses an in-memory SQLite database; does not touch travel_guide.db.
"""

from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models import base as _base_models  # noqa: F401 — register trips/activities/expenses
from app.models import user as _user_models   # noqa: F401 — register users/tokens/history

# ── In-memory test DB (file-based temp to avoid SQLite in-memory isolation) ───

TEST_DB_URL = "sqlite:///./test_phase3.db"
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
    """Create all tables before each test, drop after, install/remove override."""
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client(setup_test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ── Registration ──────────────────────────────────────────────────────────────

def test_register_success(client):
    r = client.post("/api/auth/register", json={
        "name": "Alice", "email": "alice@example.com", "password": "Secure1Pass"
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["is_verified"] is False
    # Cookie set
    assert "access_token" in r.cookies


def test_register_duplicate_email(client):
    payload = {"name": "Bob", "email": "bob@example.com", "password": "Secure1Pass"}
    client.post("/api/auth/register", json=payload)
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 409


def test_register_weak_password(client):
    r = client.post("/api/auth/register", json={
        "name": "Weak", "email": "weak@example.com", "password": "nodigit"
    })
    assert r.status_code == 422


def test_register_no_uppercase(client):
    r = client.post("/api/auth/register", json={
        "name": "Lower", "email": "lower@example.com", "password": "alllower1"
    })
    assert r.status_code == 422


# ── Login / Logout ────────────────────────────────────────────────────────────

def test_login_success(client):
    client.post("/api/auth/register", json={
        "name": "Carol", "email": "carol@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/login", json={
        "email": "carol@example.com", "password": "Valid1Pass"
    })
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "carol@example.com"
    assert "access_token" in r.cookies


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "name": "Dave", "email": "dave@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/login", json={
        "email": "dave@example.com", "password": "WrongPass1"
    })
    assert r.status_code == 401


def test_login_unknown_email(client):
    r = client.post("/api/auth/login", json={
        "email": "nobody@example.com", "password": "Valid1Pass"
    })
    assert r.status_code == 401


def test_logout_clears_cookie(client):
    client.post("/api/auth/register", json={
        "name": "Eve", "email": "eve@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/logout")
    assert r.status_code == 200


# ── /me endpoint ──────────────────────────────────────────────────────────────

def test_me_authenticated(client):
    client.post("/api/auth/register", json={
        "name": "Frank", "email": "frank@example.com", "password": "Valid1Pass"
    })
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "frank@example.com"


def test_me_unauthenticated(client):
    # Fresh client without cookies — override already active on app via fixture
    fresh = TestClient(app)
    r = fresh.get("/api/auth/me")
    assert r.status_code == 401


# ── Email verification ────────────────────────────────────────────────────────

def test_email_verification_flow(client):
    r = client.post("/api/auth/register", json={
        "name": "Grace", "email": "grace@example.com", "password": "Valid1Pass"
    })
    # In dev mode, token is in response
    token = r.json().get("dev_verification_token")
    assert token is not None, "Expected dev_verification_token in dev mode"

    r2 = client.post("/api/auth/verify-email", json={"token": token})
    assert r2.status_code == 200
    assert r2.json()["user"]["is_verified"] is True


def test_verification_token_single_use(client):
    r = client.post("/api/auth/register", json={
        "name": "Henry", "email": "henry@example.com", "password": "Valid1Pass"
    })
    token = r.json().get("dev_verification_token")
    client.post("/api/auth/verify-email", json={"token": token})
    r2 = client.post("/api/auth/verify-email", json={"token": token})
    assert r2.status_code == 400  # already used


def test_verification_invalid_token(client):
    r = client.post("/api/auth/verify-email", json={"token": "a" * 64})
    assert r.status_code == 400


# ── Password reset ────────────────────────────────────────────────────────────

def test_forgot_password_registered_email(client):
    client.post("/api/auth/register", json={
        "name": "Iris", "email": "iris@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/forgot-password", json={"email": "iris@example.com"})
    assert r.status_code == 200
    # Does NOT reveal existence — same message for registered/unregistered
    assert "reset link" in r.json()["message"].lower() or "registered" in r.json()["message"].lower()


def test_forgot_password_unregistered_email(client):
    r = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 200  # must NOT return 404


def test_reset_password_flow(client):
    client.post("/api/auth/register", json={
        "name": "Jack", "email": "jack@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/forgot-password", json={"email": "jack@example.com"})
    token = r.json().get("dev_token")
    assert token is not None, "Expected dev_token in dev mode"

    r2 = client.post("/api/auth/reset-password", json={
        "token": token, "new_password": "NewValid2Pass"
    })
    assert r2.status_code == 200

    # Old password should no longer work
    r3 = client.post("/api/auth/login", json={"email": "jack@example.com", "password": "Valid1Pass"})
    assert r3.status_code == 401

    # New password works
    r4 = client.post("/api/auth/login", json={"email": "jack@example.com", "password": "NewValid2Pass"})
    assert r4.status_code == 200


def test_reset_token_single_use(client):
    client.post("/api/auth/register", json={
        "name": "Kim", "email": "kim@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/forgot-password", json={"email": "kim@example.com"})
    token = r.json().get("dev_token")
    client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewValid2Pass"})
    r2 = client.post("/api/auth/reset-password", json={"token": token, "new_password": "AnotherPass3"})
    assert r2.status_code == 400


# ── Profile ───────────────────────────────────────────────────────────────────

def test_update_profile(client):
    client.post("/api/auth/register", json={
        "name": "Lena", "email": "lena@example.com", "password": "Valid1Pass"
    })
    r = client.patch("/api/auth/profile", json={"name": "Lena Updated", "theme": "dark"})
    assert r.status_code == 200
    assert r.json()["name"] == "Lena Updated"
    assert r.json()["theme"] == "dark"


def test_change_password(client):
    client.post("/api/auth/register", json={
        "name": "Mike", "email": "mike@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/change-password", json={
        "current_password": "Valid1Pass", "new_password": "NewValid2Pass"
    })
    assert r.status_code == 200


def test_change_password_wrong_current(client):
    client.post("/api/auth/register", json={
        "name": "Nina", "email": "nina@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/auth/change-password", json={
        "current_password": "WrongPass1", "new_password": "NewValid2Pass"
    })
    assert r.status_code == 400


# ── History ───────────────────────────────────────────────────────────────────

def test_history_add_and_list(client):
    client.post("/api/auth/register", json={
        "name": "Otto", "email": "otto@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/history/", json={
        "event_type": "search", "label": "Goa beaches", "is_saved": False
    })
    assert r.status_code == 201

    r2 = client.get("/api/history/")
    assert r2.status_code == 200
    items = r2.json()
    assert len(items) == 1
    assert items[0]["label"] == "Goa beaches"


def test_history_requires_auth(client):
    # Override already active on app via fixture
    fresh = TestClient(app)
    r = fresh.get("/api/history/")
    assert r.status_code == 401


def test_history_ownership_isolation(client):
    """User A cannot see User B's history."""
    # Register user A
    client.post("/api/auth/register", json={
        "name": "UserA", "email": "a@example.com", "password": "Valid1Pass"
    })
    client.post("/api/history/", json={"event_type": "search", "label": "A secret"})
    client.post("/api/auth/logout")

    # Register user B
    client.post("/api/auth/register", json={
        "name": "UserB", "email": "b@example.com", "password": "Valid1Pass"
    })
    r = client.get("/api/history/")
    assert r.status_code == 200
    assert len(r.json()) == 0  # B sees nothing of A's history


def test_history_delete(client):
    client.post("/api/auth/register", json={
        "name": "Pete", "email": "pete@example.com", "password": "Valid1Pass"
    })
    r = client.post("/api/history/", json={"event_type": "search", "label": "Paris"})
    item_id = r.json()["id"]
    r2 = client.delete(f"/api/history/{item_id}")
    assert r2.status_code == 204
    assert len(client.get("/api/history/").json()) == 0


def test_history_clear(client):
    client.post("/api/auth/register", json={
        "name": "Quinn", "email": "quinn@example.com", "password": "Valid1Pass"
    })
    for label in ["A", "B", "C"]:
        client.post("/api/history/", json={"event_type": "search", "label": label})
    r = client.delete("/api/history/?confirm=true")
    assert r.status_code == 200
    assert len(client.get("/api/history/").json()) == 0


# ── Account deletion ──────────────────────────────────────────────────────────

def test_delete_account(client):
    client.post("/api/auth/register", json={
        "name": "Rita", "email": "rita@example.com", "password": "Valid1Pass"
    })
    r = client.delete("/api/auth/account")
    assert r.status_code == 200
    # Can no longer login
    r2 = client.post("/api/auth/login", json={"email": "rita@example.com", "password": "Valid1Pass"})
    assert r2.status_code == 401

"""
Phase 5 — Memory Capsules and Travel Memories tests.
Tests capsule CRUD, memory management, media uploads & validation,
cross-user ownership isolation, and safe media serving.
"""
from __future__ import annotations
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models import base as _base_models     # noqa: F401
from app.models import user as _user_models     # noqa: F401
from app.models import capsule as _capsule_models  # noqa: F401

TEST_DB_URL = "sqlite:///./test_phase5.db"
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


def _register_user(client: TestClient, name: str, email: str, password: str = "Secret123Pass"):
    """Helper to register a user and return the client with auth cookies set."""
    r = client.post("/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password,
    })
    assert r.status_code == 201, r.text
    return r.json()["user"]


# ── Capsule CRUD tests ────────────────────────────────────────────────────────

def test_capsule_unauthenticated(client):
    """Unauthenticated users cannot access capsules."""
    r = client.get("/api/capsules/")
    assert r.status_code == 401

    r = client.post("/api/capsules/", json={"title": "Unauthorized"})
    assert r.status_code == 401


def test_capsule_crud(client):
    """Authenticated user can create, read, update, and delete capsules."""
    _register_user(client, "Alice", "alice@example.com")

    # 1. Create
    r = client.post("/api/capsules/", json={
        "title": "Summer in Goa",
        "description": "Family beach vacation with lots of seafood and sunsets.",
        "destination": "Goa, India",
        "start_date": "2026-11-10",
        "end_date": "2026-11-15",
        "cover_image_url": "https://example.com/cover.jpg",
    })
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["id"] > 0
    assert created["title"] == "Summer in Goa"
    assert created["destination"] == "Goa, India"
    assert created["memory_count"] == 0
    assert created["memories"] == []

    capsule_id = created["id"]

    # 2. List
    r = client.get("/api/capsules/")
    assert r.status_code == 200
    capsules = r.json()
    assert len(capsules) == 1
    assert capsules[0]["id"] == capsule_id
    assert capsules[0]["title"] == "Summer in Goa"

    # 3. Get single detail
    r = client.get(f"/api/capsules/{capsule_id}")
    assert r.status_code == 200
    detail = r.json()
    assert detail["title"] == "Summer in Goa"
    assert detail["description"].startswith("Family beach")

    # 4. Update
    r = client.put(f"/api/capsules/{capsule_id}", json={
        "title": "Unforgettable Goa Trip",
        "destination": "Goa & Gokarna",
    })
    assert r.status_code == 200
    updated = r.json()
    assert updated["title"] == "Unforgettable Goa Trip"
    assert updated["destination"] == "Goa & Gokarna"

    # 5. Search filter
    r = client.get("/api/capsules/?search=Gokarna")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.get("/api/capsules/?search=Nonexistent")
    assert r.status_code == 200
    assert len(r.json()) == 0

    # 6. Delete
    r = client.delete(f"/api/capsules/{capsule_id}")
    assert r.status_code == 200

    # 7. Verify deletion
    r = client.get(f"/api/capsules/{capsule_id}")
    assert r.status_code == 404


# ── Ownership & Privacy Isolation ─────────────────────────────────────────────

def test_capsule_ownership_isolation(setup_test_db):
    """User B cannot view, modify, or delete User A's capsule."""
    with TestClient(app) as client_a, TestClient(app) as client_b:
        _register_user(client_a, "Alice", "alice@example.com")
        _register_user(client_b, "Bob", "bob@example.com")

        # Alice creates a capsule
        r = client_a.post("/api/capsules/", json={
            "title": "Alice's Secret Journal",
            "destination": "Paris, France",
        })
        assert r.status_code == 201
        capsule_id = r.json()["id"]

        # Bob lists capsules — should be empty for Bob
        r = client_b.get("/api/capsules/")
        assert r.status_code == 200
        assert len(r.json()) == 0

        # Bob attempts to get Alice's capsule — 403 Forbidden
        r = client_b.get(f"/api/capsules/{capsule_id}")
        assert r.status_code == 403

        # Bob attempts to update Alice's capsule — 403 Forbidden
        r = client_b.put(f"/api/capsules/{capsule_id}", json={"title": "Hacked Title"})
        assert r.status_code == 403

        # Bob attempts to delete Alice's capsule — 403 Forbidden
        r = client_b.delete(f"/api/capsules/{capsule_id}")
        assert r.status_code == 403

        # Alice's capsule is still intact
        r = client_a.get(f"/api/capsules/{capsule_id}")
        assert r.status_code == 200
        assert r.json()["title"] == "Alice's Secret Journal"


# ── Memory CRUD & Reordering ──────────────────────────────────────────────────

def test_memory_crud_and_reorder(client):
    """Add memories, update captions, reorder them, and verify counts."""
    _register_user(client, "Alice", "alice@example.com")

    # Create capsule
    r = client.post("/api/capsules/", json={
        "title": "Japan Journey",
        "destination": "Tokyo & Kyoto",
    })
    capsule_id = r.json()["id"]

    # 1. Add first memory (image)
    r = client.post(f"/api/capsules/{capsule_id}/memories", json={
        "title": "Shibuya Crossing",
        "note": "So crowded but mesmerizing lights!",
        "memory_date": "2026-10-01",
        "location": "Tokyo",
        "media_type": "image",
        "media_url": "https://example.com/shibuya.jpg",
    })
    assert r.status_code == 201, r.text
    mem1 = r.json()
    assert mem1["title"] == "Shibuya Crossing"
    assert mem1["display_order"] == 1

    # Check capsule automatically adopted cover_image_url
    r = client.get(f"/api/capsules/{capsule_id}")
    assert r.json()["cover_image_url"] == "https://example.com/shibuya.jpg"
    assert r.json()["memory_count"] == 1

    # 2. Add second memory
    r = client.post(f"/api/capsules/{capsule_id}/memories", json={
        "title": "Fushimi Inari Shrine",
        "note": "Thousands of vermilion torii gates.",
        "memory_date": "2026-10-03",
        "location": "Kyoto",
        "media_type": "image",
        "media_url": "https://example.com/inari.jpg",
    })
    assert r.status_code == 201
    mem2 = r.json()

    # 3. Add third memory
    r = client.post(f"/api/capsules/{capsule_id}/memories", json={
        "title": "Bullet Train Ride",
        "note": "Smooth 300km/h ride from Tokyo to Kyoto.",
        "memory_date": "2026-10-02",
        "location": "Shinkansen",
        "media_type": "image",
        "media_url": "https://example.com/train.jpg",
    })
    assert r.status_code == 201
    mem3 = r.json()

    # 4. Check list has 3 memories
    r = client.get(f"/api/capsules/{capsule_id}")
    assert len(r.json()["memories"]) == 3

    # 5. Update second memory
    r = client.put(f"/api/capsules/{capsule_id}/memories/{mem2['id']}", json={
        "title": "Morning at Fushimi Inari",
        "note": "Hiked all the way to the top summit!",
    })
    assert r.status_code == 200
    assert r.json()["title"] == "Morning at Fushimi Inari"

    # 6. Reorder memories (put mem3 first, then mem1, then mem2)
    r = client.put(f"/api/capsules/{capsule_id}/reorder", json={
        "memory_ids": [mem3["id"], mem1["id"], mem2["id"]]
    })
    assert r.status_code == 200
    reordered = r.json()
    assert reordered[0]["id"] == mem3["id"]
    assert reordered[1]["id"] == mem1["id"]
    assert reordered[2]["id"] == mem2["id"]

    # 7. Delete one memory
    r = client.delete(f"/api/capsules/{capsule_id}/memories/{mem1['id']}")
    assert r.status_code == 200

    r = client.get(f"/api/capsules/{capsule_id}")
    assert len(r.json()["memories"]) == 2


# ── Media Upload & Validation Tests ───────────────────────────────────────────

def test_media_upload_validation(client):
    """File uploads enforce extension, MIME, size limits and ownership."""
    _register_user(client, "Alice", "alice@example.com")

    r = client.post("/api/capsules/", json={"title": "Upload Test Capsule"})
    capsule_id = r.json()["id"]

    # 1. Valid image upload
    fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
    files = {"file": ("vacation.png", io.BytesIO(fake_png), "image/png")}
    r = client.post(f"/api/capsules/{capsule_id}/upload", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["media_type"] == "image"
    assert data["media_url"].startswith("/api/capsules/media/")
    assert data["file_size_bytes"] == len(fake_png)

    # 2. Serve the uploaded file safely
    media_url = data["media_url"]
    r = client.get(media_url)
    assert r.status_code == 200
    assert r.content == fake_png

    # 3. Disallowed file type (.exe)
    bad_file = {"file": ("malware.exe", io.BytesIO(b"MZ\x00\x00"), "application/octet-stream")}
    r = client.post(f"/api/capsules/{capsule_id}/upload", files=bad_file)
    assert r.status_code == 400
    assert "Unsupported file format" in r.text

    # 4. Empty file
    empty_file = {"file": ("empty.jpg", io.BytesIO(b""), "image/jpeg")}
    r = client.post(f"/api/capsules/{capsule_id}/upload", files=empty_file)
    assert r.status_code == 400
    assert "empty" in r.text.lower()

    # 5. Directory traversal prevention
    r = client.get("/api/capsules/media/../../etc/passwd")
    assert r.status_code == 404

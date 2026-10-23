"""
Phase 6D Automated Tests — Memory Capsules Audit & Stabilisation.
Tests against the real database schema covering:
1. Capsule CRUD (create, read, update, delete).
2. Date range validation (end_date >= start_date).
3. Memory CRUD (add image/video memories, update, reorder, delete).
4. Media upload validation (JPEG/PNG/MP4 accepted, EXE/empty/oversized rejected).
5. Authentication and cross-user ownership isolation (Capsule & Memory).
6. Private media serving security (owner=200, unauthenticated=401, non-owner=403).
7. Path traversal prevention (e.g. ../../etc/passwd -> 404).
8. Safe file deletion and reference checking.
9. Persistence across fresh API requests.
"""

import io
import os
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.user import User
from app.models.capsule import Capsule, Memory
from app.core.security import hash_password, create_access_token
from app.services.capsule_service import UPLOAD_DIR

TEST_DB_URL = "sqlite:///./test_capsules_phase6d.db"
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
    """Create two test users in the test database: Alice (User 1) and Bob (User 2)."""
    db = TestingSessionLocal()
    try:
        user1 = User(
            email="alice@capsule.test",
            name="Alice",
            hashed_password=hash_password("Password123!"),
            is_active=True,
            is_verified=True,
        )
        user2 = User(
            email="bob@capsule.test",
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


# ─────────────────────────────────────────────────────────────────────────────
# 1. Capsule CRUD & Persistence
# ─────────────────────────────────────────────────────────────────────────────

def test_capsule_crud_lifecycle(client, test_users):
    """Test full lifecycle: create capsule, read detail, update, and delete."""
    headers = test_users["alice"]["headers"]

    # 1. Create
    payload = {
        "title": "Summer in Ladakh",
        "description": "Breathtaking mountain passes and monasteries",
        "destination": "Leh, Ladakh",
        "start_date": "2026-07-01",
        "end_date": "2026-07-10",
        "cover_image_url": "https://example.com/ladakh.jpg",
    }
    res = client.post("/api/capsules/", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    created = res.json()
    capsule_id = created["id"]
    assert created["title"] == "Summer in Ladakh"
    assert created["destination"] == "Leh, Ladakh"
    assert created["user_id"] == test_users["alice"]["user"].id

    # 2. Read single
    res_get = client.get(f"/api/capsules/{capsule_id}", headers=headers)
    assert res_get.status_code == 200
    capsule_detail = res_get.json()
    assert capsule_detail["id"] == capsule_id
    assert capsule_detail["title"] == "Summer in Ladakh"
    assert "memories" in capsule_detail

    # 3. Update
    update_payload = {
        "title": "Summer in Ladakh & Spiti",
        "destination": "Leh and Kaza",
        "end_date": "2026-07-15",
    }
    res_update = client.put(f"/api/capsules/{capsule_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["title"] == "Summer in Ladakh & Spiti"
    assert updated["destination"] == "Leh and Kaza"
    assert updated["end_date"] == "2026-07-15"

    # 4. Delete
    res_del = client.delete(f"/api/capsules/{capsule_id}", headers=headers)
    assert res_del.status_code == 200
    assert res_del.json()["id"] == capsule_id

    # 5. Verify deletion
    res_after = client.get(f"/api/capsules/{capsule_id}", headers=headers)
    assert res_after.status_code == 404


def test_capsule_date_range_validation(client, test_users):
    """Reject capsules where end_date is earlier than start_date."""
    headers = test_users["alice"]["headers"]

    invalid_payload = {
        "title": "Invalid Chronology Trip",
        "start_date": "2026-08-15",
        "end_date": "2026-08-10",  # earlier than start
    }
    res = client.post("/api/capsules/", json=invalid_payload, headers=headers)
    assert res.status_code in (400, 422), f"Expected 400/422 but got {res.status_code}"

    # Now create valid, then attempt invalid update
    valid_payload = {
        "title": "Valid Chronology Trip",
        "start_date": "2026-08-15",
        "end_date": "2026-08-20",
    }
    res_create = client.post("/api/capsules/", json=valid_payload, headers=headers)
    assert res_create.status_code == 201
    cap_id = res_create.json()["id"]

    res_invalid_update = client.put(
        f"/api/capsules/{cap_id}",
        json={"end_date": "2026-08-01"},  # before start_date
        headers=headers,
    )
    assert res_invalid_update.status_code in (400, 422)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Memory CRUD, Ordering & Deletion
# ─────────────────────────────────────────────────────────────────────────────

def test_memory_crud_and_reordering(client, test_users):
    """Create memories, reorder them, edit metadata, and delete."""
    headers = test_users["alice"]["headers"]

    # Create capsule
    res = client.post("/api/capsules/", json={"title": "Goa Reunion"}, headers=headers)
    capsule_id = res.json()["id"]

    # 1. Add Memory 1
    m1_payload = {
        "title": "Sunset at Vagator",
        "note": "Crimson skies and sound of waves",
        "memory_date": "2026-11-01",
        "location": "Vagator Beach",
        "media_type": "image",
        "media_url": "https://example.com/vagator.jpg",
    }
    res_m1 = client.post(f"/api/capsules/{capsule_id}/memories", json=m1_payload, headers=headers)
    assert res_m1.status_code == 201
    m1 = res_m1.json()
    assert m1["display_order"] == 1

    # 2. Add Memory 2
    m2_payload = {
        "title": "Dinner at Martin's Corner",
        "note": "Amazing crab and live fado music",
        "memory_date": "2026-11-02",
        "location": "Betalbatim",
        "media_type": "image",
        "media_url": "https://example.com/martins.jpg",
    }
    res_m2 = client.post(f"/api/capsules/{capsule_id}/memories", json=m2_payload, headers=headers)
    assert res_m2.status_code == 201
    m2 = res_m2.json()
    assert m2["display_order"] == 2

    # 3. Reorder memories (swap m2 to first, m1 to second)
    res_reorder = client.put(
        f"/api/capsules/{capsule_id}/reorder",
        json={"memory_ids": [m2["id"], m1["id"]]},
        headers=headers,
    )
    assert res_reorder.status_code == 200

    # Verify detail reflects updated order
    cap_res = client.get(f"/api/capsules/{capsule_id}", headers=headers)
    memories = cap_res.json()["memories"]
    assert len(memories) == 2
    assert memories[0]["id"] == m2["id"]
    assert memories[1]["id"] == m1["id"]

    # 4. Edit Memory
    res_edit = client.put(
        f"/api/capsules/{capsule_id}/memories/{m1['id']}",
        json={"title": "Updated Vagator Sunset", "note": "Golden hour glow"},
        headers=headers,
    )
    assert res_edit.status_code == 200
    assert res_edit.json()["title"] == "Updated Vagator Sunset"

    # 5. Delete Memory
    res_del_m = client.delete(f"/api/capsules/{capsule_id}/memories/{m1['id']}", headers=headers)
    assert res_del_m.status_code == 200
    assert res_del_m.json()["id"] == m1["id"]

    # Verify memory is gone
    cap_after = client.get(f"/api/capsules/{capsule_id}", headers=headers)
    assert len(cap_after.json()["memories"]) == 1


# ─────────────────────────────────────────────────────────────────────────────
# 3. Media Upload & Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_media_upload_validation(client, test_users):
    """Test file type, file size, and extension validation on upload."""
    headers = test_users["alice"]["headers"]

    # Create capsule
    cap = client.post("/api/capsules/", json={"title": "Upload Tests"}, headers=headers).json()
    cap_id = cap["id"]

    # 1. Valid JPEG upload
    fake_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0" + b"X" * 1024)
    res_jpeg = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("photo.jpg", fake_jpeg, "image/jpeg")},
        headers=headers,
    )
    assert res_jpeg.status_code == 200
    data_jpeg = res_jpeg.json()
    assert data_jpeg["media_type"] == "image"
    assert "/api/capsules/media/" in data_jpeg["media_url"]

    # 2. Valid MP4 upload
    fake_mp4 = io.BytesIO(b"\x00\x00\x00\x20ftypisom" + b"Y" * 2048)
    res_mp4 = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("clip.mp4", fake_mp4, "video/mp4")},
        headers=headers,
    )
    assert res_mp4.status_code == 200
    assert res_mp4.json()["media_type"] == "video"

    # 3. Invalid extension (.exe)
    fake_exe = io.BytesIO(b"MZ" + b"X" * 100)
    res_exe = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("malware.exe", fake_exe, "application/octet-stream")},
        headers=headers,
    )
    assert res_exe.status_code == 400
    assert "Unsupported file format" in res_exe.json()["detail"]

    # 4. Zero-byte empty file
    empty_file = io.BytesIO(b"")
    res_empty = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("empty.jpg", empty_file, "image/jpeg")},
        headers=headers,
    )
    assert res_empty.status_code == 400
    assert "empty" in res_empty.json()["detail"].lower()

    # 5. Oversized image (>10MB)
    oversized_data = b"0" * (10 * 1024 * 1024 + 1024)
    oversized_file = io.BytesIO(oversized_data)
    res_oversized = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("huge.jpg", oversized_file, "image/jpeg")},
        headers=headers,
    )
    assert res_oversized.status_code == 400
    assert "exceeds" in res_oversized.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# 4. Authentication, Security & Ownership Enforcement
# ─────────────────────────────────────────────────────────────────────────────

def test_cross_user_isolation(client, test_users):
    """Ensure User B cannot view, edit, delete, or upload to User A's capsule."""
    alice_headers = test_users["alice"]["headers"]
    bob_headers = test_users["bob"]["headers"]

    # Alice creates a private capsule
    alice_cap = client.post(
        "/api/capsules/",
        json={"title": "Alice's Secret Journal", "destination": "Kyoto, Japan"},
        headers=alice_headers,
    ).json()
    cap_id = alice_cap["id"]

    # 1. Bob cannot see Alice's capsule in list
    bob_list = client.get("/api/capsules/", headers=bob_headers).json()
    assert all(c["id"] != cap_id for c in bob_list)

    # 2. Bob cannot GET Alice's capsule detail (403 Forbidden)
    res_bob_get = client.get(f"/api/capsules/{cap_id}", headers=bob_headers)
    assert res_bob_get.status_code == 403

    # 3. Bob cannot PUT Alice's capsule (403 Forbidden)
    res_bob_put = client.put(f"/api/capsules/{cap_id}", json={"title": "Hacked Title"}, headers=bob_headers)
    assert res_bob_put.status_code == 403

    # 4. Bob cannot POST a memory to Alice's capsule (403 Forbidden)
    res_bob_add_mem = client.post(
        f"/api/capsules/{cap_id}/memories",
        json={"title": "Intruder memory", "media_url": "https://example.com/pic.jpg"},
        headers=bob_headers,
    )
    assert res_bob_add_mem.status_code == 403

    # 5. Bob cannot upload media to Alice's capsule (403 Forbidden)
    fake_img = io.BytesIO(b"\xff\xd8\xff\xe0" + b"X" * 100)
    res_bob_upload = client.post(
        f"/api/capsules/{cap_id}/upload",
        files={"file": ("bob.jpg", fake_img, "image/jpeg")},
        headers=bob_headers,
    )
    assert res_bob_upload.status_code == 403

    # 6. Bob cannot DELETE Alice's capsule (403 Forbidden)
    res_bob_del = client.delete(f"/api/capsules/{cap_id}", headers=bob_headers)
    assert res_bob_del.status_code == 403


def test_private_media_streaming_security(client, test_users):
    """Test private media endpoint ownership and unauthenticated access prevention."""
    alice_headers = test_users["alice"]["headers"]
    bob_headers = test_users["bob"]["headers"]

    # Alice creates capsule and uploads a photo
    cap = client.post("/api/capsules/", json={"title": "Alice Photos"}, headers=alice_headers).json()
    fake_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0" + b"SECRET_IMAGE_BYTES")
    upload_res = client.post(
        f"/api/capsules/{cap['id']}/upload",
        files={"file": ("secret.jpg", fake_jpeg, "image/jpeg")},
        headers=alice_headers,
    ).json()

    media_url = upload_res["media_url"]
    filename = media_url.split("/")[-1]

    # 1. Unauthenticated request -> 401 Unauthorized
    res_unauth = client.get(f"/api/capsules/media/{filename}")
    assert res_unauth.status_code == 401

    # 2. Bob (other user) tries to fetch Alice's photo -> 403 Forbidden
    res_bob = client.get(f"/api/capsules/media/{filename}", headers=bob_headers)
    assert res_bob.status_code == 403
    assert "private media" in res_bob.json()["detail"].lower()

    # 3. Alice (owner) fetches her photo -> 200 OK
    res_alice = client.get(f"/api/capsules/media/{filename}", headers=alice_headers)
    assert res_alice.status_code == 200
    assert b"SECRET_IMAGE_BYTES" in res_alice.content
    assert res_alice.headers.get("cache-control") == "private, max-age=3600"


def test_path_traversal_prevention(client, test_users):
    """Attempting path traversal via media filename is safely blocked."""
    alice_headers = test_users["alice"]["headers"]

    # 1. Upward traversal
    res1 = client.get("/api/capsules/media/../../etc/passwd", headers=alice_headers)
    assert res1.status_code in (404, 400)

    # 2. Encoded slash traversal
    res2 = client.get("/api/capsules/media/..%2F..%2Fwindows%2Fwin.ini", headers=alice_headers)
    assert res2.status_code in (404, 400)


def test_safe_file_deletion_and_refcounting(client, test_users):
    """Ensure media files are deleted when no records reference them, but preserved if shared."""
    alice_headers = test_users["alice"]["headers"]

    # Alice creates capsule and uploads photo
    cap = client.post("/api/capsules/", json={"title": "Refcount Test"}, headers=alice_headers).json()
    fake_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0" + b"TEST_PAYLOAD")
    up = client.post(
        f"/api/capsules/{cap['id']}/upload",
        files={"file": ("sample.jpg", fake_jpeg, "image/jpeg")},
        headers=alice_headers,
    ).json()

    media_url = up["media_url"]
    filename = media_url.split("/")[-1]
    disk_path = os.path.join(UPLOAD_DIR, filename)

    # File exists on disk
    assert os.path.exists(disk_path)

    # Add 2 memories sharing the same uploaded media URL
    m1 = client.post(
        f"/api/capsules/{cap['id']}/memories",
        json={"title": "Shared 1", "media_url": media_url},
        headers=alice_headers,
    ).json()
    m2 = client.post(
        f"/api/capsules/{cap['id']}/memories",
        json={"title": "Shared 2", "media_url": media_url},
        headers=alice_headers,
    ).json()

    # Delete memory 1 -> File should STILL exist because memory 2 still references it!
    res_del_m1 = client.delete(f"/api/capsules/{cap['id']}/memories/{m1['id']}", headers=alice_headers)
    assert res_del_m1.status_code == 200
    assert os.path.exists(disk_path), "File should not be deleted while memory 2 still references it."

    # Delete memory 2 -> Now no records reference it, so file should be safely cleaned up from disk
    res_del_m2 = client.delete(f"/api/capsules/{cap['id']}/memories/{m2['id']}", headers=alice_headers)
    assert res_del_m2.status_code == 200
    assert not os.path.exists(disk_path), "File should be deleted once all references are gone."


def test_fresh_request_persistence(client, test_users):
    """Test that records persist accurately across fresh HTTP requests."""
    alice_headers = test_users["alice"]["headers"]

    # Create capsule with 2 memories
    cap_res = client.post(
        "/api/capsules/",
        json={"title": "Persistent Journey", "destination": "Kyoto", "start_date": "2026-09-01"},
        headers=alice_headers,
    )
    cap_id = cap_res.json()["id"]

    client.post(
        f"/api/capsules/{cap_id}/memories",
        json={"title": "Fushimi Inari", "media_url": "https://example.com/torii.jpg"},
        headers=alice_headers,
    )
    client.post(
        f"/api/capsules/{cap_id}/memories",
        json={"title": "Bamboo Grove", "media_url": "https://example.com/bamboo.jpg"},
        headers=alice_headers,
    )

    # Simulate fresh request from a brand new client session
    with TestClient(app, raise_server_exceptions=True) as fresh_client:
        get_res = fresh_client.get(f"/api/capsules/{cap_id}", headers=alice_headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["title"] == "Persistent Journey"
        assert len(data["memories"]) == 2
        titles = [m["title"] for m in data["memories"]]
        assert "Fushimi Inari" in titles
        assert "Bamboo Grove" in titles

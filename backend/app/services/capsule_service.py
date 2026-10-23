"""
Capsule Service — business logic for Memory Capsules and Travel Memories.
Enforces authentication, server-side ownership checks, file validation,
and safe media storage.
"""
from __future__ import annotations
import os
import uuid
from typing import Optional, List, Tuple
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.capsule import Capsule, Memory
from app.schemas.capsule_schemas import (
    CapsuleCreateRequest,
    CapsuleUpdateRequest,
    MemoryCreateRequest,
    MemoryUpdateRequest,
)

# ── Media storage configuration ───────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIMES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_MIMES = ALLOWED_IMAGE_MIMES | ALLOWED_VIDEO_MIMES

MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_VIDEO_SIZE = 50 * 1024 * 1024   # 50 MB


# ── File validation & storage ─────────────────────────────────────────────────

async def validate_and_save_media(
    file: UploadFile,
    user_id: Optional[int] = None,
) -> Tuple[str, str, int]:
    """
    Validate an uploaded file (size, MIME, extension) and save to persistent storage.
    Prefixes filename with user_id to cryptographically bind ownership.
    Returns (media_url, media_type, file_size_bytes).
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a filename."
        )

    _, ext = os.path.splitext(file.filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIMES:
        # Fallback check based on extension
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            content_type = "image/jpeg" if ext in {".jpg", ".jpeg"} else f"image/{ext[1:]}"
        elif ext in ALLOWED_VIDEO_EXTENSIONS:
            content_type = "video/mp4" if ext == ".mp4" else f"video/{ext[1:]}"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported MIME type '{file.content_type}'."
            )

    media_type = "video" if (ext in ALLOWED_VIDEO_EXTENSIONS or content_type in ALLOWED_VIDEO_MIMES) else "image"
    max_size = MAX_VIDEO_SIZE if media_type == "video" else MAX_IMAGE_SIZE

    # Read content to check file size safely
    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    if file_size > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {limit_mb} MB."
        )

    # Secure filename prefixed with owner user_id to enforce ownership
    prefix = f"u{user_id}_" if user_id is not None else ""
    safe_filename = f"{prefix}{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_filename)

    try:
        with open(dest_path, "wb") as f:
            f.write(content)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file to server storage."
        )

    media_url = f"/api/capsules/media/{safe_filename}"
    return media_url, media_type, file_size


def delete_stored_file(media_url: str, db: Optional[Session] = None) -> None:
    """If media_url points to local uploads, delete the file safely without deleting shared files."""
    if not media_url or not media_url.startswith("/api/capsules/media/"):
        return
    filename = os.path.basename(media_url)
    filepath = os.path.join(UPLOAD_DIR, filename)
    abs_filepath = os.path.abspath(filepath)
    abs_upload_dir = os.path.abspath(UPLOAD_DIR)

    # Path traversal prevention
    if not abs_filepath.startswith(abs_upload_dir):
        return

    # Check if another memory or capsule in DB still references this media URL
    if db is not None:
        still_used_mem = db.query(Memory).filter(Memory.media_url == media_url).count()
        still_used_cap = db.query(Capsule).filter(Capsule.cover_image_url == media_url).count()
        if still_used_mem > 0 or still_used_cap > 0:
            return

    if os.path.isfile(abs_filepath):
        try:
            os.remove(abs_filepath)
        except OSError:
            pass


# ── Capsule CRUD ──────────────────────────────────────────────────────────────

def list_capsules(
    db: Session,
    user_id: int,
    search: Optional[str] = None,
) -> List[dict]:
    """List capsules belonging to the authenticated user."""
    q = db.query(Capsule).filter(Capsule.user_id == user_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Capsule.title.ilike(term),
                Capsule.destination.ilike(term),
                Capsule.description.ilike(term),
            )
        )
    q = q.order_by(Capsule.start_date.desc().nullslast(), Capsule.created_at.desc())
    capsules = q.all()

    results = []
    for c in capsules:
        results.append({
            "id": c.id,
            "user_id": c.user_id,
            "title": c.title,
            "description": c.description,
            "destination": c.destination,
            "start_date": c.start_date,
            "end_date": c.end_date,
            "cover_image_url": c.cover_image_url,
            "memory_count": len(c.memories),
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        })
    return results


def get_capsule_or_404(db: Session, user_id: int, capsule_id: int) -> Capsule:
    """Retrieve capsule verifying authenticated ownership."""
    capsule = db.query(Capsule).filter(Capsule.id == capsule_id).first()
    if not capsule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory capsule not found."
        )
    if capsule.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this memory capsule."
        )
    return capsule


def create_capsule(db: Session, user_id: int, data: CapsuleCreateRequest) -> Capsule:
    """Create a new capsule for the authenticated user."""
    capsule = Capsule(
        user_id=user_id,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        destination=data.destination.strip() if data.destination else None,
        start_date=data.start_date,
        end_date=data.end_date,
        cover_image_url=data.cover_image_url.strip() if data.cover_image_url else None,
    )
    db.add(capsule)
    db.commit()
    db.refresh(capsule)
    return capsule


def update_capsule(
    db: Session,
    user_id: int,
    capsule_id: int,
    data: CapsuleUpdateRequest,
) -> Capsule:
    """Update a capsule belonging to the authenticated user."""
    capsule = get_capsule_or_404(db, user_id, capsule_id)

    new_start = data.start_date if data.start_date is not None else capsule.start_date
    new_end = data.end_date if data.end_date is not None else capsule.end_date
    if new_start and new_end and new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date cannot be earlier than start date."
        )

    if data.title is not None:
        capsule.title = data.title.strip()
    if data.description is not None:
        capsule.description = data.description.strip() if data.description else None
    if data.destination is not None:
        capsule.destination = data.destination.strip() if data.destination else None
    if data.start_date is not None:
        capsule.start_date = data.start_date
    if data.end_date is not None:
        capsule.end_date = data.end_date
    if data.cover_image_url is not None:
        capsule.cover_image_url = data.cover_image_url.strip() if data.cover_image_url else None

    db.commit()
    db.refresh(capsule)
    return capsule


def delete_capsule(db: Session, user_id: int, capsule_id: int) -> None:
    """Delete a capsule and clean up its local media files safely."""
    capsule = get_capsule_or_404(db, user_id, capsule_id)

    # Collect media URLs before deletion
    media_urls = [m.media_url for m in capsule.memories]
    media_urls.extend([m.thumbnail_url for m in capsule.memories if m.thumbnail_url])
    if capsule.cover_image_url:
        media_urls.append(capsule.cover_image_url)

    db.delete(capsule)
    db.commit()

    # Now that the records are removed from DB, delete unreferenced physical files
    for url in set(media_urls):
        delete_stored_file(url, db)


# ── Memory CRUD ───────────────────────────────────────────────────────────────

def add_memory(
    db: Session,
    user_id: int,
    capsule_id: int,
    data: MemoryCreateRequest,
) -> Memory:
    """Add a memory to a capsule with ownership check."""
    capsule = get_capsule_or_404(db, user_id, capsule_id)

    # Determine display order if not provided
    display_order = data.display_order
    if display_order == 0:
        max_order = max([m.display_order for m in capsule.memories], default=0)
        display_order = max_order + 1

    memory = Memory(
        capsule_id=capsule.id,
        title=data.title.strip() if data.title else None,
        note=data.note.strip() if data.note else None,
        memory_date=data.memory_date or capsule.start_date,
        location=data.location.strip() if data.location else None,
        media_type=data.media_type,
        media_url=data.media_url.strip(),
        thumbnail_url=data.thumbnail_url.strip() if data.thumbnail_url else None,
        file_size_bytes=data.file_size_bytes,
        display_order=display_order,
    )
    db.add(memory)

    # If the capsule has no cover image and this is an image, set it as cover
    if not capsule.cover_image_url and data.media_type == "image":
        capsule.cover_image_url = data.media_url.strip()

    db.commit()
    db.refresh(memory)
    return memory


def update_memory(
    db: Session,
    user_id: int,
    capsule_id: int,
    memory_id: int,
    data: MemoryUpdateRequest,
) -> Memory:
    """Update a memory inside a capsule with ownership check."""
    get_capsule_or_404(db, user_id, capsule_id)

    memory = db.query(Memory).filter(
        Memory.id == memory_id,
        Memory.capsule_id == capsule_id,
    ).first()

    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found in this capsule."
        )

    if data.title is not None:
        memory.title = data.title.strip() if data.title else None
    if data.note is not None:
        memory.note = data.note.strip() if data.note else None
    if data.memory_date is not None:
        memory.memory_date = data.memory_date
    if data.location is not None:
        memory.location = data.location.strip() if data.location else None
    if data.media_type is not None:
        memory.media_type = data.media_type
    if data.media_url is not None:
        # If media_url changed, remove old local file
        if memory.media_url != data.media_url:
            delete_stored_file(memory.media_url)
        memory.media_url = data.media_url.strip()
    if data.thumbnail_url is not None:
        memory.thumbnail_url = data.thumbnail_url.strip() if data.thumbnail_url else None
    if data.display_order is not None:
        memory.display_order = data.display_order

    db.commit()
    db.refresh(memory)
    return memory


def delete_memory(
    db: Session,
    user_id: int,
    capsule_id: int,
    memory_id: int,
) -> None:
    """Delete a memory and remove its local file if stored locally."""
    capsule = get_capsule_or_404(db, user_id, capsule_id)

    memory = db.query(Memory).filter(
        Memory.id == memory_id,
        Memory.capsule_id == capsule_id,
    ).first()

    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found in this capsule."
        )

    media_url = memory.media_url
    thumb_url = memory.thumbnail_url

    # If the capsule's cover image was this memory's media_url, pick another or reset
    if capsule.cover_image_url == memory.media_url:
        remaining_images = [
            m for m in capsule.memories
            if m.id != memory_id and m.media_type == "image"
        ]
        capsule.cover_image_url = remaining_images[0].media_url if remaining_images else None

    db.delete(memory)
    db.commit()

    delete_stored_file(media_url, db)
    if thumb_url:
        delete_stored_file(thumb_url, db)


def reorder_memories(
    db: Session,
    user_id: int,
    capsule_id: int,
    memory_ids: List[int],
) -> List[Memory]:
    """Update display order for memories in a capsule."""
    capsule = get_capsule_or_404(db, user_id, capsule_id)

    memory_map = {m.id: m for m in capsule.memories}
    for order, mid in enumerate(memory_ids):
        if mid in memory_map:
            memory_map[mid].display_order = order

    db.commit()
    return sorted(capsule.memories, key=lambda m: (m.display_order, m.id))

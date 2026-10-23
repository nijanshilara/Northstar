"""
Capsules API router — /api/capsules/*
Memory Capsules and Travel Memories endpoints.
All CRUD endpoints require authentication and enforce user ownership.
"""
from __future__ import annotations
import os
import mimetypes
from typing import Optional, List

from fastapi import (
    APIRouter, Depends, HTTPException, Query, UploadFile, File, status
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.models.capsule import Capsule, Memory
from app.api.auth import get_current_user
from app.services import capsule_service
from app.schemas.capsule_schemas import (
    CapsuleCreateRequest,
    CapsuleUpdateRequest,
    CapsuleSummaryOut,
    CapsuleDetailOut,
    MemoryCreateRequest,
    MemoryUpdateRequest,
    MemoryOut,
    ReorderMemoriesRequest,
)

router = APIRouter()


# ── Private media serving ─────────────────────────────────────────────────────

@router.get("/media/{filename}", response_class=FileResponse)
def get_capsule_media(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Safely stream an uploaded media file with authenticated ownership verification.
    Prevents directory traversal and strictly forbids cross-user access to private media.
    """
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(capsule_service.UPLOAD_DIR, safe_filename)

    # 1. Path traversal & file existence defense
    abs_filepath = os.path.abspath(filepath)
    abs_upload_dir = os.path.abspath(capsule_service.UPLOAD_DIR)
    if not abs_filepath.startswith(abs_upload_dir) or not os.path.isfile(abs_filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found."
        )

    # 2. Ownership verification:
    if safe_filename.startswith("u") and "_" in safe_filename:
        try:
            owner_part = safe_filename.split("_")[0][1:]
            owner_id = int(owner_part)
            if owner_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have access to this private media."
                )
        except ValueError:
            pass
    else:
        # Fallback for un-prefixed/legacy files: query DB association
        mem = db.query(Memory).join(Capsule).filter(
            Memory.media_url.like(f"%{safe_filename}"),
        ).first()
        if mem and mem.capsule.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this private media."
            )
        cap = db.query(Capsule).filter(
            Capsule.cover_image_url.like(f"%{safe_filename}")
        ).first()
        if cap and cap.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this private media."
            )

    mime_type, _ = mimetypes.guess_type(filepath)
    return FileResponse(
        filepath,
        media_type=mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ── Capsule CRUD ──────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CapsuleSummaryOut])
def list_capsules(
    search: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List memory capsules for the authenticated user."""
    return capsule_service.list_capsules(db, current_user.id, search=search)


@router.post("/", response_model=CapsuleDetailOut, status_code=status.HTTP_201_CREATED)
def create_capsule(
    data: CapsuleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new memory capsule for the authenticated user."""
    capsule = capsule_service.create_capsule(db, current_user.id, data)
    return {
        "id": capsule.id,
        "user_id": capsule.user_id,
        "title": capsule.title,
        "description": capsule.description,
        "destination": capsule.destination,
        "start_date": capsule.start_date,
        "end_date": capsule.end_date,
        "cover_image_url": capsule.cover_image_url,
        "memory_count": 0,
        "memories": [],
        "created_at": capsule.created_at,
        "updated_at": capsule.updated_at,
    }


@router.get("/{capsule_id}", response_model=CapsuleDetailOut)
def get_capsule(
    capsule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get capsule details and all memories inside it."""
    capsule = capsule_service.get_capsule_or_404(db, current_user.id, capsule_id)
    return {
        "id": capsule.id,
        "user_id": capsule.user_id,
        "title": capsule.title,
        "description": capsule.description,
        "destination": capsule.destination,
        "start_date": capsule.start_date,
        "end_date": capsule.end_date,
        "cover_image_url": capsule.cover_image_url,
        "memory_count": len(capsule.memories),
        "memories": sorted(capsule.memories, key=lambda m: (m.display_order, m.id)),
        "created_at": capsule.created_at,
        "updated_at": capsule.updated_at,
    }


@router.put("/{capsule_id}", response_model=CapsuleDetailOut)
def update_capsule(
    capsule_id: int,
    data: CapsuleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update capsule details."""
    capsule = capsule_service.update_capsule(db, current_user.id, capsule_id, data)
    return {
        "id": capsule.id,
        "user_id": capsule.user_id,
        "title": capsule.title,
        "description": capsule.description,
        "destination": capsule.destination,
        "start_date": capsule.start_date,
        "end_date": capsule.end_date,
        "cover_image_url": capsule.cover_image_url,
        "memory_count": len(capsule.memories),
        "memories": sorted(capsule.memories, key=lambda m: (m.display_order, m.id)),
        "created_at": capsule.created_at,
        "updated_at": capsule.updated_at,
    }


@router.delete("/{capsule_id}", response_model=dict)
def delete_capsule(
    capsule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a memory capsule and clean up its associated media."""
    capsule_service.delete_capsule(db, current_user.id, capsule_id)
    return {"message": "Memory capsule deleted successfully.", "id": capsule_id}


# ── Media Upload & Memory Operations ──────────────────────────────────────────

@router.post("/{capsule_id}/upload", response_model=dict)
async def upload_capsule_media(
    capsule_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload an image or video file for this capsule.
    Validates ownership, format, and size. Saves to persistent storage.
    """
    # Verify ownership before accepting the file
    capsule_service.get_capsule_or_404(db, current_user.id, capsule_id)

    media_url, media_type, file_size = await capsule_service.validate_and_save_media(
        file, user_id=current_user.id
    )
    return {
        "media_url": media_url,
        "media_type": media_type,
        "file_size_bytes": file_size,
    }


@router.post("/{capsule_id}/memories", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
def add_memory(
    capsule_id: int,
    data: MemoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a new memory to the capsule."""
    return capsule_service.add_memory(db, current_user.id, capsule_id, data)


@router.put("/{capsule_id}/memories/{memory_id}", response_model=MemoryOut)
def update_memory(
    capsule_id: int,
    memory_id: int,
    data: MemoryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a memory's caption, note, date, location, or ordering."""
    return capsule_service.update_memory(db, current_user.id, capsule_id, memory_id, data)


@router.delete("/{capsule_id}/memories/{memory_id}", response_model=dict)
def delete_memory(
    capsule_id: int,
    memory_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a memory and remove any stored local file."""
    capsule_service.delete_memory(db, current_user.id, capsule_id, memory_id)
    return {"message": "Memory deleted successfully.", "id": memory_id}


@router.put("/{capsule_id}/reorder", response_model=List[MemoryOut])
def reorder_memories(
    capsule_id: int,
    data: ReorderMemoriesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reorder memories within a capsule."""
    return capsule_service.reorder_memories(db, current_user.id, capsule_id, data.memory_ids)

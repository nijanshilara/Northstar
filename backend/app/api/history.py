"""
History API router — /api/history/*

All endpoints require authentication. Ownership is enforced server-side.

GET    /         — list history (filterable)
POST   /         — add a history entry
PATCH  /{id}/save  — toggle saved flag
DELETE /{id}     — delete one entry
DELETE /         — clear all history (requires confirmation=true query param)
"""

from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.auth_schemas import AddHistoryRequest, HistoryItemOut
from app.services import auth_service
from app.api.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=list[HistoryItemOut])
def list_history(
    event_type: Optional[str] = Query(default=None),
    saved_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's history, newest first."""
    return auth_service.get_history(db, current_user, event_type, saved_only, limit, offset)


@router.post("/", response_model=HistoryItemOut, status_code=status.HTTP_201_CREATED)
def add_history(
    data: AddHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a new history event."""
    return auth_service.add_history(
        db, current_user,
        event_type=data.event_type,
        label=data.label,
        payload=data.payload,
        is_saved=data.is_saved,
        trip_id=data.trip_id,
    )


@router.patch("/{item_id}/save", response_model=HistoryItemOut)
def toggle_save(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle the is_saved flag on a history entry."""
    from app.models.user import SearchHistory
    item = db.query(SearchHistory).filter(
        SearchHistory.id == item_id,
        SearchHistory.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="History item not found.")
    item.is_saved = not item.is_saved
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a single history entry (ownership enforced)."""
    auth_service.delete_history_item(db, current_user, item_id)


@router.delete("/", status_code=status.HTTP_200_OK)
def clear_history(
    confirm: bool = Query(default=False, description="Must be true to confirm bulk delete"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all history for the current user."""
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add ?confirm=true to confirm clearing all history.",
        )
    count = auth_service.clear_history(db, current_user)
    return {"message": f"Cleared {count} history item(s)."}

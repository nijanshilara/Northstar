"""Activities CRUD router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database.session import get_db
from app.models.base import Activity
from app.schemas.schemas import ActivityCreate, ActivityOut

router = APIRouter()


@router.get("/trip/{trip_id}", response_model=List[ActivityOut])
def list_activities(trip_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )


@router.post("/", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
def create_activity(payload: ActivityCreate, db: Session = Depends(get_db)):
    activity = Activity(**payload.model_dump())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.get("/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    return a


@router.patch("/{activity_id}/lock")
def toggle_lock(activity_id: int, db: Session = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    a.is_locked = not a.is_locked
    db.commit()
    return {"id": a.id, "is_locked": a.is_locked}


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(a)
    db.commit()

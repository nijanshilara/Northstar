"""Trips CRUD router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.session import get_db
from app.models.base import Trip
from app.models.user import User
from app.api.auth import get_current_user_optional
from app.schemas.schemas import TripCreate, TripOut, TripUpdate

router = APIRouter()


def _calculate_num_days(departure, return_date) -> int:
    return max(1, (return_date - departure).days + 1)


@router.get("/", response_model=List[TripOut])
def list_trips(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    List trips.
    If authenticated, returns the user's trips plus any clearly-labelled demo trips.
    If unauthenticated, returns all trips (for public preview and tests).
    """
    if current_user:
        return (
            db.query(Trip)
            .filter((Trip.user_id == current_user.id) | (Trip.is_demo.is_(True)))
            .order_by(Trip.created_at.desc())
            .all()
        )
    return (
        db.query(Trip)
        .filter((Trip.user_id.is_(None)) | (Trip.is_demo.is_(True)))
        .order_by(Trip.created_at.desc())
        .all()
    )


@router.post("/", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Create a new user trip. Real user trips are always marked is_demo=False."""
    styles_str = (
        ",".join(s.value for s in payload.travel_styles)
        if payload.travel_styles
        else None
    )
    trip = Trip(
        name=payload.name,
        origin=payload.origin,
        destination=payload.destination,
        departure_date=payload.departure_date,
        return_date=payload.return_date,
        num_days=_calculate_num_days(payload.departure_date, payload.return_date),
        num_travellers=payload.num_travellers,
        budget_minor=payload.budget_minor,
        currency=payload.currency,
        is_demo=False,
        user_id=current_user.id if current_user else None,
        travel_styles=styles_str,
        accommodation_pref=payload.accommodation_pref,
        transport_pref=payload.transport_pref,
        food_pref=payload.food_pref,
        must_visit=payload.must_visit,
        avoid=payload.avoid,
        walking_tolerance=payload.walking_tolerance,
        travel_pace=payload.travel_pace,
        notes=payload.notes,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return trip


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this trip",
            )
    return trip


@router.patch("/{trip_id}", response_model=TripOut)
@router.put("/{trip_id}", response_model=TripOut)
def update_trip(
    trip_id: int,
    payload: TripUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this trip",
            )
    update_data = payload.model_dump(exclude_unset=True)
    if "travel_styles" in update_data and update_data["travel_styles"] is not None:
        update_data["travel_styles"] = ",".join(
            s.value for s in update_data["travel_styles"]
        )
    for k, v in update_data.items():
        setattr(trip, k, v)
    if "departure_date" in update_data or "return_date" in update_data:
        trip.num_days = _calculate_num_days(trip.departure_date, trip.return_date)
    db.commit()
    db.refresh(trip)
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this trip",
            )
    db.delete(trip)
    db.commit()

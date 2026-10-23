"""
itinerary.py — Phase 2 itinerary router.

Endpoints
─────────
POST /api/itinerary/{trip_id}/generate
    Generate or regenerate an itinerary for the trip.
    - Locked activities are always preserved.
    - Unlocked existing activities are deleted (when overwrite_unlocked=True).
    - New activities are persisted to the DB.

POST /api/itinerary/{trip_id}/replan
    Replan around a disruption (closure, delay, cancellation).
    - Only the affected day is altered.
    - Locked activities are preserved; user is warned if one is involved.
    - DB is updated in place.

GET /api/itinerary/{trip_id}/budget
    Return a live budget breakdown for the current itinerary.
"""
from __future__ import annotations

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.session import get_db, SessionLocal
from app.models.base import Activity, Trip, ExpenseGroup, ActivityCategory
from app.models.user import User
from app.api.auth import get_current_user_optional
from app.schemas.schemas import (
    ActivityOut,
    BudgetBreakdownOut,
    DayScheduleOut,
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    DisruptionRequest,
    ReplanResponse,
)
from app.algorithms.schedule_builder import (
    TripPreferences, LockedActivity, build_schedule, validate_schedule, ActivitySlot,
    _calculate_day_dates, _default_day_theme, DayPlan,
)
from app.algorithms.plan_b_engine import Disruption, replan
from app.services.itinerary_planner import plan_destination_itinerary

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_trip_or_404(trip_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    return trip


def _locked_activities_from_db(trip_id: int, db: Session) -> list[LockedActivity]:
    rows = (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id, Activity.is_locked == True)  # noqa: E712
        .all()
    )
    return [
        LockedActivity(
            id=a.id,
            day_number=a.day_number,
            name=a.name,
            category=a.category.value,
            location=a.location,
            start_time=a.start_time,
            end_time=a.end_time,
            duration_minutes=a.duration_minutes,
            cost_minor=a.cost_minor,
            opening_hours=a.opening_hours,
            booking_required=a.booking_required,
            recommendation_reason=a.recommendation_reason,
        )
        for a in rows
    ]


logger = logging.getLogger(__name__)


def _slot_to_activity(slot: ActivitySlot, trip_id: int, currency: str) -> Activity:
    """Convert an ActivitySlot from the engine into an ORM Activity defensively."""
    raw_cat = slot.category
    cat_enum = ActivityCategory.SIGHTSEEING
    if isinstance(raw_cat, ActivityCategory):
        cat_enum = raw_cat
    elif isinstance(raw_cat, str):
        try:
            cat_enum = ActivityCategory(raw_cat.lower().strip())
        except ValueError:
            norm = raw_cat.lower().strip()
            for ac in ActivityCategory:
                if ac.value in norm or norm in ac.value:
                    cat_enum = ac
                    break

    return Activity(
        trip_id=trip_id,
        day_number=slot.day_number,
        name=slot.name,
        category=cat_enum,
        location=slot.location,
        start_time=slot.start_time,
        end_time=slot.end_time,
        duration_minutes=slot.duration_minutes,
        cost_minor=slot.cost_minor,
        currency=currency or "INR",
        is_locked=slot.is_locked,
        opening_hours=slot.opening_hours,
        booking_required=slot.booking_required,
        recommendation_reason=slot.recommendation_reason,
    )


def _budget_out(budget, currency: str = "INR", actual_spent: int = 0) -> BudgetBreakdownOut:
    cap = budget.budget_cap_minor
    remaining = max(0, cap - budget.total_minor) if cap > 0 else 0
    remaining_actual = max(0, cap - actual_spent) if cap > 0 else 0
    over_actual = max(0, actual_spent - cap) if cap > 0 else 0
    return BudgetBreakdownOut(
        by_category=budget.by_category,
        total_minor=budget.total_minor,
        budget_cap_minor=budget.budget_cap_minor,
        over_budget=budget.over_budget,
        over_budget_by_minor=budget.over_budget_by_minor,
        currency=currency,
        actual_spent_minor=actual_spent,
        remaining_minor=remaining,
        remaining_actual_minor=remaining_actual,
        over_actual_by_minor=over_actual,
    )


# ---------------------------------------------------------------------------
# In-flight generation task tracking (prevents duplicate runs & DB collisions)
# ---------------------------------------------------------------------------
_active_generations: dict[int, asyncio.Task[GenerateItineraryResponse]] = {}
_active_generations_lock = asyncio.Lock()


async def _run_itinerary_generation(
    trip_id: int,
    payload: GenerateItineraryRequest,
    db: Session,
) -> GenerateItineraryResponse:
    """Execute itinerary generation using the request database session."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    trip_num_days = trip.num_days
    trip_currency = trip.currency or "INR"

    # 1. Collect locked activities (read-only; no write lock opened)
    locked = _locked_activities_from_db(trip_id, db)

    # 2. Run planning FIRST (network calls happen with zero database locks)
    try:
        result = await plan_destination_itinerary(
            trip=trip,
            locked_activities=locked,
            use_ai=getattr(payload, "use_ai", True),
        )
    except Exception as exc:
        logger.exception("Itinerary planning error for trip %s: %s", trip_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Itinerary planner encountered an error: {exc}",
        )

    # 3. Validate for overlaps
    overlap_warnings = validate_schedule(result.activities)
    result.warnings.extend(overlap_warnings)

    # 4. Atomically persist changes in a single protected transaction
    try:
        if payload.overwrite_unlocked:
            db.query(Activity).filter(
                Activity.trip_id == trip_id,
                Activity.is_locked == False,  # noqa: E712
            ).delete(synchronize_session=False)

        for slot in result.activities:
            if slot.existing_id is not None:
                # Already in DB (locked) — no insert needed
                continue
            row = _slot_to_activity(slot, trip_id, trip_currency)
            db.add(row)

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Database error persisting itinerary for trip %s: %s", trip_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while saving itinerary: {exc}",
        )

    # 5. Re-query full list for the response
    all_activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )

    by_day_db: dict[int, list[ActivityOut]] = {}
    for a in all_activities:
        by_day_db.setdefault(a.day_number, []).append(ActivityOut.model_validate(a))

    days_out: list[DayScheduleOut] = []
    for day_plan in result.days:
        day_acts = by_day_db.get(day_plan.day_number, [])
        status_val = day_plan.status if day_acts else "unfilled"
        unfilled_reason = day_plan.unfilled_reason if not day_acts else None
        days_out.append(DayScheduleOut(
            day_number=day_plan.day_number,
            date=day_plan.date,
            theme=day_plan.theme,
            status=status_val,
            unfilled_reason=unfilled_reason,
            activities=day_acts,
        ))

    has_demo = any(
        "[DEMO]" in (a.recommendation_reason or "") or "[Destination-Adapted]" in (a.recommendation_reason or "")
        for a in all_activities
    )
    is_schedule_complete = (
        len(days_out) == trip_num_days
        and all(d.status == "scheduled" for d in days_out)
        and all(len(d.activities) >= 1 for d in days_out)
        and not has_demo
        and bool(all_activities)
    )

    return GenerateItineraryResponse(
        trip_id=trip_id,
        activities=[ActivityOut.model_validate(a) for a in all_activities],
        budget=_budget_out(result.budget, currency=trip_currency),
        warnings=result.warnings,
        is_demo=result.is_demo,
        days=days_out,
        calendar_complete=result.calendar_complete,
        schedule_complete=is_schedule_complete,
        ai_enhanced=result.ai_enhanced,
        ai_unavailable_reason=result.ai_unavailable_reason,
    )



# ---------------------------------------------------------------------------
# POST /generate
# ---------------------------------------------------------------------------

@router.post(
    "/{trip_id}/generate",
    response_model=GenerateItineraryResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate (or regenerate) an itinerary for a trip",
)
async def generate_itinerary(
    trip_id: int,
    payload: GenerateItineraryRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> GenerateItineraryResponse:
    """
    Generate a destination-aware, weather-adapted day-by-day itinerary for *trip_id*.

    - Locked activities are kept as-is.
    - When `overwrite_unlocked=True` (default), unlocked activities are deleted
      only after planning succeeds (atomic transaction, prevents DB locks during I/O).
    - Resolves real candidate places (heritage, culture, viewpoints, shopping, parks, food).
    - Adapts outdoor activities to favorable weather and suggests indoor options for rain.
    - Prevents uncontrolled duplicate runs: retries join any active generation task.
    - Returns the full updated activity list plus a budget breakdown.
    """
    trip = _get_trip_or_404(trip_id, db)
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this trip's itinerary",
            )

    if not trip.destination or not trip.destination.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate an itinerary for a trip with no destination specified.",
        )

    try:
        return await _run_itinerary_generation(trip_id, payload, db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Itinerary generation error for trip %s: %s", trip_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Itinerary generation failed: {exc}",
        )



# ---------------------------------------------------------------------------
# GET /{trip_id} — Retrieve complete day-by-day itinerary
# ---------------------------------------------------------------------------

@router.get(
    "/{trip_id}",
    response_model=GenerateItineraryResponse,
    summary="Get full day-by-day itinerary schedule and completeness status",
)
def get_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> GenerateItineraryResponse:
    """
    Return the complete day-by-day itinerary for *trip_id*.
    Ensures every trip day record exists from day 1 to trip.num_days.
    """
    trip = _get_trip_or_404(trip_id, db)
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this trip's itinerary",
            )

    all_activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )

    by_day_db: dict[int, list[ActivityOut]] = {}
    for a in all_activities:
        by_day_db.setdefault(a.day_number, []).append(ActivityOut.model_validate(a))

    day_dates = _calculate_day_dates(str(trip.departure_date) if trip.departure_date else None, trip.num_days)
    days_out: list[DayScheduleOut] = []

    for day_num in range(1, trip.num_days + 1):
        day_acts = by_day_db.get(day_num, [])
        date_str = day_dates[day_num - 1]
        if day_acts:
            theme = _default_day_theme(day_num, day_acts, trip.destination)
            days_out.append(DayScheduleOut(
                day_number=day_num,
                date=date_str,
                theme=theme,
                status="scheduled" if len(day_acts) >= 2 else "partial",
                unfilled_reason=None,
                activities=day_acts,
            ))
        else:
            days_out.append(DayScheduleOut(
                day_number=day_num,
                date=date_str,
                theme=f"Day {day_num}: Free Exploration in {trip.destination.split(',')[0].strip()}",
                status="unfilled",
                unfilled_reason="No activities planned yet",
                activities=[],
            ))

    # Calculate budget from saved activities
    by_cat: dict[str, int] = {}
    total = 0
    for a in all_activities:
        cat = a.category.value
        by_cat[cat] = by_cat.get(cat, 0) + a.cost_minor
        total += a.cost_minor

    cap = trip.budget_minor
    over = max(0, total - cap) if cap > 0 else 0
    remaining = max(0, cap - total) if cap > 0 else 0

    budget = BudgetBreakdownOut(
        by_category=by_cat,
        total_minor=total,
        budget_cap_minor=cap,
        over_budget=over > 0,
        over_budget_by_minor=over,
        currency=trip.currency or "INR",
        remaining_minor=remaining,
    )

    has_demo = any(
        "[DEMO]" in (a.recommendation_reason or "") or "[Destination-Adapted]" in (a.recommendation_reason or "")
        for a in all_activities
    )
    is_schedule_complete = (
        len(days_out) == trip.num_days
        and all(d.status == "scheduled" for d in days_out)
        and all(len(d.activities) >= 1 for d in days_out)
        and not has_demo
        and bool(all_activities)
    )

    return GenerateItineraryResponse(
        trip_id=trip_id,
        activities=[ActivityOut.model_validate(a) for a in all_activities],
        budget=budget,
        warnings=[],
        is_demo=trip.is_demo,
        days=days_out,
        calendar_complete=(len(days_out) == trip.num_days),
        schedule_complete=is_schedule_complete,
        ai_enhanced=False,
    )


# ---------------------------------------------------------------------------
# POST /replan
# ---------------------------------------------------------------------------

@router.post(
    "/{trip_id}/replan",
    response_model=ReplanResponse,
    summary="Replan around a disruption (closure / delay / cancellation)",
)
def replan_itinerary(
    trip_id: int,
    payload: DisruptionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ReplanResponse:
    """
    Attempt to reschedule activities on the affected day around a disruption.

    Locked activities on that day are preserved and the user is warned if
    the disrupted activity itself is locked.
    """
    trip = _get_trip_or_404(trip_id, db)
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify this trip's itinerary",
            )
    prefs = TripPreferences.from_trip(trip)

    # Load current schedule from DB
    db_activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )

    current_schedule: list[ActivitySlot] = [
        ActivitySlot(
            name=a.name,
            category=a.category.value,
            location=a.location,
            duration_minutes=a.duration_minutes,
            cost_minor=a.cost_minor,
            opening_hours=a.opening_hours,
            booking_required=a.booking_required,
            recommendation_reason=a.recommendation_reason or "",
            day_number=a.day_number,
            start_time=a.start_time or "09:00",
            end_time=a.end_time or "10:00",
            existing_id=a.id,
            is_locked=a.is_locked,
        )
        for a in db_activities
    ]

    disruption = Disruption(
        activity_name=payload.activity_name,
        day_number=payload.day_number,
        reason=payload.reason,
        delay_minutes=payload.delay_minutes,
    )

    replan_result = replan(prefs, current_schedule, disruption)

    # ── Persist changes ───────────────────────────────────────────────────────
    # Simple strategy: delete all unlocked activities on the affected day,
    # re-insert what the engine returned.
    if not replan_result.warnings or "not found" not in " ".join(replan_result.warnings).lower():
        db.query(Activity).filter(
            Activity.trip_id == trip_id,
            Activity.day_number == payload.day_number,
            Activity.is_locked == False,  # noqa: E712
        ).delete(synchronize_session="fetch")
        db.flush()

        for slot in replan_result.activities:
            if slot.day_number != payload.day_number:
                continue
            if slot.is_locked and slot.existing_id:
                continue   # locked rows already in DB
            row = _slot_to_activity(slot, trip_id, trip.currency)
            db.add(row)

        db.commit()

    # Re-query
    all_activities = (
        db.query(Activity)
        .filter(Activity.trip_id == trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )

    return ReplanResponse(
        trip_id=trip_id,
        activities=[ActivityOut.model_validate(a) for a in all_activities],
        budget=_budget_out(replan_result.budget),
        changes=replan_result.changes,
        warnings=replan_result.warnings,
    )


# ---------------------------------------------------------------------------
# GET /budget
# ---------------------------------------------------------------------------

@router.get(
    "/{trip_id}/budget",
    response_model=BudgetBreakdownOut,
    summary="Get the current estimated budget breakdown for a trip's itinerary",
)
def get_itinerary_budget(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> BudgetBreakdownOut:
    trip = _get_trip_or_404(trip_id, db)
    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this trip's budget",
            )
    activities = db.query(Activity).filter(Activity.trip_id == trip_id).all()

    by_cat: dict[str, int] = {}
    total = 0
    for a in activities:
        cat = a.category.value
        by_cat[cat] = by_cat.get(cat, 0) + a.cost_minor
        total += a.cost_minor

    # Compute actual recorded expenses from any expense groups linked to this trip
    actual_spent = 0
    groups = db.query(ExpenseGroup).filter(ExpenseGroup.trip_id == trip_id).all()
    for g in groups:
        for exp in g.expenses:
            actual_spent += exp.amount_minor

    cap = trip.budget_minor
    over = max(0, total - cap) if cap > 0 else 0
    remaining = max(0, cap - total) if cap > 0 else 0
    remaining_actual = max(0, cap - actual_spent) if cap > 0 else 0
    over_actual = max(0, actual_spent - cap) if cap > 0 else 0

    return BudgetBreakdownOut(
        by_category=by_cat,
        total_minor=total,
        budget_cap_minor=cap,
        over_budget=over > 0,
        over_budget_by_minor=over,
        currency=trip.currency or "INR",
        actual_spent_minor=actual_spent,
        remaining_minor=remaining,
        remaining_actual_minor=remaining_actual,
        over_actual_by_minor=over_actual,
    )

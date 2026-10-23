"""Pydantic schemas for request/response validation."""

from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.models.base import TravelStyle, TripStatus, ActivityCategory, SplitMethod


# ---------------------------------------------------------------------------
# Trip schemas
# ---------------------------------------------------------------------------

class TripCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    origin: str = Field(..., min_length=1, max_length=200)
    destination: str = Field(..., min_length=1, max_length=200)
    departure_date: date
    return_date: date
    num_travellers: int = Field(default=1, ge=1, le=50)
    budget_minor: int = Field(default=0, ge=0, description="Budget in minor currency units (e.g. paise)")
    currency: str = Field(default="INR", min_length=3, max_length=3)
    travel_styles: Optional[List[TravelStyle]] = None
    accommodation_pref: Optional[str] = None
    transport_pref: Optional[str] = None
    food_pref: Optional[str] = None
    must_visit: Optional[str] = None
    avoid: Optional[str] = None
    walking_tolerance: int = Field(default=5, ge=1, le=10)
    travel_pace: int = Field(default=5, ge=1, le=10)
    notes: Optional[str] = None

    @field_validator("return_date")
    @classmethod
    def return_after_departure(cls, v: date, info) -> date:
        departure = info.data.get("departure_date")
        if departure and v < departure:
            raise ValueError("Return date must be on or after departure date.")
        return v


class TripUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[TripStatus] = None
    notes: Optional[str] = None
    budget_minor: Optional[int] = Field(None, ge=0, description="Budget in minor currency units (e.g. paise)")
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    travel_styles: Optional[List[TravelStyle]] = None
    walking_tolerance: Optional[int] = Field(None, ge=1, le=10)
    travel_pace: Optional[int] = Field(None, ge=1, le=10)


class TripOut(BaseModel):
    id: int
    name: str
    origin: str
    destination: str
    departure_date: date
    return_date: date
    num_days: int
    num_travellers: int
    budget_minor: int
    budget_major: float
    currency: str
    status: TripStatus
    is_demo: bool
    travel_styles: Optional[str]
    accommodation_pref: Optional[str]
    transport_pref: Optional[str]
    food_pref: Optional[str]
    must_visit: Optional[str]
    avoid: Optional[str]
    walking_tolerance: int
    travel_pace: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Activity schemas
# ---------------------------------------------------------------------------

class ActivityCreate(BaseModel):
    trip_id: int
    day_number: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=300)
    category: ActivityCategory = ActivityCategory.SIGHTSEEING
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    start_time: Optional[str] = None   # "HH:MM"
    end_time: Optional[str] = None
    duration_minutes: int = Field(default=60, ge=1)
    cost_minor: int = Field(default=0, ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    is_locked: bool = False
    notes: Optional[str] = None
    recommendation_reason: Optional[str] = None
    booking_required: bool = False
    opening_hours: Optional[str] = None


class ActivityOut(BaseModel):
    id: int
    trip_id: int
    day_number: int
    name: str
    category: ActivityCategory
    location: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    start_time: Optional[str]
    end_time: Optional[str]
    duration_minutes: int
    cost_minor: int
    cost_major: float
    currency: str
    is_locked: bool
    is_confirmed: bool
    notes: Optional[str]
    recommendation_reason: Optional[str]
    booking_required: bool
    opening_hours: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Expense Group schemas
# ---------------------------------------------------------------------------

class GroupMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None


class GroupMemberAdd(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None


class GroupMemberOut(BaseModel):
    id: int
    group_id: int
    name: str
    email: Optional[str]
    is_active: bool = True

    model_config = {"from_attributes": True}


class ExpenseGroupCreate(BaseModel):
    trip_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=200)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    members: List[GroupMemberCreate] = Field(default_factory=list)


class ExpenseGroupOut(BaseModel):
    id: int
    trip_id: Optional[int]
    name: str
    currency: str
    created_at: datetime
    members: List[GroupMemberOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Expense schemas
# ---------------------------------------------------------------------------

class ExpenseShareIn(BaseModel):
    member_id: int
    share_minor: int = Field(..., ge=0)


class ExpenseCreate(BaseModel):
    group_id: int
    paid_by_id: int
    description: str = Field(..., min_length=1, max_length=300)
    amount_minor: int = Field(..., ge=1)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    category: str = "other"
    split_method: SplitMethod = SplitMethod.EQUAL
    expense_date: Optional[date] = None
    notes: Optional[str] = None
    # For non-equal splits, caller must supply shares that sum to amount_minor
    shares: Optional[List[ExpenseShareIn]] = None
    # Optional list of specific member IDs included in the split
    participant_ids: Optional[List[int]] = None


class ExpenseUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=300)
    amount_minor: Optional[int] = Field(None, ge=1)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    category: Optional[str] = None
    paid_by_id: Optional[int] = None
    split_method: Optional[SplitMethod] = None
    expense_date: Optional[date] = None
    notes: Optional[str] = None
    shares: Optional[List[ExpenseShareIn]] = None
    participant_ids: Optional[List[int]] = None


class GroupLeaveRequest(BaseModel):
    member_id: int


class SettleDebtRequest(BaseModel):
    from_member_id: int
    to_member_id: int
    amount_minor: int = Field(..., ge=1)
    notes: Optional[str] = None


class ExpenseShareOut(BaseModel):
    id: int
    expense_id: int
    member_id: int
    share_minor: int

    model_config = {"from_attributes": True}


class ExpenseOut(BaseModel):
    id: int
    group_id: int
    paid_by_id: int
    description: str
    amount_minor: int
    amount_major: float
    currency: str
    category: str
    split_method: SplitMethod
    expense_date: date
    notes: Optional[str]
    created_at: datetime
    shares: List[ExpenseShareOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Balance / Settlement schemas
# ---------------------------------------------------------------------------

class MemberBalance(BaseModel):
    member_id: int
    member_name: str
    total_paid_minor: int
    total_owed_minor: int
    net_minor: int  # positive = owed money back, negative = owes money

    @property
    def net_major(self) -> float:
        return self.net_minor / 100


class Settlement(BaseModel):
    from_member_id: int
    from_member_name: str
    to_member_id: int
    to_member_name: str
    amount_minor: int
    currency: str

    @property
    def amount_major(self) -> float:
        return self.amount_minor / 100


class SettlementPlan(BaseModel):
    group_id: int
    currency: str
    balances: List[MemberBalance]
    settlements: List[Settlement]
    total_expenses_minor: int


# ---------------------------------------------------------------------------
# Phase 2 — Itinerary generation schemas
# ---------------------------------------------------------------------------

class GenerateItineraryRequest(BaseModel):
    """POST /api/itinerary/{trip_id}/generate"""
    overwrite_unlocked: bool = Field(
        default=True,
        description="When True, previously-generated (unlocked) activities are "
                    "replaced.  Locked activities are always preserved.",
    )
    use_ai: bool = Field(
        default=False,
        description="When True, attempts AI-driven synthesis if configured, falling back to deterministic scheduler.",
    )


class BudgetBreakdownOut(BaseModel):
    by_category: dict[str, int]   # category → minor units
    total_minor: int
    budget_cap_minor: int
    over_budget: bool
    over_budget_by_minor: int
    currency: str = "INR"
    actual_spent_minor: int = 0
    remaining_minor: int = 0
    remaining_actual_minor: int = 0
    over_actual_by_minor: int = 0


class DayScheduleOut(BaseModel):
    day_number: int
    date: str
    theme: Optional[str] = None
    status: str = "scheduled"   # "scheduled" | "partial" | "unfilled"
    unfilled_reason: Optional[str] = None
    activities: List[ActivityOut] = []


class GenerateItineraryResponse(BaseModel):
    """Response from POST /api/itinerary/{trip_id}/generate or GET /api/itinerary/{trip_id}"""
    trip_id: int
    activities: List[ActivityOut]
    budget: BudgetBreakdownOut
    warnings: List[str] = []
    is_demo: bool = True
    days: List[DayScheduleOut] = []
    calendar_complete: bool = True
    schedule_complete: bool = True
    ai_enhanced: bool = False
    ai_unavailable_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Phase 2 — Plan B (disruption replanning) schemas
# ---------------------------------------------------------------------------

class DisruptionRequest(BaseModel):
    """POST /api/itinerary/{trip_id}/replan"""
    activity_name: str = Field(..., description="Exact name of the disrupted activity")
    day_number: int = Field(..., ge=1)
    reason: str = Field(
        default="closure",
        description="One of: closure, delay, cancellation",
    )
    delay_minutes: int = Field(
        default=0, ge=0,
        description="Only used when reason='delay'",
    )


class ReplanResponse(BaseModel):
    trip_id: int
    activities: List[ActivityOut]
    budget: BudgetBreakdownOut
    changes: List[str] = []
    warnings: List[str] = []

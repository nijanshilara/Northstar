"""
SQLAlchemy ORM models — Trip, Activity, TravelPreference, Group, Member, Expense, ExpenseShare.
Import this module to register all models with the Base metadata.
"""

from __future__ import annotations
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Float, Boolean, Date, DateTime,
    ForeignKey, Text, Enum as SAEnum, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database.session import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class TravelStyle(str, enum.Enum):
    OUTGOING = "outgoing"
    LEISURELY = "leisurely"
    ADVENTURE = "adventure"
    LUXURY = "luxury"
    BUDGET = "budget"
    SOLO = "solo"
    ROMANTIC = "romantic"
    FAMILY = "family"
    GROUP = "group"
    CULTURAL = "cultural"
    FOOD_NIGHTLIFE = "food_nightlife"
    NATURE_WELLNESS = "nature_wellness"


class TripStatus(str, enum.Enum):
    PLANNING = "planning"
    BOOKED = "booked"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ActivityCategory(str, enum.Enum):
    SIGHTSEEING = "sightseeing"
    FOOD = "food"
    NIGHTLIFE = "nightlife"
    ADVENTURE = "adventure"
    WELLNESS = "wellness"
    CULTURE = "culture"
    NATURE = "nature"
    SHOPPING = "shopping"
    TRANSPORT = "transport"
    ACCOMMODATION = "accommodation"
    REST = "rest"
    OTHER = "other"


class SplitMethod(str, enum.Enum):
    EQUAL = "equal"
    EXACT = "exact"
    PERCENTAGE = "percentage"
    SHARES = "shares"


# ---------------------------------------------------------------------------
# Trip
# ---------------------------------------------------------------------------

class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    return_date: Mapped[date] = mapped_column(Date, nullable=False)
    num_days: Mapped[int] = mapped_column(Integer, nullable=False)
    num_travellers: Mapped[int] = mapped_column(Integer, default=1)

    # Budget (stored as integer minor-currency units, e.g. paise)
    budget_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="INR")

    status: Mapped[TripStatus] = mapped_column(
        SAEnum(TripStatus), default=TripStatus.PLANNING
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    # Optional owner — NULL means unowned / demo trip
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Preferences (JSON-serializable fields stored as strings for SQLite compat)
    travel_styles: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma-sep enum values
    accommodation_pref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    transport_pref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    food_pref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    must_visit: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avoid: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    walking_tolerance: Mapped[int] = mapped_column(Integer, default=5)  # 1–10
    travel_pace: Mapped[int] = mapped_column(Integer, default=5)        # 1–10 (slow–fast)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    activities: Mapped[List["Activity"]] = relationship(
        "Activity", back_populates="trip", cascade="all, delete-orphan"
    )
    expense_groups: Mapped[List["ExpenseGroup"]] = relationship(
        "ExpenseGroup", back_populates="trip", cascade="all, delete-orphan"
    )

    @property
    def budget_major(self) -> float:
        """Budget in major currency units (e.g. rupees)."""
        return self.budget_minor / 100

    def __repr__(self) -> str:
        return f"<Trip id={self.id} name={self.name!r} destination={self.destination!r}>"


# ---------------------------------------------------------------------------
# Activity (itinerary item)
# ---------------------------------------------------------------------------

class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), nullable=False)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-indexed
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[ActivityCategory] = mapped_column(
        SAEnum(ActivityCategory), default=ActivityCategory.SIGHTSEEING
    )
    location: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    start_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)   # "HH:MM"
    end_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)     # "HH:MM"
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)

    cost_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="INR")

    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    booking_required: Mapped[bool] = mapped_column(Boolean, default=False)
    opening_hours: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    trip: Mapped["Trip"] = relationship("Trip", back_populates="activities")

    @property
    def cost_major(self) -> float:
        return self.cost_minor / 100


# ---------------------------------------------------------------------------
# Expense Group (Splitwise-style)
# ---------------------------------------------------------------------------

class ExpenseGroup(Base):
    __tablename__ = "expense_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("trips.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    trip: Mapped[Optional["Trip"]] = relationship("Trip", back_populates="expense_groups")
    members: Mapped[List["GroupMember"]] = relationship(
        "GroupMember", back_populates="group", cascade="all, delete-orphan"
    )
    expenses: Mapped[List["Expense"]] = relationship(
        "Expense", back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("expense_groups.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    group: Mapped["ExpenseGroup"] = relationship("ExpenseGroup", back_populates="members")
    expense_shares: Mapped[List["ExpenseShare"]] = relationship(
        "ExpenseShare", back_populates="member"
    )
    paid_expenses: Mapped[List["Expense"]] = relationship(
        "Expense", back_populates="paid_by"
    )


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("expense_groups.id"), nullable=False)
    paid_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("group_members.id"), nullable=False)

    description: Mapped[str] = mapped_column(String(300), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)  # minor units
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    category: Mapped[str] = mapped_column(String(50), default="other")
    split_method: Mapped[SplitMethod] = mapped_column(
        SAEnum(SplitMethod), default=SplitMethod.EQUAL
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    group: Mapped["ExpenseGroup"] = relationship("ExpenseGroup", back_populates="expenses")
    paid_by: Mapped["GroupMember"] = relationship("GroupMember", back_populates="paid_expenses")
    shares: Mapped[List["ExpenseShare"]] = relationship(
        "ExpenseShare", back_populates="expense", cascade="all, delete-orphan"
    )

    @property
    def amount_major(self) -> float:
        return self.amount_minor / 100


class ExpenseShare(Base):
    __tablename__ = "expense_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    expense_id: Mapped[int] = mapped_column(Integer, ForeignKey("expenses.id"), nullable=False)
    member_id: Mapped[int] = mapped_column(Integer, ForeignKey("group_members.id"), nullable=False)
    share_minor: Mapped[int] = mapped_column(Integer, nullable=False)  # their share in minor units

    expense: Mapped["Expense"] = relationship("Expense", back_populates="shares")
    member: Mapped["GroupMember"] = relationship("GroupMember", back_populates="expense_shares")

"""
User model and auth-related models (email verification, password reset).
Also adds SearchHistory for persisting user activity.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Boolean, DateTime, ForeignKey, Text, func, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    """Registered user account."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Preferences persisted server-side (supplement localStorage)
    theme: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)     # light|dark|colourful
    palette: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # ocean|sunset|…
    custom_accent: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # #rrggbb
    preferred_currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True, default="INR")
    show_converted_prices: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    verification_tokens: Mapped[List["EmailVerificationToken"]] = relationship(
        "EmailVerificationToken", back_populates="user", cascade="all, delete-orphan"
    )
    reset_tokens: Mapped[List["PasswordResetToken"]] = relationship(
        "PasswordResetToken", back_populates="user", cascade="all, delete-orphan"
    )
    history: Mapped[List["SearchHistory"]] = relationship(
        "SearchHistory", back_populates="user", cascade="all, delete-orphan"
    )
    capsules: Mapped[List["Capsule"]] = relationship(
        "Capsule", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


# ---------------------------------------------------------------------------
# Email verification token
# ---------------------------------------------------------------------------

class EmailVerificationToken(Base):
    """Single-use, expiring email verification token."""
    __tablename__ = "email_verification_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="verification_tokens")

    def is_valid(self) -> bool:
        return (
            not self.used
            and datetime.now(timezone.utc).replace(tzinfo=None) < self.expires_at
        )


# ---------------------------------------------------------------------------
# Password reset token
# ---------------------------------------------------------------------------

class PasswordResetToken(Base):
    """Single-use, expiring password-reset token (1-hour TTL)."""
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="reset_tokens")

    def is_valid(self) -> bool:
        return (
            not self.used
            and datetime.now(timezone.utc).replace(tzinfo=None) < self.expires_at
        )


# ---------------------------------------------------------------------------
# Search / Activity history
# ---------------------------------------------------------------------------

class SearchHistory(Base):
    """
    Records user-initiated searches and itinerary generations.
    Each row represents one discrete user action.
    """
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # What kind of event this is
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # search|itinerary_generated|trip_created|trip_viewed|favourite

    # Human-readable label (e.g. destination searched or trip name)
    label: Mapped[str] = mapped_column(String(300), nullable=False)

    # Optional structured payload stored as JSON string
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Whether the user explicitly saved / bookmarked this item
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False)

    # Optional link back to a trip or other entity
    trip_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="history")

    __table_args__ = (
        Index("ix_search_history_user_id_created", "user_id", "created_at"),
    )

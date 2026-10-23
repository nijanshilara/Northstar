"""Pydantic schemas for authentication and user management."""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ---------------------------------------------------------------------------
# Registration / Login
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150, description="Display name")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        return v

    @field_validator("name")
    @classmethod
    def name_no_html(cls, v: str) -> str:
        if "<" in v or ">" in v:
            raise ValueError("Name must not contain HTML characters.")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# User output
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    is_verified: bool
    theme: Optional[str]
    palette: Optional[str]
    custom_accent: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Token response
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Email verification / password reset
# ---------------------------------------------------------------------------

class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        return v


# ---------------------------------------------------------------------------
# Profile update
# ---------------------------------------------------------------------------

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    theme: Optional[str] = Field(None, pattern=r"^(light|dark|colourful)$")
    palette: Optional[str] = Field(None, pattern=r"^(ocean|sunset|tropical|lavender|rose|forest|custom)$")
    custom_accent: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        return v


# ---------------------------------------------------------------------------
# History schemas
# ---------------------------------------------------------------------------

class HistoryItemOut(BaseModel):
    id: int
    event_type: str
    label: str
    payload: Optional[str]
    is_saved: bool
    trip_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class AddHistoryRequest(BaseModel):
    event_type: str = Field(..., pattern=r"^(search|itinerary_generated|trip_created|trip_viewed|favourite)$")
    label: str = Field(..., min_length=1, max_length=300)
    payload: Optional[str] = None
    is_saved: bool = False
    trip_id: Optional[int] = None

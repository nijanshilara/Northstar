"""
Auth service — business logic for registration, login, email verification,
password reset and profile management.  No logic lives in the router.
"""

from __future__ import annotations
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, EmailVerificationToken, PasswordResetToken, SearchHistory
from app.schemas.auth_schemas import RegisterRequest, UpdateProfileRequest
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.core.email import send_verification_email, send_password_reset_email


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_token() -> str:
    """Generate a 64-character cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(48)


def _now_naive() -> datetime:
    """UTC now without tzinfo (matches SQLite storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_user(db: Session, data: RegisterRequest) -> tuple[User, dict]:
    """
    Create a new user account.
    Returns (user, email_result) where email_result contains dev_mode info.
    Raises 409 if the email is already registered.
    """
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email address already exists.",
        )

    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.flush()  # get user.id

    token_str = _generate_token()
    token = EmailVerificationToken(
        user_id=user.id,
        token=token_str,
        expires_at=_now_naive() + timedelta(hours=24),
    )
    db.add(token)
    db.commit()
    db.refresh(user)

    email_result = send_verification_email(data.email, token_str, data.name.strip())
    return user, email_result


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def authenticate_user(db: Session, email: str, password: str) -> User:
    """
    Verify credentials.  Uses a constant-time path to prevent user enumeration.
    Raises 401 on failure.
    """
    user = db.query(User).filter(User.email == email.lower()).first()
    # Always verify — prevents timing attacks
    dummy_hash = "$2b$12$" + "x" * 53
    if user is None:
        verify_password(password, dummy_hash)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )
    return user


def create_tokens(user: User) -> tuple[str, str]:
    """Return (access_token, refresh_token) for the given user."""
    access = create_access_token(user.id, user.email)
    refresh = create_refresh_token(user.id)
    return access, refresh


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

def verify_email(db: Session, token_str: str) -> User:
    """Mark user as verified.  Raises 400 on invalid / expired token."""
    token = db.query(EmailVerificationToken).filter(
        EmailVerificationToken.token == token_str
    ).first()
    if not token or not token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired.",
        )
    token.used = True
    token.user.is_verified = True
    db.commit()
    db.refresh(token.user)
    return token.user


def resend_verification(db: Session, user: User) -> dict:
    """
    Issue a new verification email.
    Rate-limited: one resend per 60 seconds (checks most recent unused token).
    """
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already verified.",
        )
    recent = (
        db.query(EmailVerificationToken)
        .filter(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used.is_(False),
        )
        .order_by(EmailVerificationToken.created_at.desc())
        .first()
    )
    if recent:
        age_seconds = (_now_naive() - recent.created_at).total_seconds()
        if age_seconds < 60:
            wait = int(60 - age_seconds)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait} seconds before requesting another verification email.",
            )

    token_str = _generate_token()
    token = EmailVerificationToken(
        user_id=user.id,
        token=token_str,
        expires_at=_now_naive() + timedelta(hours=24),
    )
    db.add(token)
    db.commit()
    return send_verification_email(user.email, token_str, user.name)


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

def initiate_password_reset(db: Session, email: str) -> dict:
    """
    Send a password-reset email.
    IMPORTANT: always returns the same generic message regardless of whether
    the email is registered — prevents user enumeration.
    """
    GENERIC = {"message": "If that email is registered, a reset link has been sent."}
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user or not user.is_active:
        return GENERIC

    token_str = _generate_token()
    token = PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=_now_naive() + timedelta(hours=1),
    )
    db.add(token)
    db.commit()

    try:
        result = send_password_reset_email(user.email, token_str)
    except Exception:
        # Don't expose the failure to the caller
        return GENERIC

    if result.get("dev_mode"):
        return {**GENERIC, "dev_token": result["token"]}
    return GENERIC


def reset_password(db: Session, token_str: str, new_password: str) -> None:
    """Apply a new password via a valid reset token.  Raises 400 on bad token."""
    token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token_str
    ).first()
    if not token or not token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )
    token.used = True
    token.user.hashed_password = hash_password(new_password)
    db.commit()


# ---------------------------------------------------------------------------
# Profile management
# ---------------------------------------------------------------------------

def update_profile(db: Session, user: User, data: UpdateProfileRequest) -> User:
    if data.name is not None:
        user.name = data.name.strip()
    if data.theme is not None:
        user.theme = data.theme
    if data.palette is not None:
        user.palette = data.palette
    if data.custom_accent is not None:
        user.custom_accent = data.custom_accent
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    user.hashed_password = hash_password(new)
    db.commit()


def delete_account(db: Session, user: User) -> None:
    """Permanently delete the user and all their owned data (cascade)."""
    db.delete(user)
    db.commit()


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def add_history(
    db: Session,
    user: User,
    event_type: str,
    label: str,
    payload: Optional[str] = None,
    is_saved: bool = False,
    trip_id: Optional[int] = None,
) -> SearchHistory:
    item = SearchHistory(
        user_id=user.id,
        event_type=event_type,
        label=label,
        payload=payload,
        is_saved=is_saved,
        trip_id=trip_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_history(
    db: Session,
    user: User,
    event_type: Optional[str] = None,
    saved_only: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[SearchHistory]:
    q = db.query(SearchHistory).filter(SearchHistory.user_id == user.id)
    if event_type:
        q = q.filter(SearchHistory.event_type == event_type)
    if saved_only:
        q = q.filter(SearchHistory.is_saved.is_(True))
    return q.order_by(SearchHistory.created_at.desc()).offset(offset).limit(limit).all()


def delete_history_item(db: Session, user: User, item_id: int) -> None:
    item = db.query(SearchHistory).filter(
        SearchHistory.id == item_id,
        SearchHistory.user_id == user.id,  # ownership check
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="History item not found.")
    db.delete(item)
    db.commit()


def clear_history(db: Session, user: User) -> int:
    deleted = db.query(SearchHistory).filter(SearchHistory.user_id == user.id).delete()
    db.commit()
    return deleted

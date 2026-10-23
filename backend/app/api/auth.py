"""
Auth API router — /api/auth/*

Endpoints:
  POST /register          — create account
  POST /login             — sign in, set httpOnly cookies
  POST /logout            — clear cookies
  GET  /me                — get current user (requires auth)
  POST /verify-email      — consume verification token
  POST /resend-verify     — resend verification (rate-limited)
  POST /forgot-password   — initiate reset (timing-safe)
  POST /reset-password    — apply new password
  PATCH /profile          — update name / theme preferences
  POST /change-password   — change password (requires current)
  DELETE /account         — delete account and all data

Authentication flow:
  - Access token in httpOnly cookie 'access_token' (30 min)
  - Refresh token in httpOnly cookie 'refresh_token' (7 days)
  - GET /me reads the access_token cookie and returns the user
"""

from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.auth_schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.services import auth_service
from app.core.security import decode_token
from app.core.email import _is_smtp_configured

router = APIRouter()

# ── Cookie settings ───────────────────────────────────────────────────────────

COOKIE_SECURE = False   # Set True in production (requires HTTPS)
COOKIE_SAMESITE = "lax"
ACCESS_MAX_AGE = 30 * 60          # 30 minutes
REFRESH_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_MAX_AGE,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# ── Current-user dependency ────────────────────────────────────────────────────

def get_current_user(
    access_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — resolve the logged-in user from the access_token cookie or Bearer header."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated.",
    )
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()

    if not token:
        raise credentials_exc
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise credentials_exc
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise credentials_exc
    return user


def get_current_user_optional(
    access_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Same as get_current_user but returns None instead of raising 401."""
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()

    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = int(payload["sub"])
    return db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Create a new account, issue cookies, send verification email."""
    user, email_result = auth_service.register_user(db, data)
    access, refresh = auth_service.create_tokens(user)
    _set_auth_cookies(response, access, refresh)
    dev_mode = bool(email_result.get("dev_mode", False) and not _is_smtp_configured())
    result = {
        "message": "Account created. Please check your email to verify your address.",
        "user": UserOut.model_validate(user).model_dump(),
        "email_dev_mode": dev_mode,
    }
    if dev_mode and email_result.get("token"):
        # Expose token in response ONLY in dev mode so devs can test without SMTP
        result["dev_verification_token"] = email_result["token"]
    return result


@router.post("/login", response_model=dict)
def login(
    data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Sign in and issue httpOnly auth cookies."""
    user = auth_service.authenticate_user(db, data.email, data.password)
    access, refresh = auth_service.create_tokens(user)
    _set_auth_cookies(response, access, refresh)
    return {
        "message": "Signed in successfully.",
        "user": UserOut.model_validate(user).model_dump(),
    }


@router.post("/logout")
def logout(response: Response):
    """Clear auth cookies."""
    _clear_auth_cookies(response)
    return {"message": "Signed out successfully."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.post("/refresh", response_model=dict)
def refresh_access(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """Exchange a valid refresh cookie for a new access token."""
    credentials_exc = HTTPException(status_code=401, detail="Refresh token invalid or expired.")
    if not refresh_token:
        raise credentials_exc
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise credentials_exc
    user = db.query(User).filter(
        User.id == int(payload["sub"]), User.is_active.is_(True)
    ).first()
    if not user:
        raise credentials_exc
    from app.core.security import create_access_token
    new_access = create_access_token(user.id, user.email)
    response.set_cookie(
        key="access_token", value=new_access,
        httponly=True, secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE, max_age=ACCESS_MAX_AGE, path="/",
    )
    return {"message": "Token refreshed.", "user": UserOut.model_validate(user).model_dump()}


@router.post("/verify-email", response_model=dict)
def verify_email(
    data: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    user = auth_service.verify_email(db, data.token)
    return {"message": "Email verified successfully.", "user": UserOut.model_validate(user).model_dump()}


@router.post("/resend-verify", response_model=dict)
def resend_verify(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = auth_service.resend_verification(db, current_user)
    dev_mode = bool(result.get("dev_mode", False) and not _is_smtp_configured())
    resp = {"message": "Verification email resent.", "email_dev_mode": dev_mode}
    if dev_mode and result.get("token"):
        resp["dev_verification_token"] = result["token"]
    return resp


@router.post("/forgot-password", response_model=dict)
def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    result = auth_service.initiate_password_reset(db, data.email)
    return result


@router.post("/reset-password", response_model=dict)
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    auth_service.reset_password(db, data.token, data.new_password)
    return {"message": "Password reset successfully. Please sign in with your new password."}


@router.patch("/profile", response_model=UserOut)
def update_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return auth_service.update_profile(db, current_user, data)


@router.post("/change-password", response_model=dict)
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.change_password(db, current_user, data.current_password, data.new_password)
    return {"message": "Password changed successfully."}


@router.delete("/account", status_code=status.HTTP_200_OK)
def delete_account(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.delete_account(db, current_user)
    _clear_auth_cookies(response)
    return {"message": "Account deleted. All your data has been removed."}

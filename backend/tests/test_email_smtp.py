"""
Tests for Northstar Email & Mailjet SMTP Integration.
Validates:
- Professional Northstar-branded email template generation (HTML + plain text)
- Correct frontend reset link structure
- SMTP STARTTLS protocol invocation and sender formatting
- Safe handling and logging of SMTP delivery failures
- Password reset token single-use and 1-hour expiration validation
"""

from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models import base as _base_models  # noqa: F401
from app.models import user as _user_models  # noqa: F401
from app.models.user import User, PasswordResetToken
from app.core.config import settings
from app.core.email import (
    _is_smtp_configured,
    _send_smtp,
    send_password_reset_email,
)

TEST_DB_URL = "sqlite:///./test_email_smtp.db"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)
    if os.path.exists("./test_email_smtp.db"):
        try:
            os.remove("./test_email_smtp.db")
        except OSError:
            pass


@pytest.fixture
def client(setup_test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def test_is_smtp_configured_logic():
    """Verify SMTP configuration detection without leaking real credentials."""
    with patch.object(settings, "SMTP_HOST", ""), patch.object(settings, "SMTP_USER", ""), patch.object(settings, "SMTP_PASSWORD", ""):
        assert _is_smtp_configured() is False

    with patch.object(settings, "SMTP_HOST", "in-v3.mailjet.com"), \
         patch.object(settings, "SMTP_USER", "test_user"), \
         patch.object(settings, "SMTP_PASSWORD", "test_pass"), \
         patch.dict("os.environ", {"FORCE_TEST_SMTP": "1"}):
        assert _is_smtp_configured() is True


def test_password_reset_email_template_structure():
    """Verify reset email contains Northstar branding, 1-hour expiry, single-use notice, and valid link."""
    token = "test_secure_token_12345"
    test_email = "traveler@example.com"

    with patch("app.core.email._is_smtp_configured", return_value=True), \
         patch("app.core.email._send_smtp") as mock_send:
        result = send_password_reset_email(test_email, token)
        assert result["dev_mode"] is False
        assert result["token"] is None

        mock_send.assert_called_once()
        to_email, subject, html_body, plain_text = mock_send.call_args[0]

        assert to_email == test_email
        assert subject == "Reset your Northstar password"

        # Check frontend URL
        expected_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"
        assert expected_link in html_body
        assert expected_link in plain_text

        # Check branding & security notices
        assert "Northstar Travel" in html_body
        assert "Your compass to everywhere" in html_body
        assert "1 hour" in html_body
        assert "single-use" in html_body
        assert "single-use" in plain_text
        assert "1 hour" in plain_text


def test_smtp_send_starttls_and_sender_format():
    """Verify _send_smtp uses STARTTLS and RFC 2822 sender formatting."""
    with patch.object(settings, "SMTP_HOST", "in-v3.mailjet.com"), \
         patch.object(settings, "SMTP_PORT", 587), \
         patch.object(settings, "SMTP_USER", "test_key"), \
         patch.object(settings, "SMTP_PASSWORD", "test_secret"), \
         patch.object(settings, "SMTP_FROM", "verified@spit.ac.in"), \
         patch.object(settings, "SMTP_FROM_NAME", "Northstar Travel"):

        mock_server = MagicMock()
        mock_smtp_class = MagicMock()
        mock_smtp_class.return_value.__enter__.return_value = mock_server

        with patch("smtplib.SMTP", mock_smtp_class):
            _send_smtp(
                to_email="recipient@example.com",
                subject="Test Subject",
                html_body="<p>Test Body</p>",
                plain_text="Test Body",
            )

            mock_smtp_class.assert_called_once_with("in-v3.mailjet.com", 587, timeout=15)
            
            # Verify STARTTLS and authentication was invoked
            assert mock_server.starttls.called
            assert mock_server.login.called
            assert mock_server.sendmail.called

            # Check sender argument
            sendmail_args = mock_server.sendmail.call_args[0]
            assert sendmail_args[0] == "verified@spit.ac.in"
            assert sendmail_args[1] == "recipient@example.com"
            raw_msg = sendmail_args[2]
            assert "From: Northstar Travel <verified@spit.ac.in>" in raw_msg


def test_smtp_delivery_failure_safe_handling(client):
    """Verify SMTP exceptions are securely caught, logged, and return generic response."""
    # Register a user
    client.post("/api/auth/register", json={
        "name": "Audit User",
        "email": "audit_user@example.com",
        "password": "Password123!",
    })

    # Mock send_password_reset_email to raise an SMTP delivery exception
    with patch("app.services.auth_service.send_password_reset_email", side_effect=Exception("Connection refused by SMTP host")):
        r = client.post("/api/auth/forgot-password", json={"email": "audit_user@example.com"})
        
        # Must return generic message without exposing internal server error
        assert r.status_code == 200
        assert r.json() == {"message": "If that email is registered, a reset link has been sent."}


def test_password_reset_token_single_use_and_expiration(client):
    """Verify PasswordResetToken expires after 1 hour and cannot be reused."""
    client.post("/api/auth/register", json={
        "name": "Token Tester",
        "email": "tokentester@example.com",
        "password": "InitialPass123!",
    })

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "tokentester@example.com").first()
        assert user is not None

        # Test 1: Fresh token is valid
        token_fresh = PasswordResetToken(
            user_id=user.id,
            token="valid_token_fresh",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
            used=False,
        )
        db.add(token_fresh)
        db.commit()
        assert token_fresh.is_valid() is True

        # Test 2: Expired token (> 1 hour) is invalid
        token_expired = PasswordResetToken(
            user_id=user.id,
            token="invalid_token_expired",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),
            used=False,
        )
        db.add(token_expired)
        db.commit()
        assert token_expired.is_valid() is False

        # Test 3: Used token is invalid
        token_used = PasswordResetToken(
            user_id=user.id,
            token="invalid_token_used",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1),
            used=True,
        )
        db.add(token_used)
        db.commit()
        assert token_used.is_valid() is False
    finally:
        db.close()

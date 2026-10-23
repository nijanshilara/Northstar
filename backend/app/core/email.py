"""
Email sending — supports dev mode (log/return token) and production SMTP.

In dev mode (SMTP_HOST is blank), verification and password-reset tokens are
NOT sent over email.  Instead the token is returned in the API response and
printed to the backend console so developers can test the flow without a mail
server.  The API always makes it clear when it is operating in dev mode.

To enable real email, set the SMTP_* environment variables in backend/.env.
"""

from __future__ import annotations
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _send_smtp(to_email: str, subject: str, html_body: str) -> None:
    """Send email via SMTP.  Raises on failure."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls(context=context)
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM or settings.SMTP_USER, to_email, msg.as_string())


def send_verification_email(to_email: str, token: str, name: str) -> dict:
    """
    Send an email-verification link.

    Returns a dict with:
      - dev_mode: bool — True means email was NOT sent
      - token: str | None — present only in dev mode so the developer can test
    """
    link = f"{settings.FRONTEND_ORIGIN}/verify-email?token={token}"
    subject = "Verify your Northstar account"
    html_body = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#047481">Welcome to Northstar, {name}!</h2>
      <p>Click the button below to verify your email address.
         This link expires in <strong>24 hours</strong>.</p>
      <a href="{link}" style="display:inline-block;padding:12px 24px;
         background:#047481;color:#fff;border-radius:8px;
         text-decoration:none;font-weight:600;margin:16px 0">Verify Email</a>
      <p style="color:#64748b;font-size:12px">Or copy this link:<br>{link}</p>
    </div>
    """
    if _is_smtp_configured():
        try:
            _send_smtp(to_email, subject, html_body)
            logger.info("Verification email sent to %s", to_email)
            return {"dev_mode": False, "token": None}
        except Exception as exc:
            logger.error("Failed to send verification email: %s", exc)
            raise
    else:
        logger.warning(
            "[DEV MODE] Verification token for %s: %s  |  Link: %s",
            to_email, token, link,
        )
        return {"dev_mode": True, "token": token}


def send_password_reset_email(to_email: str, token: str) -> dict:
    """
    Send a password-reset link.

    NOTE: The API MUST NOT reveal whether the email address is registered.
    This function is only called when the address IS registered — the caller
    handles the ambiguity.

    Returns a dict with dev_mode and (in dev mode) the token.
    """
    link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"
    subject = "Reset your Northstar password"
    html_body = f"""
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#047481">Password Reset Request</h2>
      <p>We received a request to reset the password for your account.
         Click below — the link expires in <strong>1 hour</strong>.</p>
      <a href="{link}" style="display:inline-block;padding:12px 24px;
         background:#047481;color:#fff;border-radius:8px;
         text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
      <p style="color:#64748b;font-size:12px">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
    """
    if _is_smtp_configured():
        try:
            _send_smtp(to_email, subject, html_body)
            logger.info("Password reset email sent to %s", to_email)
            return {"dev_mode": False, "token": None}
        except Exception as exc:
            logger.error("Failed to send reset email: %s", exc)
            raise
    else:
        logger.warning(
            "[DEV MODE] Password reset token for %s: %s  |  Link: %s",
            to_email, token, link,
        )
        return {"dev_mode": True, "token": token}

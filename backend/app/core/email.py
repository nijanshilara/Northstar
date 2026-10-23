"""
Email sending — supports dev mode (log/return token) and production SMTP.

In dev mode (SMTP_HOST is blank or running under unit tests), verification and
password-reset tokens are NOT sent over email. Instead the token is returned
in the API response and printed to the backend console so developers can test
the flow without a mail server.

To enable real email, set the SMTP_* environment variables in backend/.env.
"""

from __future__ import annotations
import logging
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_smtp_configured() -> bool:
    """Return True if SMTP credentials are provided and not in automated unit test mode."""
    if os.environ.get("PYTEST_CURRENT_TEST") and not os.environ.get("FORCE_TEST_SMTP"):
        return False
    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        return True

    # Hot-reload fallback: dynamically re-inspect backend/.env if the server was started earlier
    try:
        from dotenv import dotenv_values
        candidates = ["backend/.env", ".env", "../backend/.env"]
        for p in candidates:
            if os.path.exists(p):
                vals = dotenv_values(p)
                host = vals.get("SMTP_HOST") or settings.SMTP_HOST
                user = vals.get("SMTP_USER") or settings.SMTP_USER
                password = vals.get("SMTP_PASSWORD") or settings.SMTP_PASSWORD
                if host and user and password:
                    settings.SMTP_HOST = host
                    settings.SMTP_PORT = int(vals.get("SMTP_PORT") or settings.SMTP_PORT or 587)
                    settings.SMTP_USER = user
                    settings.SMTP_PASSWORD = password
                    settings.SMTP_FROM = vals.get("SMTP_FROM") or settings.SMTP_FROM
                    settings.SMTP_FROM_NAME = vals.get("SMTP_FROM_NAME") or settings.SMTP_FROM_NAME
                    return True
    except Exception:
        pass

    return False


def _send_smtp(to_email: str, subject: str, html_body: str, plain_text: str | None = None) -> None:
    """Send multipart email via SMTP with STARTTLS. Raises on failure."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    
    sender_name = settings.SMTP_FROM_NAME or "Northstar Travel"
    sender_addr = settings.SMTP_FROM or settings.SMTP_USER
    msg["From"] = formataddr((sender_name, sender_addr))
    msg["To"] = to_email

    # Plain text fallback
    if plain_text:
        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    
    # HTML version
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(sender_addr, to_email, msg.as_string())


def send_verification_email(to_email: str, token: str, name: str) -> dict:
    """
    Send an email-verification link.

    Returns a dict with:
      - dev_mode: bool — True means email was NOT sent
      - token: str | None — present only in dev mode so the developer can test
    """
    link = f"{settings.FRONTEND_ORIGIN}/verify-email?token={token}"
    subject = "Verify your Northstar account"

    plain_text = (
        f"Welcome to Northstar, {name}!\n\n"
        f"Please verify your email address by visiting the link below:\n"
        f"{link}\n\n"
        f"This link expires in 24 hours.\n\n"
        f"— Northstar Travel (Your compass to everywhere)"
    )

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:0 auto;background-color:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);padding:28px 24px;text-align:center;">
      <div style="font-size:32px;line-height:1;margin-bottom:8px;">🧭</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Northstar Travel</h1>
      <p style="margin:4px 0 0 0;font-size:13px;color:#e0f2fe;">Your compass to everywhere</p>
    </div>
    
    <div style="padding:32px 28px;">
      <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#f8fafc;">Welcome, {name}!</h2>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#cbd5e1;">
        Thank you for joining Northstar. Please verify your email address to unlock your intelligent travel dashboard, trip planner, and memories.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="{link}" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;box-shadow:0 4px 12px rgba(2,132,199,0.3);">
          Verify Email Address
        </a>
      </div>

      <div style="background-color:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
          ⏱ <strong>Expiry Notice:</strong> This link is secure, single-use, and expires in <strong>24 hours</strong>.
        </p>
      </div>

      <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0;font-size:12px;color:#38bdf8;word-break:break-all;">
        <a href="{link}" style="color:#38bdf8;text-decoration:none;">{link}</a>
      </p>
    </div>

    <div style="border-top:1px solid #334155;padding:18px 28px;text-align:center;background-color:#0f172a;">
      <p style="margin:0;font-size:11px;color:#64748b;">
        © Northstar AI Travel Guide. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>"""

    if _is_smtp_configured():
        try:
            _send_smtp(to_email, subject, html_body, plain_text)
            logger.info("Verification email sent to %s via SMTP", to_email)
            return {"dev_mode": False, "token": None}
        except Exception as exc:
            logger.error("Failed to deliver verification email to %s: %s", to_email, exc)
            raise
    else:
        logger.warning(
            "[DEV MODE] Verification token for %s: %s  |  Link: %s",
            to_email, token, link,
        )
        return {"dev_mode": True, "token": token}


def send_password_reset_email(to_email: str, token: str) -> dict:
    """
    Send a secure, single-use, 1-hour expiring password-reset link.

    Returns a dict with dev_mode and (in dev mode) the token.
    """
    link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={token}"
    subject = "Reset your Northstar password"

    plain_text = (
        f"Password Reset Request — Northstar\n\n"
        f"We received a request to reset the password for your Northstar account.\n\n"
        f"To reset your password, visit the following link:\n"
        f"{link}\n\n"
        f"SECURITY NOTICE:\n"
        f"• This link is single-use and will expire in 1 hour.\n"
        f"• If you did not request this password reset, please ignore this email. Your password will remain unchanged and your account is secure.\n\n"
        f"— Northstar Travel (Your compass to everywhere)"
    )

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:24px;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:0 auto;background-color:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);padding:28px 24px;text-align:center;">
      <div style="font-size:32px;line-height:1;margin-bottom:8px;">🧭</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Northstar Travel</h1>
      <p style="margin:4px 0 0 0;font-size:13px;color:#e0f2fe;">Your compass to everywhere</p>
    </div>
    
    <div style="padding:32px 28px;">
      <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#f8fafc;">Password Reset Request</h2>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#cbd5e1;">
        We received a request to reset the password for your Northstar account. Click the button below to choose a new secure password.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="{link}" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;box-shadow:0 4px 12px rgba(2,132,199,0.3);">
          Reset Password
        </a>
      </div>

      <div style="background-color:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;color:#38bdf8;">
          🔒 Security Notice
        </p>
        <p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;line-height:1.5;">
          • This link is <strong>single-use</strong> and will expire in <strong>1 hour</strong>.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
          • If you did not request this change, you can safely ignore this email. Your current password remains secure.
        </p>
      </div>

      <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0;font-size:12px;color:#38bdf8;word-break:break-all;">
        <a href="{link}" style="color:#38bdf8;text-decoration:none;">{link}</a>
      </p>
    </div>

    <div style="border-top:1px solid #334155;padding:18px 28px;text-align:center;background-color:#0f172a;">
      <p style="margin:0;font-size:11px;color:#64748b;">
        © Northstar AI Travel Guide. Sent securely via Mailjet.
      </p>
    </div>
  </div>
</body>
</html>"""

    if _is_smtp_configured():
        try:
            _send_smtp(to_email, subject, html_body, plain_text)
            logger.info("Password reset email sent to %s via SMTP", to_email)
            return {"dev_mode": False, "token": None}
        except Exception as exc:
            logger.error("Failed to deliver reset email to %s: %s", to_email, exc)
            raise
    else:
        logger.warning(
            "[DEV MODE] Password reset token for %s: %s  |  Link: %s",
            to_email, token, link,
        )
        return {"dev_mode": True, "token": token}

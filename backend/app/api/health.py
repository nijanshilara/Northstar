"""Health-check router."""
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "demo_mode": settings.demo_mode,
        "version": "0.1.0",
    }


@router.get("/health/smtp-status")
def smtp_status():
    import os
    from app.core.email import _is_smtp_configured
    return {
        "configured": _is_smtp_configured(),
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "has_user": bool(settings.SMTP_USER),
        "has_password": bool(settings.SMTP_PASSWORD),
        "from_addr": settings.SMTP_FROM,
        "from_name": settings.SMTP_FROM_NAME,
        "pid": os.getpid(),
    }

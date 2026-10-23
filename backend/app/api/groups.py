"""Groups router (re-exports from expenses for cleaner URL structure)."""
from fastapi import APIRouter

router = APIRouter()
# Groups are managed through the expenses router at /api/expenses/groups
# This file is a placeholder for future group-specific endpoints (e.g. invitations)

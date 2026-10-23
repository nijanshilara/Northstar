"""
AI Travel Guide — FastAPI Backend
Main application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.database.session import engine
from app.models import base, user, capsule  # noqa: F401 — registers ALL models with Base metadata
from app.database.session import Base

from app.api import trips, activities, expenses, groups, demo, health, itinerary
from app.api import auth, history
from app.api import weather, ai_chat  # Phase 4
from app.api import capsules  # Phase 5
from app.api import integrations  # Phase 5.1 Real Integrations Status
from app.api import currency



from sqlalchemy import text


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup (safe: create_all is idempotent)."""
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            res = conn.execute(text("PRAGMA table_info(group_members)")).fetchall()
            cols = [r[1] for r in res]
            if cols and "is_active" not in cols:
                conn.execute(text("ALTER TABLE group_members ADD COLUMN is_active BOOLEAN DEFAULT 1"))
            
            # Migrate users table for global currency preferences
            user_cols_res = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            user_cols = [r[1] for r in user_cols_res]
            if user_cols and "preferred_currency" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN preferred_currency VARCHAR(3) DEFAULT 'INR'"))
            if user_cols and "show_converted_prices" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN show_converted_prices BOOLEAN DEFAULT 1"))
            # Ensure any existing users with null preferred_currency default to 'INR'
            if user_cols:
                conn.execute(text("UPDATE users SET preferred_currency = 'INR' WHERE preferred_currency IS NULL"))
                conn.execute(text("UPDATE users SET show_converted_prices = 1 WHERE show_converted_prices IS NULL"))
            conn.commit()
    except Exception:
        pass
    yield


app = FastAPI(
    title="Northstar API",
    description="Northstar — Your compass to everywhere. Backend API",
    version="0.2.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow_credentials=True is required for httpOnly cookie auth
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — Phase 1 & 2 (unchanged)
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(trips.router, prefix="/api/trips", tags=["trips"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(demo.router, prefix="/api/demo", tags=["demo"])
app.include_router(itinerary.router, prefix="/api/itinerary", tags=["itinerary"])

# ---------------------------------------------------------------------------
# Routers — Phase 3 (auth + history)
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(history.router, prefix="/api/history", tags=["history"])

# ---------------------------------------------------------------------------
# Routers — Phase 4 (weather, AI, live mode)
# ---------------------------------------------------------------------------
app.include_router(weather.router, prefix="/api/weather", tags=["weather"])
app.include_router(ai_chat.router, prefix="/api/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Routers — Phase 5 (Memory Capsules) & Phase 5.1 (Integrations)
# ---------------------------------------------------------------------------
app.include_router(capsules.router, prefix="/api/capsules", tags=["capsules"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])
app.include_router(currency.router, prefix="/api/currency", tags=["currency"])


@app.get("/")
async def root():
    return {
        "message": "Northstar API",
        "tagline": "Your compass to everywhere.",
        "version": "0.2.0",
        "docs": "/docs",
        "status": "running",
    }

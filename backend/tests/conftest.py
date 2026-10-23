"""
conftest.py — shared pytest configuration for all test modules.

Key purpose: ensure ALL SQLAlchemy models are imported (registered with
Base.metadata) before any test file calls Base.metadata.create_all().

Without this, if a test file's own imports happen to register only a
subset of models, create_all() silently creates only those tables —
causing "no such table" errors in other test modules.
"""

from __future__ import annotations

# Force-import all ORM models so Base.metadata is fully populated.
# Order matters: base models first (Trip, Activity, …), then user models
# (User, EmailVerificationToken, SearchHistory) which add FK columns.
import app.models.base     # noqa: F401 — Trip, Activity, ExpenseGroup, …
import app.models.user     # noqa: F401 — User, EmailVerificationToken, SearchHistory
import app.models.capsule  # noqa: F401 — Capsule, Memory

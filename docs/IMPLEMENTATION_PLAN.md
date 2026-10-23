# AI Travel Guide — Implementation Plan

## Project Overview

An intelligent, full-stack travel planning platform that plans, compares, manages and adapts trips.
All business logic runs in Python. The React frontend is a thin client.

---

## Task Checklist

### Phase 0 — Inspect and Plan ✅
- [x] Inspect project folder (empty)
- [x] Check Python version → Python 3.14.6
- [x] Check Node.js → Not installed, installing via winget
- [x] Check Git → 2.55.0 ✅
- [x] Initialize Git repository
- [x] Create AGENTS.md
- [x] Create .gitignore
- [x] Create .env.example
- [x] Create docs/IMPLEMENTATION_PLAN.md (this file)
- [x] Create docs/ARCHITECTURE.md
- [x] Create docs/ALGORITHMS.md

### Phase 1 — Foundation ✅ (In Progress)
- [x] Create backend folder structure
- [x] Create requirements.txt
- [x] Create Python virtual environment
- [x] Install Python dependencies
- [x] Create FastAPI app skeleton (main.py)
- [x] Create database models (Trip, Activity, User, Expense, Group)
- [x] Create Pydantic schemas
- [x] Create API routers (trips, activities, expenses, demo)
- [x] Seed demo data
- [x] Create frontend with Vite + React + TypeScript
- [x] Install frontend dependencies (Tailwind, Framer Motion, React Router, Lucide)
- [x] Create collapsible sidebar with all 13 navigation sections
- [x] Create Overview / Dashboard page
- [x] Create My Trips page (list + create form)
- [x] Create placeholder pages for all sections with "Coming soon" messages
- [x] Connect frontend to backend API
- [x] Run backend server
- [x] Run frontend dev server
- [x] Verify application works end-to-end
- [x] Run initial Pytest suite
- [x] Git commit: Phase 1 complete

### Phase 2 — Python Algorithms ⏳
- [ ] preference_scorer.py — score preferences → weighted activity list
- [ ] candidate_ranker.py — rank activities by preference, rating, cost, availability
- [ ] schedule_builder.py — build day-by-day schedule
- [ ] route_optimizer.py — minimize unnecessary travel
- [ ] budget_optimizer.py — maximize satisfaction within budget
- [ ] schedule_validator.py — detect overlaps, impossible timings
- [ ] plan_b_engine.py — handle disruptions
- [ ] expense_splitter.py — group expense settlement
- [ ] Connect algorithms to API endpoints
- [ ] Write Pytest tests for all algorithms
- [ ] Run tests, fix failures
- [ ] Git commit: Phase 2 complete

### Phase 3 — External Integrations ⏳
- [ ] Open-Meteo weather integration (free, no key)
- [ ] OpenRouteService geocoding + routing
- [ ] Exchangerate-api currency conversion
- [ ] Foursquare / Overpass places
- [ ] Amadeus flight search (test environment)
- [ ] Provider adapters with fallback to demo data
- [ ] Git commit: Phase 3 complete

### Phase 4 — Advanced Features ⏳
- [ ] AI Travel Assistant (Gemini / OpenAI / rule-based fallback)
- [ ] Live Mode (current-day schedule management)
- [ ] Trip Lab (compare scenarios)
- [ ] Offline support (service worker + cache)
- [ ] Safety & Emergency page
- [ ] Explore page (destination discovery)
- [ ] Git commit: Phase 4 complete

### Phase 5 — Test and Harden ⏳
- [ ] Full Pytest suite with coverage
- [ ] Frontend accessibility audit
- [ ] Responsive layout testing (mobile, tablet, desktop)
- [ ] Security review (CORS, input validation, no secrets in code)
- [ ] Performance review
- [ ] Complete README.md
- [ ] Complete KNOWN_LIMITATIONS.md
- [ ] Final Git commit

---

## Environment Summary

| Tool    | Version       | Status  |
|---------|---------------|---------|
| Python  | 3.14.6        | ✅      |
| pip     | 26.1.2        | ✅      |
| Node.js | Installing... | 🔄      |
| npm     | Installing... | 🔄      |
| Git     | 2.55.0        | ✅      |

---

## Key Decisions

1. **SQLite + SQLAlchemy** for local development. Clear migration path to PostgreSQL via `DATABASE_URL`.
2. **Demo mode** when API keys are absent. All demo data clearly labelled.
3. **INR default currency** in demo mode.
4. **Open-Meteo** for weather (free, no key required) as first integration.
5. **Python integer minor-currency units** for all money arithmetic.
6. **Decimal arithmetic** for exchange rates — never floating point.

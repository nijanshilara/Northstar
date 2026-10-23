# AGENTS.md — Northstar

This file governs how AI agents and engineers should interact with this codebase.
Read this file before writing or modifying any code.

---

## Project Purpose

**Northstar** ("Your compass to everywhere") is a full-stack, intelligent trip-planning platform.
It plans, compares, manages and adapts trips using real algorithms implemented in Python.

---

## Technology Stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Backend    | Python 3.12+, FastAPI, Pydantic, SQLAlchemy, SQLite     |
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Icons      | Lucide React                                            |
| Routing    | React Router v6                                         |
| HTTP       | HTTPX (backend), fetch/axios (frontend)                 |
| Testing    | Pytest (backend), Vitest (frontend)                     |
| DB         | SQLite (dev) → PostgreSQL (production)                  |
| VCS        | Git                                                     |

---

## Folder Structure

```
AI-Travel-Guide/
├── AGENTS.md               ← This file
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── ALGORITHMS.md
│   ├── PROVIDERS.md
│   └── KNOWN_LIMITATIONS.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/            ← FastAPI routers
│   │   ├── core/           ← Config, security, logging
│   │   ├── models/         ← SQLAlchemy ORM models
│   │   ├── schemas/        ← Pydantic schemas
│   │   ├── database/       ← DB engine, session, migrations
│   │   ├── services/       ← Business logic services
│   │   ├── algorithms/     ← Pure Python algorithms
│   │   │   ├── preference_scorer.py
│   │   │   ├── candidate_ranker.py
│   │   │   ├── schedule_builder.py
│   │   │   ├── route_optimizer.py
│   │   │   ├── budget_optimizer.py
│   │   │   ├── plan_b_engine.py
│   │   │   └── expense_splitter.py
│   │   └── integrations/   ← External API adapters
│   ├── tests/
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/     ← Reusable UI components
    │   ├── pages/          ← Page-level components
    │   ├── layouts/        ← Layout wrappers
    │   ├── hooks/          ← Custom React hooks
    │   ├── services/       ← API call functions
    │   ├── types/          ← TypeScript interfaces
    │   └── styles/         ← Global CSS / Tailwind config
    ├── public/
    ├── index.html
    ├── package.json
    └── vite.config.ts
```

---

## Coding Conventions

### Python (backend)
- Follow PEP 8. Max line length: 100 characters.
- Use type hints everywhere.
- Use Pydantic models for all request/response bodies.
- Never put business logic in route handlers — delegate to services or algorithms.
- Use `decimal.Decimal` for all money arithmetic.
- Use integer minor-currency units internally (e.g., paise, cents).
- Always include docstrings on public functions and classes.
- Never hardcode secrets or API keys.
- Prefix demo/sample data functions with `_demo_`.

### TypeScript / React (frontend)
- Use functional components and React hooks only.
- Define TypeScript interfaces for all API response shapes (in `types/`).
- Never call algorithms directly from the frontend — always go through the backend API.
- Never embed secrets or API keys in frontend code.
- Use `services/api.ts` as the single source of truth for backend calls.
- Components must handle loading, error and empty states.

### General rules
- Every button must perform its intended action or show a "Coming soon" message.
- Label all demo/sample data clearly with a badge or note.
- Label live, cached and estimated data separately.
- Never present historical climate data as a current forecast.
- Never claim a booking is confirmed unless a real payment provider confirms it.
- Never silently cancel reservations.
- Run tests before claiming a feature is complete.

---

## Safety Rules

1. Do not run `DROP`, `TRUNCATE` or broad `DELETE` without explicit user confirmation.
2. Do not delete unrelated files.
3. Do not overwrite existing files without reading them first.
4. Do not fabricate live prices, bookings, availability or reviews.
5. Do not apply significant itinerary changes without user approval.
6. Do not store API keys, passwords or secrets in source files or frontend code.
7. Do not claim to have run a test or verified integration unless you actually did so.
8. Keep the application working after every change.

---

## Environment Variables

All secrets go in `.env` (never committed). See `.env.example` for keys.

### Backend (`backend/.env`)
```
DATABASE_URL=sqlite:///./travel_guide.db
SECRET_KEY=change-me-in-production
OPENAI_API_KEY=
GEMINI_API_KEY=
WEATHER_API_KEY=
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
GOOGLE_MAPS_API_KEY=
EXCHANGE_RATE_API_KEY=
```

---

## Demo Mode

When API keys are absent the application runs in **Demo Mode**:
- All external data is replaced with clearly labelled sample data.
- A "DEMO DATA" badge appears where live data would normally appear.
- All algorithms continue to run using the sample data.
- The application must remain fully navigable in demo mode.

---

## Development Commands

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                    # Starts on http://localhost:5173
```

### Tests
```bash
cd backend
pytest tests/ -v
```

---

## Git Workflow

- Commit after each working phase or significant feature.
- Use descriptive commit messages: `feat: add preference scorer algorithm`.
- Never commit `.env`, `__pycache__`, `node_modules`, `*.db` or `venv/`.

---

## Phase Tracker

| Phase | Description                         | Status     |
|-------|-------------------------------------|------------|
| 0     | Inspect, plan, initialize           | ✅ Complete |
| 1     | Foundation + dashboard              | ✅ Complete |
| 2     | Python algorithms                   | ✅ Complete |
| 3     | Authentication & User Profiles      | ✅ Complete |
| 4     | Weather & AI Live Integrations      | ✅ Complete |
| 5     | Memory Capsules & Multimedia        | ✅ Complete |
| 6     | Audits (Splitwise, Weather, Budget) | ✅ Complete |
| 7     | AI Quality & Continuation Repair    | ✅ Complete |
| 8     | Deployment Readiness & Launch Audit | ✅ Complete |
| 9     | Destination-Aware Smart Itinerary   | ✅ Complete |

---

## Known Limitations (Updated Each Phase)

See `docs/KNOWN_LIMITATIONS.md` for the current list.

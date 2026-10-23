# 🧭 Northstar — Your Compass to Everywhere

**Northstar** is an intelligent, full-stack trip planning and journey management platform. It combines algorithmic itinerary generation, budget tracking, Splitwise group expense settlement, real-time worldwide weather forecasting, AI travel assistance, and private multimedia Memory Capsules.

---

## 📋 Table of Contents
1. [Architecture & Tech Stack](#-architecture--tech-stack)
2. [Prerequisites](#-prerequisites)
3. [Quick Start (1-Click Local Demo)](#-quick-start-1-click-local-demo)
4. [Manual Setup & Startup](#-manual-setup--startup)
5. [Environment Variables & Configuration](#-environment-variables--configuration)
6. [AI Provider & Demo Mode](#-ai-provider--demo-mode)
7. [Database & Media Persistence](#-database--media-persistence)
8. [Backup & Restore Guide](#-backup--restore-guide)
9. [Troubleshooting Common Issues](#-troubleshooting-common-issues)
10. [Stopping Services Safely](#-stopping-services-safely)
11. [Public Deployment Guide](#-public-deployment-guide)

---

## 🛠 Architecture & Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons | Responsive modern SPA with Glassmorphic UI & dark mode |
| **Backend** | Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy | Async REST API with pure Python algorithms |
| **Database** | SQLite (`backend/travel_guide.db`) | Local ACID relational persistence |
| **File Storage**| Local Filesystem (`backend/uploads/`) | Isolated, authenticated media storage for Memory Capsules |
| **Weather** | Open-Meteo REST API | Worldwide weather forecasts without mandatory API keys |
| **AI Engine** | Google Gemini (`google-genai` SDK) / OpenAI | Live assistant with fallback to offline curated knowledge |

---

## 💻 Prerequisites

Ensure your system has the following installed:
- **Python**: Version `3.12` or higher (`python --version`)
- **Node.js**: Version `18.0.0` or higher (`node --version`)
- **npm**: Version `9.0.0` or higher (`npm --version`)
- **Operating System**: Windows 10/11, macOS, or Linux

---

## 🚀 Quick Start (1-Click Local Demo)

For Windows users, launch both backend and frontend servers with a single command:

```cmd
# Double-click or run from Command Prompt / PowerShell:
start_local_demo.bat
```

Or via PowerShell:
```powershell
.\start_local_demo.ps1
```

This launcher will:
1. Detect Python and Node.js.
2. Initialize `backend/.env` from `.env.example` if not already present.
3. Start the FastAPI backend on `http://localhost:8000`.
4. Start the Vite React frontend on `http://localhost:5173`.
5. Automatically open `http://localhost:5173` in your default browser.

---

## 🔧 Manual Setup & Startup

If you prefer to start each service manually or are on macOS/Linux:

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (Python 3.12+)
python -m venv venv

# Activate virtual environment
# Windows (cmd/PowerShell):
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your .env configuration
cp .env.example .env

# Start FastAPI backend
uvicorn app.main:app --reload --port 8000
```
Backend API will be running at: `http://localhost:8000`  
Interactive Swagger API documentation: `http://localhost:8000/docs`

### 2. Frontend Setup

In a separate terminal window:

```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
```
Frontend application will be accessible at: `http://localhost:5173`

---

## 🔐 Environment Variables & Configuration

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`. All secret keys must remain in `.env` and are strictly excluded from Git:

```env
# Application Environment (development | production)
ENVIRONMENT=development

# Database URL (SQLite relative paths automatically resolve to backend/travel_guide.db)
DATABASE_URL=sqlite:///./travel_guide.db

# Authentication Secret (Must be 32+ characters in production)
SECRET_KEY=change-me-in-production-use-a-strong-secret-key-32chars

# Cookie Security (Set to True when served over HTTPS)
COOKIE_SECURE=False

# Allowed CORS Origins (comma-separated URLs)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# AI Provider Keys (Optional: leaves app in Demo/Curated mode if blank)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

### Frontend (`frontend/.env`)

For local development or when frontend and backend share the same domain/proxy, no extra configuration is required (defaults to `/api`).

For split deployments where backend is hosted on a separate public domain:
```env
VITE_API_BASE_URL=https://your-api-domain.com/api
```

---

## 🤖 AI Provider & Demo Mode

The application supports both live generative AI and an offline travel knowledge engine:

- **Configured Model**: Google Gemini (`gemini-3.8-flash` primary).
- **Fallback Chain**: `gemini-3.8-flash` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-flash-lite-latest` → `gemini-flash-latest`.
- **Demo Mode**: If neither `GEMINI_API_KEY` nor `OPENAI_API_KEY` is set, or if live API quotas are exhausted:
  - The application automatically activates **Offline Curated Mode**.
  - All responses are clearly labelled with truthful attribution (`is_ai: false`, `Offline Guide`).
  - Core features (weather forecasts, Splitwise settlements, itineraries, budgets, memory capsules) remain 100% functional without paid API keys.
- **Quota & Token Limits**: If an AI response reaches output token limits, the engine executes a bounded continuation. If still bounded, it honestly appends a clear truncation note rather than abruptly cutting off.

---

## 💾 Database & Media Persistence

- **Database**: Stored at `backend/travel_guide.db`. The application uses an absolute path resolver (`resolved_database_url`) so launching from the root directory or `backend/` always binds to the same database.
- **Uploaded Media**: Memory Capsule photos and videos are stored under `backend/uploads/`.
- **Data Protection**: Both `backend/travel_guide.db` and files in `backend/uploads/*` (except `.gitkeep`) are excluded from Git to prevent accidental leaks.

---

## 📦 Backup & Restore Guide

A dedicated backup script is provided in `scripts/backup.py` to create hot, transactionally consistent snapshots of both the database and uploaded media.

### Create a Snapshot Backup

```cmd
# Windows 1-Click:
scripts\backup.bat

# Or via Python:
python scripts/backup.py
```

This creates a timestamped folder inside `backups/snapshot_YYYYMMDD_HHMMSS/` containing:
- `travel_guide.db` (clean SQLite backup taken via the SQLite Backup API).
- `uploads/` (all memory capsule media).
- `metadata.txt` (snapshot timestamp and record counts).

### Restore from a Snapshot

```bash
python scripts/backup.py --restore backups/snapshot_YYYYMMDD_HHMMSS
```
*Note: Restore will ask for explicit confirmation before replacing existing files.*

---

## ❓ Troubleshooting Common Issues

### 1. Port 8000 or 5173 is already in use
- Run `stop_local_demo.bat` to terminate lingering processes.
- Or check listening ports manually:
  ```cmd
  netstat -ano | findstr :8000
  taskkill /PID <PID> /F
  ```

### 2. Working Directory Mismatch
- The database is guaranteed to point to `backend/travel_guide.db`. If you see an empty database, ensure you did not accidentally launch a secondary backend process targeting a different folder.

### 3. Missing Dependencies
- Backend: Activate your virtual environment and run `pip install -r requirements.txt`.
- Frontend: Run `npm install` inside the `frontend/` directory.

### 4. Authentication / Session Cookie Not Saved
- Ensure you access the frontend via `http://localhost:5173` rather than `http://127.0.0.1:5173` if your CORS origin is set to `localhost`.
- If `COOKIE_SECURE=True` is set in development without HTTPS, your browser will reject the cookie. Keep `COOKIE_SECURE=False` for local HTTP development.

---

## 🛑 Stopping Services Safely

- **If launched via `start_local_demo.bat`**: Simply close the two opened command prompt windows, or press `Ctrl + C` in each window.
- **Windows quick stop script**: Run `stop_local_demo.bat` to automatically terminate background listeners on ports 8000 and 5173.

---

## 🌐 Public Deployment Guide

If deploying the application to a public cloud environment (e.g. Render, Railway, Fly.io, DigitalOcean, AWS):

### 1. Production Security Settings
In your production `backend/.env`:
1. Set `ENVIRONMENT=production`.
2. Generate a cryptographically strong 32+ character key for `SECRET_KEY`:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
3. Set `COOKIE_SECURE=True` to enforce HTTPS cookies.
4. Set `CORS_ORIGINS=https://your-frontend-domain.com`.

### 2. Persistent Storage (CRITICAL WARNING)
> [!WARNING]
> **Ephemeral Storage Warning**: Container-based cloud providers (e.g., standard Render web services, Heroku, standard containers) have **ephemeral filesystems**. Any changes to SQLite (`travel_guide.db`) or media uploads in `backend/uploads/` will be **permanently lost** whenever a dyno restarts or a new build is deployed.
> 
> **To achieve true data persistence in production:**
> - Attach a **Persistent Disk / Volume** mounted to `/app/backend/` and `/app/backend/uploads/`.
> - OR configure `DATABASE_URL` to point to a managed PostgreSQL database (e.g. Neon, Supabase, AWS RDS) and configure media uploads to an S3-compatible object store.

### 3. Production Build
```bash
# Build frontend static bundle
cd frontend
npm run build
# The compiled production assets will be in frontend/dist/
```

### 4. Running Backend in Production
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## 🧪 Testing

Run backend tests:
```bash
cd backend
pytest tests/ -v
```

Run frontend tests:
```bash
cd frontend
npm test -- --run
```

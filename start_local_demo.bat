@echo off
REM ============================================================================
REM Northstar — Local Demo Startup Script (Windows)
REM "Your compass to everywhere."
REM Launches both FastAPI Backend (port 8000) and React Frontend (port 5173)
REM ============================================================================

setlocal
cd /d "%~dp0"

echo ============================================================
echo   Northstar - Your compass to everywhere
echo   Local Demo Launcher
echo ============================================================
echo.

REM 1. Detect Python
set "PYTHON_EXE="
if exist "backend\venv312\Scripts\python.exe" (
    set "PYTHON_EXE=backend\venv312\Scripts\python.exe"
) else if exist "backend\venv\Scripts\python.exe" (
    set "PYTHON_EXE=backend\venv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON_EXE=python"
)

if "%PYTHON_EXE%"=="" (
    echo [ERROR] Python not found. Please install Python 3.12+ or activate your venv.
    pause
    exit /b 1
)
echo [*] Detected Python: %PYTHON_EXE%

REM 2. Detect Node.js & npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npm not found. Please install Node.js 18+.
    pause
    exit /b 1
)
echo [*] Detected Node.js / npm

REM 3. Check backend .env
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo [*] backend\.env not found. Creating from backend\.env.example...
        copy "backend\.env.example" "backend\.env" >nul
        echo [!] Default backend\.env created in Demo Mode.
    )
)

REM 4. Launch Backend in a dedicated window
echo [*] Starting Northstar FastAPI Backend on http://localhost:8000 ...
start "Northstar - Backend API" cmd /k "cd /d "%~dp0backend" && "..\%PYTHON_EXE%" -m uvicorn app.main:app --reload --port 8000"

REM 5. Launch Frontend in a dedicated window
echo [*] Starting Northstar React Frontend on http://localhost:5173 ...
start "Northstar - Frontend UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM 6. Wait 3 seconds and launch the browser
timeout /t 3 /nobreak >nul
echo [*] Opening application in your web browser: http://localhost:5173 ...
start "" "http://localhost:5173"

echo.
echo ============================================================
echo   NORTHSTAR IS RUNNING!
echo   - Web App:  http://localhost:5173
echo   - API Docs: http://localhost:8000/docs
echo.
echo   To stop Northstar, simply close the two open server windows,
echo   or run stop_local_demo.bat.
echo ============================================================
echo.
pause

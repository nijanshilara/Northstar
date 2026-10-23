@echo off
REM ============================================================================
REM Northstar — Stop Local Demo (Windows)
REM "Your compass to everywhere."
REM Gracefully stops uvicorn and vite processes listening on ports 8000 and 5173
REM ============================================================================

setlocal
echo ============================================================
echo   Stopping Northstar Services...
echo ============================================================
echo.

REM Stop port 8000 (Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo [*] Terminating Backend process on port 8000 (PID: %%a)...
    taskkill /F /T /PID %%a >nul 2>&1
)

REM Stop port 5173 (Frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo [*] Terminating Frontend process on port 5173 (PID: %%a)...
    taskkill /F /T /PID %%a >nul 2>&1
)

echo.
echo [*] Northstar services stopped successfully.
pause

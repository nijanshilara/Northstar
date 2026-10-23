@echo off
REM ============================================================================
REM Northstar — Safe Backup Script (Windows)
REM "Your compass to everywhere."
REM Creates a hot snapshot of travel_guide.db and Memory Capsule uploaded media
REM ============================================================================

setlocal
cd /d "%~dp0\.."

if exist "backend\venv312\Scripts\python.exe" (
    set "PYTHON_EXE=backend\venv312\Scripts\python.exe"
) else if exist "backend\venv\Scripts\python.exe" (
    set "PYTHON_EXE=backend\venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [*] Northstar Backup Utility — Using Python: %PYTHON_EXE%
%PYTHON_EXE% scripts\backup.py %*

pause

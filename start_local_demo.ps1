# ============================================================================
# Northstar — Local Demo Startup Script (PowerShell)
# "Your compass to everywhere."
# Launches both FastAPI Backend (port 8000) and React Frontend (port 5173)
# ============================================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Northstar — Your compass to everywhere" -ForegroundColor Cyan
Write-Host "  Local Demo Launcher" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Detect Python
$PythonExe = $null
if (Test-Path "$Root\backend\venv312\Scripts\python.exe") {
    $PythonExe = "$Root\backend\venv312\Scripts\python.exe"
} elseif (Test-Path "$Root\backend\venv\Scripts\python.exe") {
    $PythonExe = "$Root\backend\venv\Scripts\python.exe"
} else {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { $PythonExe = "python" }
}

if (-not $PythonExe) {
    Write-Host "[ERROR] Python 3.12+ not found." -ForegroundColor Red
    Exit 1
}
Write-Host "[*] Using Python: $PythonExe" -ForegroundColor Green

# 2. Check Node / npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "[ERROR] Node.js / npm not found. Please install Node.js 18+." -ForegroundColor Red
    Exit 1
}
Write-Host "[*] Node.js / npm detected" -ForegroundColor Green

# 3. Environment check
if (-not (Test-Path "$Root\backend\.env")) {
    if (Test-Path "$Root\backend\.env.example") {
        Copy-Item "$Root\backend\.env.example" "$Root\backend\.env"
        Write-Host "[!] Created default backend\.env in Demo Mode." -ForegroundColor Yellow
    }
}

# 4. Start Backend
Write-Host "[*] Starting Northstar FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k cd /d `"$Root\backend`" && `"$PythonExe`" -m uvicorn app.main:app --reload --port 8000" -WindowStyle Normal

# 5. Start Frontend
Write-Host "[*] Starting Northstar React Frontend on http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k cd /d `"$Root\frontend`" && npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3
Write-Host "[*] Launching browser: http://localhost:5173" -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "NORTHSTAR IS RUNNING!" -ForegroundColor Green
Write-Host "Close the two console windows or run .\stop_local_demo.bat when finished." -ForegroundColor Yellow

# start-dev.ps1
# Launches project services and stores their PIDs

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".dev-pids.json"

# EDIT if needed
$MlVenvActivate = "C:\Users\bryso\ml-env\.venv\Scripts\Activate.ps1"

Write-Host "Starting dev services..."

function Start-TrackedProcess($Title, $Command) {
    $proc = Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$Host.UI.RawUI.WindowTitle='$Title'; $Command"
    ) -PassThru
    return $proc.Id
}

$pids = @{}

# Backend API
$pids.backend = Start-TrackedProcess `
    "Backend API (server.js)" `
    "cd `"$Root\backend`"; node server.js"

# Worker
$pids.worker = Start-TrackedProcess `
    "Worker (worker.js)" `
    "cd `"$Root\backend`"; node worker.js"

# Stripe listener
$pids.stripe = Start-TrackedProcess `
    "Stripe Listen" `
    "cd `"$Root`"; stripe listen --forward-to http://localhost:5000/webhook"

# ML scoring service
$pids.ml = Start-TrackedProcess `
    "ML API (uvicorn :8000)" `
    "cd `"$Root\ml`"; . `"$MlVenvActivate`"; uvicorn score_service:app --host 0.0.0.0 --port 8000"

# Frontend
$pids.frontend = Start-TrackedProcess `
    "Frontend (Vite :5173)" `
    "cd `"$Root\frontend`"; npm run dev"

# Save PIDs
$pids | ConvertTo-Json | Set-Content $PidFile

Write-Host "✅ All services started."
Write-Host "PID file saved to $PidFile"

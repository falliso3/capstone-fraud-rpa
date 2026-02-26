# stop-dev.ps1
# Stops ONLY processes started by start-dev.ps1

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".dev-pids.json"

if (-Not (Test-Path $PidFile)) {
    Write-Host "No PID file found. Nothing to stop."
    exit
}

$pids = Get-Content $PidFile | ConvertFrom-Json

Write-Host "Stopping project services..."

foreach ($key in $pids.PSObject.Properties.Name) {
    $pid = $pids.$key
    try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "Stopped $key (PID $pid)"
    } catch {
        Write-Host "$key (PID $pid) already stopped."
    }
}

Remove-Item $PidFile -ErrorAction SilentlyContinue

Write-Host "✅ Project services stopped."

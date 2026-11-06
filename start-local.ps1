$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"
$python = Join-Path $backendPath ".venv\Scripts\python.exe"
$supervisorScript = Join-Path $PSScriptRoot "backend-supervisor.ps1"
$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$postgresData = Join-Path $PSScriptRoot ".local\postgres"

function Test-Endpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not (Test-Path $pgCtl)) { throw "PostgreSQL 18 was not found at $pgCtl." }
if (-not (Test-Path $postgresData)) { throw "Local PostgreSQL data directory was not found at $postgresData." }
if (-not (Test-Path $python)) { throw "Backend virtual environment is missing. Create backend\.venv and install backend requirements first." }
if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) { throw "Frontend dependencies are missing. Run npm install from frontend first." }

& $pgCtl -D $postgresData status *> $null
if ($LASTEXITCODE -ne 0) {
    & $pgCtl -D $postgresData -l (Join-Path $PSScriptRoot ".local\postgres.log") -o "-h 127.0.0.1 -p 5432" -w start
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL could not start." }
}

$backendHealthUrl = "http://127.0.0.1:8000/health"
if (-not (Test-Endpoint $backendHealthUrl)) {
    $backendListener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($backendListener) {
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($backendListener[0].OwningProcess)" -ErrorAction SilentlyContinue
        if ($listenerProcess -and $listenerProcess.CommandLine -match "uvicorn.*main:app") {
            Write-Host "Replacing an unresponsive SmartSpace API process..."
            & taskkill.exe /PID $listenerProcess.ProcessId /T /F *> $null
            Start-Sleep -Seconds 1
        } else {
            throw "Port 8000 is already in use by another process, and the SmartSpace API health check failed. The unrelated process was left untouched."
        }
    }

    $remainingListener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($remainingListener) { throw "Port 8000 did not become available after stopping the unresponsive API process." }

    Push-Location $backendPath
    try {
        & $python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Database migration failed; the API was not started." }

    } finally {
        Pop-Location
    }

}

$supervisor = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*backend-supervisor.ps1*" } |
    Select-Object -First 1
if (-not $supervisor) {
    Write-Host "Starting the background API watchdog (auto-restarts the backend if it stops)..."
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $supervisorScript) `
        -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
}

if (-not (Test-Endpoint $backendHealthUrl)) {
    $backendReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-Endpoint $backendHealthUrl) { $backendReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $backendReady) {
        $stderr = Get-ChildItem (Join-Path $PSScriptRoot ".local\backend-*.err.log") -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($stderr) { Get-Content $stderr.FullName -Tail 30 | Write-Host }
        throw "SmartSpace API did not become healthy within 30 seconds. Check .local\backend-supervisor.log and the latest .local\backend-*.err.log."
    }
}

if (Test-Endpoint $backendHealthUrl) {
    Write-Host "SmartSpace API is healthy at http://127.0.0.1:8000 (automatic restart enabled)."
} else {
    throw "SmartSpace API stopped before the frontend could start."
}

$frontendUrl = "http://127.0.0.1:5173"
if (Test-Endpoint "$frontendUrl/@vite/client") {
    Write-Host "Frontend is already running at $frontendUrl. API proxy is ready."
    return
}

Write-Host "Starting frontend at $frontendUrl. Keep this window open while using the app."
Push-Location $frontendPath
try {
    & npm.cmd run dev -- --host 127.0.0.1
    if ($LASTEXITCODE -ne 0) { throw "Frontend exited with an error." }
} finally {
    Pop-Location
}

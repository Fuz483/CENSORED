$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$backendPath = Join-Path $root "backend"
$python = Join-Path $backendPath ".venv\Scripts\python.exe"
$statePath = Join-Path $root ".local"
$logPath = Join-Path $statePath "backend-supervisor.log"
$healthUrl = "http://127.0.0.1:8000/health"
$checkIntervalSeconds = 3
$maxUnhealthyChecks = 3
$backendProcess = $null
$unhealthyChecks = 0

New-Item -ItemType Directory -Path $statePath -Force | Out-Null

function Write-SupervisorLog([string]$Message) {
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logPath -Value $line
}

function Test-ApiHealth {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        return $response.status -eq "ok" -and $response.service -eq "SmartSpace Backend v2.0"
    } catch {
        return $false
    }
}

function Get-ApiListener {
    $listener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { return $null }
    return Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
}

function Start-ApiProcess {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $stdoutPath = Join-Path $statePath "backend-$timestamp.out.log"
    $stderrPath = Join-Path $statePath "backend-$timestamp.err.log"
    $process = Start-Process -FilePath $python `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $backendPath -PassThru `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Write-SupervisorLog "Started API process PID $($process.Id); stdout: $stdoutPath; stderr: $stderrPath"
    return $process
}

function Stop-ApiProcessTree {
    param([System.Diagnostics.Process]$Process)

    if ($Process) {
        & taskkill.exe /PID $Process.Id /T /F *> $null
    }

    # The Windows venv launcher may spawn the actual Python process. If its
    # parent has already exited, also stop only the uvicorn process listening
    # on our API port, never an unrelated process.
    $listenerProcess = Get-ApiListener
    if ($listenerProcess -and $listenerProcess.CommandLine -match "uvicorn") {
        & taskkill.exe /PID $listenerProcess.ProcessId /T /F *> $null
    }
}

if (-not (Test-Path $python)) {
    Write-SupervisorLog "Backend Python environment is missing at $python; supervisor stopped."
    exit 1
}

# Prevent duplicate watchdogs if the local launcher is run more than once.
$lockPath = Join-Path $statePath "backend-supervisor.pid"
if (Test-Path $lockPath) {
    $oldPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw -ErrorAction SilentlyContinue), [ref]$oldPid)
    $oldProcess = if ($oldPid -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId = $oldPid" -ErrorAction SilentlyContinue } else { $null }
    if ($oldProcess -and $oldProcess.CommandLine -like "*backend-supervisor.ps1*") {
        Write-SupervisorLog "Another supervisor is already running as PID $oldPid; exiting duplicate."
        exit 0
    }
}
Set-Content -LiteralPath $lockPath -Value $PID
Write-SupervisorLog "Watchdog started as PID $PID."

try {
    while ($true) {
        if ($backendProcess) {
            $backendProcess.Refresh()
            if ($backendProcess.HasExited) {
                Write-SupervisorLog "API process PID $($backendProcess.Id) exited with code $($backendProcess.ExitCode). Restarting."
                $backendProcess = $null
                $unhealthyChecks = 0
                Start-Sleep -Seconds 2
                continue
            }

            if (Test-ApiHealth) {
                $unhealthyChecks = 0
            } else {
                $unhealthyChecks++
                if ($unhealthyChecks -ge $maxUnhealthyChecks) {
                    Write-SupervisorLog "API health check failed $unhealthyChecks times; restarting PID $($backendProcess.Id)."
                    Stop-ApiProcessTree -Process $backendProcess
                    $backendProcess = $null
                    $unhealthyChecks = 0
                    Start-Sleep -Seconds 2
                    continue
                }
            }
        } elseif (Test-ApiHealth) {
            $listenerProcess = Get-ApiListener
            if ($listenerProcess -and $listenerProcess.CommandLine -match "uvicorn") {
                try {
                    $backendProcess = [System.Diagnostics.Process]::GetProcessById([int]$listenerProcess.ProcessId)
                    Write-SupervisorLog "Adopted healthy API process PID $($backendProcess.Id)."
                } catch {
                    Write-SupervisorLog "Could not attach to healthy API process; will retry."
                }
            }
        } else {
            $listenerProcess = Get-ApiListener
            if ($listenerProcess) {
                Write-SupervisorLog "Port 8000 is occupied by PID $($listenerProcess.ProcessId), but it is not the SmartSpace API; waiting without terminating it."
            } else {
                try {
                    $backendProcess = Start-ApiProcess
                    $unhealthyChecks = 0
                } catch {
                    Write-SupervisorLog "Could not start API: $($_.Exception.Message)"
                    Start-Sleep -Seconds 2
                }
            }
        }

        Start-Sleep -Seconds $checkIntervalSeconds
    }
} finally {
    $lockContents = Get-Content -LiteralPath $lockPath -Raw -ErrorAction SilentlyContinue
    if ($lockContents -and $lockContents.Trim() -eq "$PID") {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
    Write-SupervisorLog "Watchdog stopped."
}

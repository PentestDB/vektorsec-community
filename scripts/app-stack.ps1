# ============================================================================
#  VektorSec - desktop app <-> Docker stack switcher (Windows)
# ----------------------------------------------------------------------------
#  The packaged app (release\unpack\VektorSec.exe) and both compose files need
#  the SAME ports (3001 gateway, 8081 backend, 27017 MongoDB, 6379 Redis), so
#  only one of them can run at a time. Starting the app while Docker is up makes
#  the app's gateway die with EADDRINUSE and its backend attach to the Docker
#  database - the login then fails with a confusing HTTP 401.
#
#  This script flips modes safely:
#    up      stop the Docker stacks -> start the app's portable MongoDB/Redis
#            -> launch release\unpack\VektorSec.exe -> wait for /api/ready
#    down    close the app -> stop its portable MongoDB/Redis -> verify ports
#    status  show processes, listening ports and Docker containers
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 up
#    powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 up -Force
#    powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 status
#    powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 down
#
#  -Force  also kills leftover processes (VektorSec.exe + the portable
#          mongod/redis under %APPDATA%\VektorSec\runtime) when a port is stuck.
#  -Exe    launch a specific build (default: release\unpack\VektorSec.exe).
#
#  Back to Docker:  scripts\docker-stack.ps1 up
# ============================================================================

[CmdletBinding()]
param(
  [ValidateSet("up", "down", "status")]
  [string]$Action = "up",

  [string]$Exe = "",

  [switch]$Force,

  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$AppDataDir = Join-Path $env:APPDATA "VektorSec"
$ScriptsDir = Join-Path $RepoRoot "scripts"
$FrontendUrl = "http://127.0.0.1:3001"
$ReadyUrl = "$FrontendUrl/api/ready"
$ServicePorts = @(3001, 8081)
$AllPorts = @(3001, 8081, 27017, 6379)

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    !!  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "    XX  $Message" -ForegroundColor Red }

function Invoke-NativeCapture {
  # PowerShell 5.1 turns native stderr into NativeCommandError when
  # $ErrorActionPreference is 'Stop'; docker/db servers write there.
  param([string]$FilePath, [string[]]$Arguments)

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $raw = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
  } catch {
    $raw = $_.Exception.Message
    $code = 1
  } finally {
    $ErrorActionPreference = $previous
  }

  $lines = @()
  if ($null -ne $raw) { $lines = @($raw | ForEach-Object { "$_" }) }
  return [pscustomobject]@{ ExitCode = $code; Output = $lines }
}

function Get-PortListener([int]$Port) {
  return (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1)
}

function Test-PortOpen([int]$Port) {
  return [bool](Get-PortListener $Port)
}

function Get-BusyPorts([int[]]$Ports) {
  return @($Ports | Where-Object { Test-PortOpen $_ })
}

function Format-PortOwners([int[]]$Ports) {
  $rows = @()
  foreach ($port in $Ports) {
    $listener = Get-PortListener $port
    if (-not $listener) { continue }
    $processName = "?"
    try {
      $processName = (Get-Process -Id $listener.OwningProcess -ErrorAction Stop).ProcessName
    } catch {
      $processName = "pid $($listener.OwningProcess)"
    }
    $rows += "    $port <- $processName (pid $($listener.OwningProcess))"
  }
  return $rows
}

function Resolve-AppExe {
  if ($Exe) {
    if (-not (Test-Path $Exe)) { throw "VektorSec.exe not found: $Exe" }
    return (Resolve-Path -LiteralPath $Exe).Path
  }

  $releaseDir = Join-Path $RepoRoot "release"
  $candidates = @()
  if (Test-Path $releaseDir) {
    $candidates = @(Get-ChildItem -Path $releaseDir -Recurse -Filter "VektorSec.exe" -ErrorAction SilentlyContinue)
  }

  if ($candidates.Count -eq 0) {
    throw "VektorSec.exe not found under release\. Build it first: npm run package:win:nosign"
  }

  # `release\win-unpacked` (fresh electron-builder output) and `release\unpack`
  # (a hand-unpacked copy) can both exist; the newest binary is the real one -
  # otherwise a rebuild would be silently ignored in favour of the stale folder.
  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Invoke-LocalDb([string]$LocalDbAction) {
  $script = Join-Path $ScriptsDir "local-db.ps1"
  $result = Invoke-NativeCapture -FilePath "powershell" -Arguments @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $script, $LocalDbAction
  )
  foreach ($line in $result.Output) { if ($line.Trim()) { Write-Host "    $line" -ForegroundColor DarkGray } }
  return $result.ExitCode
}

function Stop-DockerStacks {
  $result = Invoke-NativeCapture -FilePath "docker" -Arguments @("ps", "--format", "{{.Names}}|{{.Ports}}")
  if ($result.ExitCode -ne 0) {
    Write-Ok "Docker engine not running - nothing to stop"
    return
  }

  $holders = @($result.Output | Where-Object { $_ -match ':(3001|8081|27017|6379)->' })
  if ($holders.Count -eq 0) {
    Write-Ok "no docker container publishes 3001/8081/27017/6379"
    return
  }

  foreach ($holder in $holders) { Write-Host "    $holder" -ForegroundColor DarkGray }

  foreach ($file in @("docker-compose.dev.yml", "docker-compose.yml")) {
    $compose = Join-Path $RepoRoot $file
    if (-not (Test-Path $compose)) { continue }
    Write-Step "docker compose -f $file down"
    $down = Invoke-NativeCapture -FilePath "docker" -Arguments @("compose", "-f", $compose, "down")
    foreach ($line in $down.Output) {
      if ($line -match "Stopping|Stopped|Removing|Removed|Error|error") {
        Write-Host "    $line" -ForegroundColor DarkGray
      }
    }
  }
}

function Stop-StrayProcesses {
  $killed = @()

  foreach ($process in @(Get-Process -Name "VektorSec" -ErrorAction SilentlyContinue)) {
    try {
      $process.CloseMainWindow() | Out-Null
      Start-Sleep -Milliseconds 800
      if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
      $killed += "VektorSec (pid $($process.Id))"
    } catch {
      # already gone
    }
  }

  # Only touch the app's own portable servers, never a user-installed mongod.
  foreach ($name in @("mongod", "redis-server")) {
    foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      $path = ""
      try { $path = $process.Path } catch { $path = "" }
      if ($path -and $path.StartsWith($AppDataDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        try {
          Stop-Process -Id $process.Id -Force
          $killed += "$name (pid $($process.Id))"
        } catch {
          # already gone
        }
      }
    }
  }

  if ($killed.Count -gt 0) { Write-Ok "stopped: $($killed -join ', ')" }
  else { Write-Ok "no stray VektorSec/mongod/redis process found" }
  Start-Sleep -Milliseconds 600
}

function Test-OurDatabase([int[]]$Ports) {
  # The database ports may already be open: scripts/local-db.ps1 started them
  # (fine, we reuse) or something else owns them - typically the Docker stack,
  # which would silently pull the app onto the *Docker* database.
  foreach ($port in $Ports) {
    $listener = Get-PortListener $port
    if (-not $listener) { continue }
    $path = ""
    try { $path = (Get-Process -Id $listener.OwningProcess -ErrorAction Stop).Path } catch { $path = "" }
    if (-not ($path -and $path.StartsWith($AppDataDir, [System.StringComparison]::OrdinalIgnoreCase))) {
      return $false
    }
  }
  return $true
}

function Wait-HttpOk([string]$Url, [int]$Timeout = 180) {
  $deadline = (Get-Date).AddSeconds($Timeout)
  $lastError = "no response yet"
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return $true }
      $lastError = "status $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 3
  }
  Write-Fail "$Url not ready after ${Timeout}s ($lastError)"
  return $false
}

function Show-Status {
  Write-Step "Processes"
  $app = @(Get-Process -Name "VektorSec" -ErrorAction SilentlyContinue)
  if ($app.Count -gt 0) { Write-Ok "VektorSec.exe running (pid $($app[0].Id))" } else { Write-Warn2 "VektorSec.exe is not running" }

  $mongo = @(Get-Process -Name "mongod" -ErrorAction SilentlyContinue)
  if ($mongo.Count -gt 0) { Write-Ok "mongod running (pid $($mongo[0].Id))" } else { Write-Warn2 "mongod is not running" }

  $redis = @(Get-Process -Name "redis-server" -ErrorAction SilentlyContinue)
  if ($redis.Count -gt 0) { Write-Ok "redis-server running (pid $($redis[0].Id))" } else { Write-Warn2 "redis-server is not running" }

  Write-Step "Ports"
  foreach ($port in $AllPorts) {
    $listener = Get-PortListener $port
    if ($listener) { Write-Ok "$port listened on $($listener.LocalAddress) (pid $($listener.OwningProcess))" }
    else { Write-Warn2 "$port is not listening" }
  }

  Write-Step "Docker containers holding our ports"
  $result = Invoke-NativeCapture -FilePath "docker" -Arguments @("ps", "--format", "{{.Names}}|{{.Ports}}")
  if ($result.ExitCode -ne 0) {
    Write-Ok "docker engine not running"
  } else {
    $holders = @($result.Output | Where-Object { $_ -match ':(3001|8081|27017|6379)->' })
    if ($holders.Count -eq 0) { Write-Ok "none" } else { $holders | ForEach-Object { Write-Warn2 $_ } }
  }

  Write-Step "Gateway HTTP"
  try {
    $response = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 20
    Write-Ok "GET $FrontendUrl -> $($response.StatusCode)"
  } catch {
    Write-Fail "GET $FrontendUrl failed: $($_.Exception.Message)"
  }
  try {
    $response = Invoke-WebRequest -Uri $ReadyUrl -UseBasicParsing -TimeoutSec 20
    Write-Ok "GET $ReadyUrl -> $($response.StatusCode) $($response.Content)"
  } catch {
    Write-Fail "GET $ReadyUrl failed: $($_.Exception.Message)"
  }

  Write-Host ""
  Write-Host "App credentials: see release\note.txt (admin@vektorsec.local)" -ForegroundColor White
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
Set-Location $RepoRoot

switch ($Action) {
  "up" {
    Write-Step "VektorSec desktop-app mode"
    $appExe = Resolve-AppExe
    Write-Ok "executable: $appExe"

    $running = @(Get-Process -Name "VektorSec" -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
      Write-Warn2 "VektorSec.exe is already running (pid $($running[0].Id))"
      if (Wait-HttpOk -Url $ReadyUrl -Timeout 30) {
        Write-Host "VektorSec app is up: $FrontendUrl" -ForegroundColor Green
        exit 0
      }
      if (-not $Force) {
        Write-Host "    the running app is not answering - rerun with -Force to restart it" -ForegroundColor DarkGray
        exit 1
      }
      Stop-StrayProcesses
    }

    Stop-DockerStacks

    # Only 3001/8081 are hard conflicts: they are the app's own gateway/backend.
    # 27017/6379 may already be up (scripts/local-db.ps1) and are reused.
    $busy = Get-BusyPorts $ServicePorts
    if ($busy.Count -gt 0) {
      Write-Fail "ports still in use: $($busy -join ', ')"
      Format-PortOwners $busy | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
      if (-not $Force) {
        Write-Host "    close those processes, or rerun with -Force to stop the app's own leftovers" -ForegroundColor DarkGray
        exit 1
      }
      Stop-StrayProcesses
      $busy = Get-BusyPorts $ServicePorts
      if ($busy.Count -gt 0) {
        Write-Fail "ports still in use after -Force: $($busy -join ', ')"
        Format-PortOwners $busy | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
        exit 1
      }
    }
    Write-Ok "3001/8081 are free"

    $dbBusy = Get-BusyPorts @(27017, 6379)
    if ($dbBusy.Count -gt 0) {
      if (Test-OurDatabase $dbBusy) {
        Write-Ok "database already running on $($dbBusy -join ', ') - reusing it"
      } else {
        Write-Fail "another MongoDB/Redis owns $($dbBusy -join ', ') (Docker stack?)"
        Format-PortOwners $dbBusy | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
        Write-Host "    the app would read the wrong database (login fails with 401)" -ForegroundColor DarkGray
        if (-not $Force) { exit 1 }
        Stop-StrayProcesses
      }
    }

    Write-Step "Starting the app's portable MongoDB + Redis"
    $dbCode = Invoke-LocalDb "start"
    if ($dbCode -ne 0) { Write-Warn2 "local-db.ps1 start reported a problem (exit $dbCode)" }

    # `ELECTRON_RUN_AS_NODE` makes VektorSec.exe boot as plain Node and exit
    # immediately (see the guard at the top of electron/main.js). It leaks into
    # shells that spawn Electron tooling, so drop it before launching.
    if (Test-Path Env:\ELECTRON_RUN_AS_NODE) {
      Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
      Write-Ok "cleared ELECTRON_RUN_AS_NODE from the environment"
    }

    Write-Step "Launching $(Split-Path $appExe -Leaf)"
    Start-Process -FilePath $appExe -WorkingDirectory (Split-Path $appExe -Parent) | Out-Null

    if (Wait-HttpOk -Url $ReadyUrl -Timeout $TimeoutSeconds) {
      Write-Ok "/api/ready -> 200"
      Write-Host ""
      Write-Host "VektorSec desktop app is up: $FrontendUrl" -ForegroundColor Green
      Write-Host "login: admin@vektorsec.local (password: release\note.txt)" -ForegroundColor White
      exit 0
    }

    Write-Host ""
    Write-Warn2 "logs: $AppDataDir\logs (backend.log / frontend.log / startup.log)"
    exit 1
  }

  "down" {
    Write-Step "Closing the desktop app"
    $apps = @(Get-Process -Name "VektorSec" -ErrorAction SilentlyContinue)
    if ($apps.Count -eq 0) { Write-Ok "VektorSec.exe not running" }
    foreach ($process in $apps) {
      try {
        $process.CloseMainWindow() | Out-Null
        if (-not $process.WaitForExit(10000)) { Stop-Process -Id $process.Id -Force }
        Write-Ok "closed pid $($process.Id)"
      } catch {
        # already gone
      }
    }
    Start-Sleep -Seconds 2

    Write-Step "Stopping the app's portable MongoDB + Redis"
    Invoke-LocalDb "stop" | Out-Null

    $busy = Get-BusyPorts $AllPorts
    if ($busy.Count -eq 0) {
      Write-Ok "ports 3001/8081/27017/6379 are free - the docker stack can start now"
    } else {
      Write-Warn2 "still listening: $($busy -join ', ')"
      Format-PortOwners $busy | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
    }
    exit 0
  }

  "status" {
    Show-Status
  }
}



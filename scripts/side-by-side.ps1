# ============================================================================
#  VektorSec - run the Docker stack AND the desktop app (VektorSec.exe) together
# ----------------------------------------------------------------------------
#  Both bundles want the same host ports (3001 gateway, 8081 backend, 27017
#  MongoDB, 6379 Redis), so a plain second start dies with EADDRINUSE - or
#  worse, the app's backend attaches to the Docker database and the login then
#  fails with a confusing HTTP 401 (see electron/port-guard.js).
#
#  This script keeps the app on the default ports and moves the Docker stack to
#  13001 / 18081 (+ 16080 / 19020) using docker-compose.override.yml, then:
#    1) brings the Docker stack up (starts Docker Desktop when the engine is down)
#    2) starts the app's portable MongoDB + Redis on 27017 / 6379
#    3) launches the newest packaged VektorSec.exe
#    4) waits until BOTH gateways answer /api/ready
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\side-by-side.ps1 up
#    powershell -ExecutionPolicy Bypass -File scripts\side-by-side.ps1 status
#    powershell -ExecutionPolicy Bypass -File scripts\side-by-side.ps1 down
#
#  URLs once it is up:
#    Docker UI     http://127.0.0.1:13001     (/api/ready on the same port)
#    Desktop app   http://127.0.0.1:3001
# ============================================================================

[CmdletBinding()]
param(
  [ValidateSet("up", "status", "down")]
  [string]$Action = "up",

  [string]$Exe = "",

  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ComposeArgs = @("-f", (Join-Path $RepoRoot "docker-compose.yml"), "-f", (Join-Path $RepoRoot "docker-compose.override.yml"))
$OverridePath = Join-Path $RepoRoot "docker-compose.override.yml"
$LocalDbScript = Join-Path $PSScriptRoot "local-db.ps1"

$DockerUrl = "http://127.0.0.1:13001"
$DockerReadyUrl = "$DockerUrl/api/ready"
$AppUrl = "http://127.0.0.1:3001"
$AppReadyUrl = "$AppUrl/api/ready"

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    !!  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "    XX  $Message" -ForegroundColor Red }

function Invoke-NativeCapture {
  # PowerShell 5.1 turns native stderr into NativeCommandError when
  # $ErrorActionPreference is 'Stop'; docker/compose write warnings there.
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

function Get-DockerEngineVersion {
  $result = Invoke-NativeCapture -FilePath "docker" -Arguments @("version", "--format", "{{.Server.Version}}")
  if ($result.ExitCode -ne 0 -or -not $result.Output) { return $null }
  return ($result.Output | Out-String).Trim()
}

function Start-DockerDesktopIfNeeded {
  $version = Get-DockerEngineVersion
  if ($version) {
    Write-Ok "Docker engine running (server $version)"
    return
  }

  $exe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $exe)) {
    throw "Docker engine is down and Docker Desktop was not found at $exe"
  }

  Write-Step "Docker engine is down - starting Docker Desktop"
  Start-Process -FilePath $exe | Out-Null
  $deadline = (Get-Date).AddSeconds(240)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $version = Get-DockerEngineVersion
    if ($version) {
      Write-Ok "Docker engine ready (server $version)"
      return
    }
    Write-Host "    ... waiting for the engine" -ForegroundColor DarkGray
  }
  throw "Docker engine did not become ready within 240s"
}

function Set-ComposeEnvironment {
  # docker-compose.yml mounts ${HOME}/.codex/auth.json and ${HOME}/.ssh; Windows
  # sets USERPROFILE, so compose would warn and mount <drive>:\root\...
  if (-not $env:HOME) {
    $env:HOME = $env:USERPROFILE
    Write-Ok "HOME set to $env:HOME for compose interpolation"
  }
}

function Invoke-Compose {
  # `-f base -f override` must reach docker as separate tokens. Taking the
  # subcommand as a plain [string[]] (not ValueFromRemainingArguments) and
  # splatting ONE combined array is the only shape PowerShell forwards intact.
  param([string[]]$ComposeCommand)
  $all = @($ComposeArgs) + @($ComposeCommand)
  & docker compose @all
}

function Resolve-AppExe {
  if ($Exe) {
    if (-not (Test-Path -LiteralPath $Exe)) { throw "VektorSec.exe not found: $Exe" }
    return (Resolve-Path -LiteralPath $Exe).Path
  }

  $releaseDir = Join-Path $RepoRoot "release"
  if (-not (Test-Path $releaseDir)) {
    throw "release\ does not exist. Build the app first: npm run package:win:nosign"
  }

  $candidates = @(Get-ChildItem -Path $releaseDir -Recurse -Filter "VektorSec.exe" -ErrorAction SilentlyContinue)
  if ($candidates.Count -eq 0) {
    throw "VektorSec.exe not found under release\. Build it first: npm run package:win:nosign"
  }
  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Invoke-LocalDb([string]$DbAction) {
  if (-not (Test-Path $LocalDbScript)) { throw "scripts\local-db.ps1 is missing" }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LocalDbScript $DbAction | Out-Null
  return $LASTEXITCODE
}

function Wait-HttpOk([string]$Url, [int]$Timeout) {
  $deadline = (Get-Date).AddSeconds($Timeout)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      # not up yet
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Get-PortOwner([int]$Port) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) { return $null }
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  return "$($connection.OwningProcess) $($process.ProcessName)"
}

function Ensure-ComposeOverride {
  # docker-compose.override.yml is gitignored (see .gitignore: it is a local
  # port-shift file), so a fresh clone has none - write it on first use.
  # Nothing secret lives here; the base docker-compose.yml stays untouched.
  if (Test-Path $OverridePath) { return }

  $yaml = @'
# Generated by scripts\side-by-side.ps1 - local side-by-side ports (gitignored).
# The app keeps 3001/8081/27017/6379, the Docker stack moves to 13001/18081/
# 27018/16379. `!override` replaces the base list (compose appends sequences).
services:
  frontend:
    ports: !override
      - "127.0.0.1:13001:3001"

  backend:
    ports: !override
      - "127.0.0.1:18081:8081"
      - "127.0.0.1:16080:6080"
      - "127.0.0.1:19020:9020"
    environment:
      # Local only: both UIs then sign in with email + password (the desktop app
      # already sets this in %APPDATA%\VektorSec\data\.env). Running
      # docker-compose.yml on its own keeps the forced TOTP enrolment.
      AUTH_REQUIRE_2FA_SETUP: "0"

  mongodb:
    ports: !override
      - "127.0.0.1:27018:27017"

  redis:
    ports: !override
      - "127.0.0.1:16379:6379"
'@

  Set-Content -LiteralPath $OverridePath -Value $yaml -Encoding ASCII
  Write-Ok "created docker-compose.override.yml (gitignored local port shift)"
}

function Show-Status {
  Write-Step "Docker stack (override ports)"
  Invoke-Compose @("ps") | Out-Null

  Write-Step "Desktop app process"
  $apps = @(Get-Process -Name "VektorSec" -ErrorAction SilentlyContinue)
  if ($apps.Count -eq 0) { Write-Warn2 "VektorSec.exe is not running" }
  else { Write-Ok "VektorSec.exe pid $($apps[0].Id)" }

  Write-Step "Listening ports"
  foreach ($port in @(13001, 18081, 27018, 16379, 3001, 8081, 27017, 6379)) {
    $owner = Get-PortOwner $port
    if ($owner) { Write-Ok "$port <- $owner" }
    else { Write-Warn2 "$port is free" }
  }

  Write-Step "HTTP"
  foreach ($url in @($DockerReadyUrl, $AppReadyUrl)) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
      Write-Ok "GET $url -> $($response.StatusCode)"
    } catch {
      Write-Warn2 "GET $url failed: $($_.Exception.Message)"
    }
  }
}

Set-Location $RepoRoot
# Every action shells out to compose; Windows has no HOME, and the resulting
# warning on stderr would abort the script under $ErrorActionPreference = 'Stop'.
Set-ComposeEnvironment

switch ($Action) {
  "up" {
    Write-Step "Docker stack on 13001/18081 (compose + override)"
    Ensure-ComposeOverride
    Start-DockerDesktopIfNeeded
    Set-ComposeEnvironment

    Invoke-Compose @("up", "-d")
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "docker compose up failed (exit $LASTEXITCODE)"
      Write-Host "    run: docker compose $($ComposeArgs -join ' ') logs --tail 80" -ForegroundColor DarkGray
      exit $LASTEXITCODE
    }

    Write-Step "Desktop app database (portable MongoDB + Redis on 27017/6379)"
    $dbCode = Invoke-LocalDb "start"
    if ($dbCode -ne 0) { Write-Warn2 "local-db.ps1 start reported a problem (exit $dbCode)" }

    if ($env:ELECTRON_RUN_AS_NODE) {
      Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
      Write-Ok "cleared ELECTRON_RUN_AS_NODE from the environment"
    }

    $appExe = Resolve-AppExe
    Write-Step "Launching $(Split-Path $appExe -Leaf)"
    Start-Process -FilePath $appExe -WorkingDirectory (Split-Path $appExe -Parent) | Out-Null

    Write-Step "Waiting for both gateways"
    $dockerOk = Wait-HttpOk -Url $DockerReadyUrl -Timeout $TimeoutSeconds
    $appOk = Wait-HttpOk -Url $AppReadyUrl -Timeout $TimeoutSeconds

    Write-Host ""
    if ($dockerOk) { Write-Ok "Docker stack ready: $DockerUrl" } else { Write-Fail "Docker stack not ready: $DockerReadyUrl" }
    if ($appOk) { Write-Ok "Desktop app ready: $AppUrl" } else { Write-Fail "Desktop app not ready: $AppReadyUrl" }
    Write-Host ""
    Write-Host "Docker UI : $DockerUrl   (backend http://127.0.0.1:18081)" -ForegroundColor White
    Write-Host "Desktop   : $AppUrl      (its own MongoDB on 27017, Redis on 6379)" -ForegroundColor White
    if (-not $appOk) {
      Write-Host "app logs  : $env:APPDATA\VektorSec\logs (backend.log / frontend.log / startup.log)" -ForegroundColor DarkGray
    }
    if (-not ($dockerOk -and $appOk)) { exit 1 }
    exit 0
  }

  "status" {
    Show-Status
  }

  "down" {
    Write-Step "Stopping the Docker stack"
    Set-ComposeEnvironment
    Invoke-Compose @("down") | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warn2 "docker compose down reported exit $LASTEXITCODE" }
    else { Write-Ok "docker stack stopped (volumes kept)" }

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
    Write-Ok "done"
  }
}



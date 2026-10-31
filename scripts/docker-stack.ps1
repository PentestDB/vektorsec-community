# ============================================================================
#  VektorSec - Docker stack helper for Windows (dev + production compose)
# ----------------------------------------------------------------------------
#  Solves the "http://localhost:3001 is not reachable" failure in one command:
#    1) starts Docker Desktop (and waits for the engine) when it is not running
#    2) makes sure <repo>\.env holds MONGO_USER / MONGO_PASSWORD /
#       REDIS_PASSWORD - docker-compose.yml runs MongoDB with --auth, so an
#       empty password makes the mongo container exit and the stack hangs on
#       `depends_on: service_healthy`
#    3) sets HOME for compose interpolation - Windows has no HOME, so
#       ${HOME}/.codex/auth.json expands to <drive>:\root\.codex\auth.json
#    4) `docker compose up -d`, then polls http://127.0.0.1:3001/api/ready until
#       the gateway answers 200 (first Next.js dev compile can take 20-40s)
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 up
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 up -Prod
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 status
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 logs
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 logs -Service backend
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 down
#    powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 doctor
#
#  `up`       = docker-compose.dev.yml (hot reload; images vektorsec-dev-*)
#  `up -Prod` = docker-compose.yml    (production; builds vektorsec-backend:1.0.1
#                                      + vektorsec-frontend:0.1.1, ~15-30 min)
#  Only ONE of the two stacks can run at a time - both publish 3001/8081.
# ============================================================================

[CmdletBinding()]
param(
  [ValidateSet("up", "down", "status", "logs", "doctor")]
  [string]$Action = "up",

  [switch]$Prod,

  [string]$Service = "",

  [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$EnvPath = Join-Path $RepoRoot ".env"
$DevCompose = Join-Path $RepoRoot "docker-compose.dev.yml"
$ProdCompose = Join-Path $RepoRoot "docker-compose.yml"
$ComposeFile = if ($Prod) { $ProdCompose } else { $DevCompose }
$FrontendUrl = "http://127.0.0.1:3001"
$ReadyUrl = "$FrontendUrl/api/ready"

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    !!  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "    XX  $Message" -ForegroundColor Red }

function Test-PortOpen([int]$Port, [string]$Address = "127.0.0.1") {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($Address, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(700)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Invoke-NativeCapture {
  # PowerShell 5.1 turns a native command's stderr into a NativeCommandError
  # exception when $ErrorActionPreference is 'Stop' and stderr is redirected
  # (docker compose writes interpolation warnings there). Capture quietly.
  param([string]$FilePath, [string[]]$Arguments)

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $FilePath @Arguments 2>$null
    $code = $LASTEXITCODE
  } catch {
    $output = $null
    $code = 1
  } finally {
    $ErrorActionPreference = $previous
  }

  return [pscustomobject]@{ ExitCode = $code; Output = $output }
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
    throw "Docker engine is not running and Docker Desktop was not found at $exe. Install Docker Desktop or start the engine first."
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
  throw "Docker engine did not become ready within 240s. Open Docker Desktop manually and check its status."
}

function New-RandomSecret {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Ensure-EnvFile {
  if (-not (Test-Path $EnvPath)) {
    $secrets = Join-Path $RepoRoot "deploy\secrets.env"
    if (Test-Path $secrets) {
      Copy-Item -LiteralPath $secrets -Destination $EnvPath
      Write-Ok "Created .env from deploy\secrets.env"
    } else {
      $lines = @(
        "# VektorSec - docker compose secrets (generated by scripts\docker-stack.ps1)",
        "# Interpolated into docker-compose.yml: MONGO_USER / MONGO_PASSWORD / REDIS_PASSWORD",
        "# Never commit this file (.gitignore covers /.env).",
        "MONGO_USER=root",
        "MONGO_PASSWORD=$(New-RandomSecret)",
        "REDIS_PASSWORD=$(New-RandomSecret)"
      )
      Set-Content -LiteralPath $EnvPath -Value $lines -Encoding ASCII
      Write-Ok "Created .env with random DB passwords"
    }
    return
  }

  # .env exists - make sure the three keys compose interpolates are present and
  # non-empty, otherwise `docker compose config` warns and mongo cannot start.
  $content = Get-Content -LiteralPath $EnvPath -Raw
  $append = @()
  if ($content -notmatch "(?m)^\s*MONGO_USER=\S+") { $append += "MONGO_USER=root" }
  if ($content -notmatch "(?m)^\s*MONGO_PASSWORD=\S+") { $append += "MONGO_PASSWORD=$(New-RandomSecret)" }
  if ($content -notmatch "(?m)^\s*REDIS_PASSWORD=\S+") { $append += "REDIS_PASSWORD=$(New-RandomSecret)" }

  if ($append.Count -gt 0) {
    Add-Content -LiteralPath $EnvPath -Value ""
    Add-Content -LiteralPath $EnvPath -Value "# Added by scripts\docker-stack.ps1 - docker compose interpolates these"
    Add-Content -LiteralPath $EnvPath -Value $append
    Write-Ok "Added missing DB passwords to .env"
  } else {
    Write-Ok ".env present (MONGO_USER / MONGO_PASSWORD / REDIS_PASSWORD set)"
  }
}

function Set-ComposeEnvironment {
  # docker-compose.yml mounts ${HOME}/.codex/auth.json and
  # ${HOST_SSH_DIR:-${HOME}/.ssh}. Windows sets USERPROFILE, not HOME, so compose
  # prints 'The "HOME" variable is not set. Defaulting to a blank string.' and
  # the mount source becomes <drive>:\root\... - seed HOME for this session.
  param([switch]$Quiet)

  if (-not $env:HOME) {
    $env:HOME = $env:USERPROFILE
    if (-not $Quiet) { Write-Ok "HOME set to $env:HOME for compose interpolation" }
  }
}

function Invoke-Compose {
  # stdout/stderr pass straight through; callers read $LASTEXITCODE afterwards.
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
  & docker compose -f $ComposeFile @ComposeArgs
}

function Wait-GatewayReady {
  param([int]$Timeout = 300)

  Write-Step "Waiting for the gateway at $ReadyUrl (first compile can take 20-40s)"
  $deadline = (Get-Date).AddSeconds($Timeout)
  $lastError = "no response yet"
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $ReadyUrl -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -eq 200) {
        Write-Ok "/api/ready -> 200 $($response.Content)"
        return $true
      }
      $lastError = "status $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 5
  }

  Write-Fail "Gateway not ready after ${Timeout}s ($lastError)"
  return $false
}

function Get-ListeningConnection([int]$Port) {
  return (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1)
}

function Invoke-Doctor {
  Set-ComposeEnvironment -Quiet

  Write-Step "Docker engine"
  $version = Get-DockerEngineVersion
  if ($version) { Write-Ok "server $version" }
  else { Write-Fail "engine down - run: scripts\docker-stack.ps1 up (it starts Docker Desktop)" }

  Write-Step "Compose files"
  foreach ($file in @($DevCompose, $ProdCompose)) {
    if (-not (Test-Path $file)) { Write-Fail "$file missing"; continue }
    $result = Invoke-NativeCapture -FilePath "docker" -Arguments @("compose", "-f", $file, "config", "--quiet")
    if ($result.ExitCode -eq 0) { Write-Ok "$(Split-Path $file -Leaf) valid" }
    else { Write-Fail "$(Split-Path $file -Leaf) invalid - run: docker compose -f $(Split-Path $file -Leaf) config" }
  }

  Write-Step "Root .env (MONGO_PASSWORD / REDIS_PASSWORD)"
  if (Test-Path $EnvPath) {
    $content = Get-Content -LiteralPath $EnvPath -Raw
    $missing = @()
    foreach ($key in @("MONGO_USER", "MONGO_PASSWORD", "REDIS_PASSWORD")) {
      if ($content -notmatch "(?m)^\s*$key=\S+") { $missing += $key }
    }
    if ($missing.Count -eq 0) { Write-Ok ".env complete" }
    else { Write-Warn2 ".env missing $($missing -join ', ') - production compose cannot start mongo" }
  } else {
    Write-Warn2 "no .env at repo root - production compose cannot start mongo; run: scripts\docker-stack.ps1 up"
  }

  Write-Step "HOME for compose interpolation"
  if ($env:HOME) { Write-Ok "HOME=$env:HOME" }
  else { Write-Warn2 "HOME not set (normal on Windows) - the helper sets it before calling compose" }

  Write-Step "Images"
  $imageResult = Invoke-NativeCapture -FilePath "docker" -Arguments @("images", "--format", "{{.Repository}}:{{.Tag}}")
  $images = @()
  if ($imageResult.Output) { $images = @($imageResult.Output | ForEach-Object { "$_".Trim() }) }
  foreach ($image in @("vektorsec-backend:1.0.1", "vektorsec-frontend:0.1.1", "vektorsec-dev-backend:latest", "vektorsec-dev-frontend:latest")) {
    if ($images -contains $image) { Write-Ok $image }
    else { Write-Warn2 "$image not built (production stack: docker compose -f docker-compose.yml build)" }
  }

  Write-Step "Listening ports"
  foreach ($port in @(3001, 8081, 27017, 6379)) {
    $connection = Get-ListeningConnection $port
    if ($connection) { Write-Ok "$port listened on $($connection.LocalAddress)" }
    else { Write-Warn2 "$port is not listening" }
  }

  Write-Step "Gateway HTTP"
  try {
    $response = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 30
    Write-Ok "GET $FrontendUrl -> $($response.StatusCode) ($($response.RawContentLength) bytes)"
  } catch {
    Write-Fail "GET $FrontendUrl failed: $($_.Exception.Message)"
  }
  try {
    $response = Invoke-WebRequest -Uri $ReadyUrl -UseBasicParsing -TimeoutSec 15
    Write-Ok "GET $ReadyUrl -> $($response.StatusCode) $($response.Content)"
  } catch {
    Write-Fail "GET $ReadyUrl failed: $($_.Exception.Message)"
  }

  Write-Host ""
  Write-Host "Open: $FrontendUrl  (use 127.0.0.1 - compose publishes on IPv4 loopback only)" -ForegroundColor White
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
Set-Location $RepoRoot

switch ($Action) {
  "up" {
    Write-Step "VektorSec docker stack ($(Split-Path $ComposeFile -Leaf))"
    Start-DockerDesktopIfNeeded
    Set-ComposeEnvironment
    Ensure-EnvFile

    Write-Step "docker compose up -d"
    $upArgs = @("up", "-d")
    if ($Prod) { $upArgs += "--build" }
    if ($Service) { $upArgs += $Service }
    Invoke-Compose @upArgs
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      Write-Fail "docker compose up failed (exit $code)"
      Write-Host "    Run: docker compose -f $(Split-Path $ComposeFile -Leaf) logs --tail 80" -ForegroundColor DarkGray
      exit $code
    }

    Invoke-Compose @("ps") | Out-Null
    if (Wait-GatewayReady -Timeout $TimeoutSeconds) {
      Write-Host ""
      Write-Host "VektorSec is up: $FrontendUrl" -ForegroundColor Green
      exit 0
    }

    Write-Host ""
    Write-Warn2 "Last frontend log lines:"
    Invoke-Compose @("logs", "--tail", "40", "frontend")
    exit 1
  }

  "down" {
    Write-Step "docker compose down ($(Split-Path $ComposeFile -Leaf))"
    Invoke-Compose @("down")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Ok "stack stopped (volumes kept)"
  }

  "status" {
    Write-Step "docker compose ps ($(Split-Path $ComposeFile -Leaf))"
    Invoke-Compose @("ps")
    exit $LASTEXITCODE
  }

  "logs" {
    if ($Service) { Invoke-Compose @("logs", "--tail", "120", "-f", $Service) }
    else { Invoke-Compose @("logs", "--tail", "120", "-f") }
  }

  "doctor" {
    Invoke-Doctor
  }
}


# ============================================================================
#  VektorSec — portable MongoDB + Redis for the desktop app (no Docker)
# ----------------------------------------------------------------------------
#  The desktop build talks to MongoDB (127.0.0.1:27017) and Redis
#  (127.0.0.1:6379) exactly like the Docker stack does. This script installs
#  both as portable binaries under %APPDATA%\VektorSec\runtime and can start,
#  stop and inspect them.
#
#    powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 install
#    powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 start
#    powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 status
#    powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 stop
#
#  `install` is only needed once per machine (~130 MB once extracted).
#  The Electron app starts the same binaries itself (electron/local-db.js), so
#  after installing, the databases come up with the app. This script is for
#  reinstalling, or for running them outside the app.
# ============================================================================

[CmdletBinding()]
param(
  [ValidateSet("install", "start", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = Join-Path $env:APPDATA "VektorSec"
$Runtime = Join-Path $Root "runtime"
$DataDir = Join-Path $Root "data"
$LogDir = Join-Path $Root "logs"

$MongoVersion = "7.0.45"
$MongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoVersion.zip"
$RedisUrl = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"

$Mongod = Join-Path $Runtime "mongodb\bin\mongod.exe"
$RedisServer = Join-Path $Runtime "redis\redis-server.exe"
$MongoPid = Join-Path $Runtime "mongod.pid"
$RedisPid = Join-Path $Runtime "redis.pid"

function Ensure-Directories {
  foreach ($dir in @($Runtime, $DataDir, $LogDir, (Join-Path $DataDir "mongo"), (Join-Path $DataDir "redis"))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
}

function Test-PortOpen([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(700)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Expand-Zip([string]$Zip, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  # bsdtar ships with Windows 10+ and is far faster than Expand-Archive.
  & tar.exe -xf $Zip -C $Destination
  if ($LASTEXITCODE -ne 0) { throw "tar failed to extract $Zip" }
}

function Install-MongoDb {
  if (Test-Path $Mongod) { return }
  Write-Host "Downloading MongoDB $MongoVersion (~600 MB) ..."
  $zip = Join-Path $env:TEMP "mongodb-windows-x86_64-$MongoVersion.zip"
  if (-not (Test-Path $zip)) { Invoke-WebRequest -Uri $MongoUrl -OutFile $zip }

  $tmp = Join-Path $env:TEMP "vektorsec-mongodb"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Zip $zip $tmp

  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path (Join-Path $Runtime "mongodb") | Out-Null
  Move-Item (Join-Path $inner.FullName "*") (Join-Path $Runtime "mongodb") -Force

  # Only mongod is needed: drop ~1.6 GB of debug symbols and the sharded router.
  Remove-Item (Join-Path $Runtime "mongodb\bin\*.pdb") -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $Runtime "mongodb\bin\mongos.exe") -Force -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

function Install-Redis {
  if (Test-Path $RedisServer) { return }
  Write-Host "Downloading Redis for Windows (~12 MB) ..."
  $zip = Join-Path $env:TEMP "redis-for-windows.zip"
  if (-not (Test-Path $zip)) { Invoke-WebRequest -Uri $RedisUrl -OutFile $zip }
  Expand-Zip $zip (Join-Path $Runtime "redis")
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

function Start-MongoDb {
  if (Test-PortOpen 27017) {
    Write-Host "MongoDB already listening on 127.0.0.1:27017"
    return
  }
  $process = Start-Process -FilePath $Mongod -ArgumentList @(
    "--dbpath", (Join-Path $DataDir "mongo"),
    "--port", "27017",
    "--bind_ip", "127.0.0.1",
    "--logpath", (Join-Path $LogDir "mongod.log"),
    "--logappend"
  ) -WindowStyle Hidden -PassThru
  Set-Content -Path $MongoPid -Value $process.Id
  Write-Host "MongoDB started (pid $($process.Id)) - log: $LogDir\mongod.log"
}

function Start-Redis {
  if (Test-PortOpen 6379) {
    Write-Host "Redis already listening on 127.0.0.1:6379"
    return
  }
  $process = Start-Process -FilePath $RedisServer -ArgumentList @(
    "--port", "6379",
    "--bind", "127.0.0.1",
    "--dir", (Join-Path $DataDir "redis"),
    "--logfile", (Join-Path $LogDir "redis.log"),
    "--appendonly", "no"
  ) -WindowStyle Hidden -PassThru
  Set-Content -Path $RedisPid -Value $process.Id
  Write-Host "Redis started (pid $($process.Id)) - log: $LogDir\redis.log"
}

function Stop-FromPidFile([string]$PidFile, [string]$Name) {
  if (-not (Test-Path $PidFile)) { return }
  $processId = (Get-Content $PidFile | Select-Object -First 1).Trim()
  if ($processId) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $processId -Force
      Write-Host "$Name stopped (pid $processId)"
    }
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Show-Status {
  $mongoUp = Test-PortOpen 27017
  $redisUp = Test-PortOpen 6379
  Write-Host ("MongoDB 127.0.0.1:27017 : " + $(if ($mongoUp) { "UP" } else { "DOWN" }))
  Write-Host ("Redis   127.0.0.1:6379  : " + $(if ($redisUp) { "UP" } else { "DOWN" }))
  Write-Host "binaries : $Runtime"
  Write-Host "data     : $DataDir"
  if (-not $mongoUp -or -not $redisUp) { exit 1 }
}

Ensure-Directories

switch ($Action) {
  "install" {
    Install-MongoDb
    Install-Redis
    Write-Host "Installed portable MongoDB + Redis under $Runtime"
    Start-MongoDb
    Start-Redis
  }
  "start" {
    if (-not (Test-Path $Mongod) -or -not (Test-Path $RedisServer)) {
      Write-Host "Runtime missing - installing first ..."
      Install-MongoDb
      Install-Redis
    }
    Start-MongoDb
    Start-Redis
  }
  "stop" {
    Stop-FromPidFile $MongoPid "MongoDB"
    Stop-FromPidFile $RedisPid "Redis"
  }
  "status" {
    Show-Status
    return
  }
}

Start-Sleep -Seconds 2
Show-Status

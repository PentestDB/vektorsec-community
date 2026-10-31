# ============================================================================
#  VektorSec - reset the admin password of the DESKTOP APP database
# ----------------------------------------------------------------------------
#  The Docker stack has scripts\reset-admin-password.ps1 (it runs inside the
#  backend container). The desktop app keeps its OWN MongoDB in
#  %APPDATA%\VektorSec\data, started by scripts\local-db.ps1 on 127.0.0.1:27017,
#  so it needs its own resetter - this script.
#
#  It reuses the packaged backend's mongoose/bcrypt (no npm install, no docker)
#  and also clears twoFactorEnabled/twoFactorSecret + bumps sessionVersion, so
#  the account signs in with email + password only.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\reset-app-admin.ps1 -List
#    powershell -ExecutionPolicy Bypass -File scripts\reset-app-admin.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\reset-app-admin.ps1 -Password 'MyNewPass!2026'
#    powershell -ExecutionPolicy Bypass -File scripts\reset-app-admin.ps1 -Email you@example.com
#
#  Prerequisites: the app's MongoDB must be running
#    powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 start
# ============================================================================

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [string]$Email = "admin@vektorsec.local",

  [string]$Password = "",

  [string]$MongoUri = "mongodb://127.0.0.1:27017/vektorsec",

  [string]$AppRoot = "",

  [switch]$List
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Fail([string]$Message) { Write-Host "    XX  $Message" -ForegroundColor Red }

function New-RandomPassword {
  $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) -join "")
}

function Resolve-AppBackendRoot {
  if ($AppRoot) {
    if (-not (Test-Path $AppRoot)) { throw "app backend root not found: $AppRoot" }
    return $AppRoot
  }

  $releaseDir = Join-Path $RepoRoot "release"
  if (-not (Test-Path $releaseDir)) { throw "release\ is missing - build the app first" }

  # Depth 3 keeps the walk out of the 100k files under resources\app\*, and the
  # newest VektorSec.exe wins so a stale hand-unpacked copy is never used.
  $candidates = @(Get-ChildItem -Path $releaseDir -Recurse -Depth 3 -Filter "VektorSec.exe" -ErrorAction SilentlyContinue)
  if ($candidates.Count -eq 0) { throw "VektorSec.exe not found under release\" }
  $newest = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  $root = Join-Path (Split-Path $newest.FullName -Parent) "resources\app\backend"
  if (-not (Test-Path $root)) { throw "packaged backend not found at $root" }
  return $root
}

function Test-MongoPort {
  $connection = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return [bool]$connection
}

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeExe) { throw "node is not on PATH (needed to run the packaged mongoose)" }

if (-not (Test-MongoPort)) {
  throw "nothing listens on 27017 - start the app database first: scripts\local-db.ps1 start"
}

$backendRoot = Resolve-AppBackendRoot
Write-Step "Packaged backend: $backendRoot"
Write-Step "Database: $MongoUri"

$script = @'
const path = require("path");
const ROOT = process.env.APP_BACKEND_ROOT;
const mongoose = require(path.join(ROOT, "node_modules", "mongoose"));
let bcrypt;
try { bcrypt = require(path.join(ROOT, "node_modules", "bcrypt")); }
catch { bcrypt = require(path.join(ROOT, "node_modules", "bcryptjs")); }

const mode = process.env.SYNC_MODE || "list";

(async () => {
  await mongoose.connect(process.env.APP_MONGO_URI);
  const users = mongoose.connection.collection("users");
  const rows = await users.find({}, { projection: { email: 1, role: 1, twoFactorEnabled: 1, password: 1 } }).toArray();
  console.log("database=" + mongoose.connection.name + "  accounts=" + rows.length);
  for (const row of rows) {
    console.log("  " + row.email + "  role=" + (row.role || "user") + "  2fa=" + (row.twoFactorEnabled ? "on" : "off") + "  hasHash=" + !!row.password);
  }

  if (mode === "reset") {
    const email = process.env.RESET_EMAIL;
    const password = process.env.RESET_PASSWORD;
    if (!email || !password) { console.error("RESET_EMAIL / RESET_PASSWORD missing"); process.exit(2); }
    const user = await users.findOne({ email });
    if (!user) { console.error("user not found: " + email); process.exit(3); }
    const hash = await bcrypt.hash(password, 10);
    await users.updateOne(
      { _id: user._id },
      { $set: { password: hash }, $unset: { twoFactorEnabled: "", twoFactorSecret: "" }, $inc: { sessionVersion: 1 } },
    );
    console.log("RESET_OK " + email + " (password updated, 2FA cleared, sessions revoked)");
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error("failed: " + error.message);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
'@

$tmpScript = Join-Path $env:TEMP "vektorsec-app-admin.js"
Set-Content -LiteralPath $tmpScript -Value $script -Encoding ASCII

$env:APP_BACKEND_ROOT = $backendRoot
$env:APP_MONGO_URI = $MongoUri

try {
  if ($List) {
    $env:SYNC_MODE = "list"
    & node $tmpScript
    exit $LASTEXITCODE
  }

  $newPassword = $Password
  $generated = $false
  if (-not $newPassword) {
    $newPassword = New-RandomPassword
    $generated = $true
  }

  if (-not $PSCmdlet.ShouldProcess("$Email ($MongoUri)", "Reset the desktop-app admin password")) { exit 0 }

  Write-Step "Updating the password hash for $Email"
  $env:SYNC_MODE = "reset"
  $env:RESET_EMAIL = $Email
  $env:RESET_PASSWORD = $newPassword
  & node $tmpScript
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "reset failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
  }
  Write-Ok "password hash stored in the app database"

  Write-Host ""
  Write-Host "Login credentials (desktop app)" -ForegroundColor White
  Write-Host "  email    : $Email"
  Write-Host "  password : $newPassword" -ForegroundColor Yellow
  if ($generated) { Write-Host "  (generated - change it in Settings right after logging in)" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Ok "done - restart the app if the window is already open"
} finally {
  Remove-Item Env:\APP_BACKEND_ROOT, Env:\APP_MONGO_URI, Env:\SYNC_MODE, Env:\RESET_EMAIL, Env:\RESET_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tmpScript -ErrorAction SilentlyContinue
}

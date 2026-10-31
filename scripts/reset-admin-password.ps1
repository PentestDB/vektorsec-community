# ============================================================================
#  VektorSec - reset the admin password of a running docker stack
# ----------------------------------------------------------------------------
#  The backend seeds ONE admin account on first boot and then never touches it
#  again ("admin account already exists"), so changing ADMIN_PASSWORD in
#  backend/.env does NOT rotate an existing password. This script updates the
#  bcrypt hash in MongoDB directly, using the backend container's own
#  mongoose + bcryptjs, and then verifies a login through the :3001 gateway.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\reset-admin-password.ps1 -List
#    powershell -ExecutionPolicy Bypass -File scripts\reset-admin-password.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\reset-admin-password.ps1 -Password 'MyNewPass!2026'
#    powershell -ExecutionPolicy Bypass -File scripts\reset-admin-password.ps1 -Email you@example.com -RevokeSessions
#
#  -List            : show accounts (email / role / 2FA) and exit, nothing changes
#  -Password        : password to set (omitted -> a random 24-char one is printed)
#  -RevokeSessions  : also bump sessionVersion so every existing login is killed
#  -Container       : backend container name (auto-detected on a docker stack)
# ============================================================================

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [string]$Email = "admin@vektorsec.local",

  [string]$Password = "",

  [string]$Container = "",

  [string]$GatewayUrl = "http://127.0.0.1:3001",

  [switch]$RevokeSessions,

  [switch]$List,

  [switch]$NoVerify
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    !!  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "    XX  $Message" -ForegroundColor Red }

function Invoke-NativeCapture {
  # PowerShell 5.1 raises NativeCommandError for native stderr when
  # $ErrorActionPreference is 'Stop'; docker writes warnings there, so we merge
  # stderr into the captured output instead of losing the error text.
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

function New-RandomPassword {
  # 24 chars from [A-Za-z0-9] - safe to pass through docker/compose/JSON and
  # still well above the backend's minimum length.
  $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) -join "")
}

function Resolve-BackendContainer {
  if ($Container) { return $Container }

  $result = Invoke-NativeCapture -FilePath "docker" -Arguments @("ps", "--format", "{{.Names}}")
  if ($result.ExitCode -ne 0) {
    throw "Docker engine is not reachable. Start it first: scripts\docker-stack.ps1 up"
  }
  $names = @()
  if ($result.Output) { $names = @($result.Output | ForEach-Object { "$_".Trim() }) }

  foreach ($candidate in @("vektorsec-dev-backend-1", "vektorsec-backend-1")) {
    if ($names -contains $candidate) { return $candidate }
  }
  $anyBackend = $names | Where-Object { $_ -like "*backend*" } | Select-Object -First 1
  if ($anyBackend) { return $anyBackend }

  throw "No running backend container found (docker ps). Start the stack first: scripts\docker-stack.ps1 up"
}

$AdminScript = @'
// Resolve mongoose/bcryptjs from the backend's own node_modules so this script
// works whether it lives in /tmp, in a dev container (/app/backend) or in the
// production image (/usr/src/backend).
const candidateRoots = [process.env.BACKEND_ROOT, "/app/backend", "/usr/src/backend", "/app", process.cwd()].filter(Boolean);
function loadModule(name) {
  for (const root of candidateRoots) {
    try {
      return require(`${root}/node_modules/${name}`);
    } catch {
      // try the next root
    }
  }
  return require(name);
}

const mongoose = loadModule("mongoose");
// `bcrypt` (native) is a direct backend dependency; `bcryptjs` is the fallback.
// Both emit/verify the same $2b$ hash format, so either works for login.
let hasher;
try {
  hasher = loadModule("bcrypt");
} catch {
  hasher = loadModule("bcryptjs");
}
const bcrypt = hasher;


(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set inside this container");
    process.exit(2);
  }
  const email = process.env.RESET_EMAIL;
  const mode = process.env.RESET_MODE || "reset";

  const options = {};
  if (process.env.MONGO_DATABASE) options.dbName = process.env.MONGO_DATABASE;
  await mongoose.connect(uri, options);
  const users = mongoose.connection.collection("users");

  if (mode === "list") {
    const rows = await users
      .find({}, { projection: { email: 1, role: 1, twoFactorEnabled: 1, sessionVersion: 1 } })
      .toArray();
    for (const row of rows) {
      console.log(
        `  ${row.email}  role=${row.role || "user"}  2fa=${row.twoFactorEnabled ? "on" : "off"}  sessionVersion=${row.sessionVersion || 0}`,
      );
    }
    await mongoose.disconnect();
    return;
  }

  const user = await users.findOne({ email });
  if (!user) {
    console.error(`user not found: ${email}`);
    await mongoose.disconnect();
    process.exit(3);
  }

  const hash = await bcrypt.hash(process.env.RESET_PASSWORD, 10);
  const update = { password: hash };
  if (process.env.RESET_REVOKE === "1") {
    update.sessionVersion = (user.sessionVersion || 0) + 1;
  }
  await users.updateOne({ _id: user._id }, { $set: update });
  console.log(
    `password updated for ${email} (role=${user.role || "user"}, 2fa=${user.twoFactorEnabled ? "on" : "off"}, sessionVersion=${update.sessionVersion ?? user.sessionVersion ?? 0})`,
  );
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(`reset failed: ${error.message}`);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
'@

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
$backend = Resolve-BackendContainer
Write-Step "Backend container: $backend"

$tmpScript = Join-Path $env:TEMP "vektorsec-reset-admin.js"
Set-Content -LiteralPath $tmpScript -Value $AdminScript -Encoding ASCII

$containerScript = "/tmp/vektorsec-reset-admin.js"
$copy = Invoke-NativeCapture -FilePath "docker" -Arguments @("cp", $tmpScript, "${backend}:$containerScript")
if ($copy.ExitCode -ne 0) {
  Write-Fail "docker cp failed: $($copy.Output -join ' ')"
  exit $copy.ExitCode
}

try {
  if ($List) {
    Write-Step "Accounts in MongoDB"
    $listArgs = @("exec", "-w", "/app/backend", "-e", "NODE_PATH=/app/backend/node_modules", "-e", "RESET_MODE=list", $backend, "node", $containerScript)
    $result = Invoke-NativeCapture -FilePath "docker" -Arguments $listArgs
    if ($result.ExitCode -ne 0) {
      Write-Fail ($result.Output -join "`n")
      exit $result.ExitCode
    }
    if ($result.Output) { $result.Output | ForEach-Object { Write-Host $_ } }
    Write-Ok "log in with one of the emails above"
    exit 0
  }

  $newPassword = $Password
  $generated = $false
  if (-not $newPassword) {
    $newPassword = New-RandomPassword
    $generated = $true
  }

  $revoke = if ($RevokeSessions) { "1" } else { "0" }

  if (-not $PSCmdlet.ShouldProcess("$backend ($Email)", "Reset the admin password")) { exit 0 }

  Write-Step "Updating the password hash for $Email"
  $resetArgs = @(
    "exec", "-w", "/app/backend",
    "-e", "NODE_PATH=/app/backend/node_modules",
    "-e", "RESET_MODE=reset",
    "-e", "RESET_EMAIL=$Email",
    "-e", "RESET_PASSWORD=$newPassword",
    "-e", "RESET_REVOKE=$revoke",
    $backend, "node", $containerScript
  )
  $result = Invoke-NativeCapture -FilePath "docker" -Arguments $resetArgs
  if ($result.Output) { $result.Output | ForEach-Object { Write-Host "    $_" } }
  if ($result.ExitCode -ne 0) {
    Write-Fail "reset failed (exit $($result.ExitCode))"
    exit $result.ExitCode
  }
  Write-Ok "password hash stored in MongoDB"

  if ($NoVerify) { exit 0 }

  Write-Step "Verifying the login through $GatewayUrl/api/auth/login"
  $body = @{ email = $Email; password = $newPassword } | ConvertTo-Json -Compress
  try {
    $response = Invoke-WebRequest -Uri "$GatewayUrl/api/auth/login" -Method Post -Body $body `
      -ContentType "application/json" -UseBasicParsing -SessionVariable gatewaySession -TimeoutSec 30
    Write-Ok "login -> $($response.StatusCode) (session cookie issued)"
  } catch {
    $status = ""
    $payload = ""
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $payload = $reader.ReadToEnd()
      } catch { /* body unreadable */ }
    }

    if ($status -eq 400 -and $payload -match "twoFactor") {
      Write-Warn2 "password accepted, but this account still requires a 2FA code (HTTP 400)"
      Write-Warn2 "either enter the current 6-digit code in the app, or set AUTH_REQUIRE_2FA_SETUP=0 for local dev"
    } else {
      Write-Fail "login failed (HTTP $status) $payload"
      exit 1
    }
  }

  Write-Host ""
  Write-Host "Login credentials" -ForegroundColor White
  Write-Host "  email    : $Email"
  Write-Host "  password : $newPassword" -ForegroundColor Yellow
  if ($generated) { Write-Host "  (generated - change it in Settings right after logging in)" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Ok "done"
} finally {
  Invoke-NativeCapture -FilePath "docker" -Arguments @("exec", $backend, "rm", "-f", $containerScript) | Out-Null
  Remove-Item -LiteralPath $tmpScript -ErrorAction SilentlyContinue
}

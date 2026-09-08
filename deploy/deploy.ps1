# ============================================================================
#  VektorSec - Deploy to VPS (Windows PowerShell)
#
#  Runs from your Windows machine and deploys the current working tree to a
#  VPS. Uses the SSH key already installed on the VPS (no password prompt).
#
#  Usage (from the project folder):
#     powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
#
#  Before first use, edit the parameters below (VPS) and prepare a secrets
#  file:   cp deploy/secrets.env.example deploy/secrets.env
#
#  What this script does:
#     1. Packs the current working tree into a clean .tar.gz
#        (excludes secrets / build junk / git history).
#     2. Uploads it to the VPS (scp).
#     3. Extracts over /opt/vektorsec and runs deploy/vps-update.sh
#        (rebuild backend+frontend and recreate containers; config and data
#        are untouched; the first build can take ~30 min).
#     4. (Optional) Reloads a reverse-proxy container (nginx/caddy) if you set
#        PROXY_CONTAINER - the proxy must be able to reach http://localhost:3001
#
#  NOTE: keep this window open while step 3 runs - closing it aborts the
#  remote build. MongoDB/Redis data and config (config.toml, .env) on the
#  VPS are never overwritten.
# ============================================================================

param(
  # เปลี่ยนเป็น user@IP/โดเมน VPS ของคุณ เช่น "root@<YOUR_VPS_IP>"
  [string]$VPS = "root@<YOUR_VPS_IP>"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$PKG  = Join-Path $env:TEMP "vektorsec-deploy.tar.gz"

# Load deploy/secrets.env (MONGO_USER / MONGO_PASSWORD / REDIS_PASSWORD) so
# docker-compose.yml can interpolate the DB credentials during the remote build.
$secretsFile = Join-Path $PSScriptRoot "secrets.env"
if (Test-Path $secretsFile) {
  Get-Content $secretsFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*?)\s*$' -and -not $_.TrimStart().StartsWith('#')) {
      Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
  }
}
if (-not $env:MONGO_PASSWORD) {
  Write-Host "WARNING: deploy/secrets.env missing or MONGO_PASSWORD empty - MongoDB auth will fail on the VPS." -ForegroundColor Yellow
  Write-Host "         Copy deploy/secrets.env.example to deploy/secrets.env and fill in the passwords first." -ForegroundColor Yellow
}

Write-Host "==> [1/4] Creating deploy package..." -ForegroundColor Cyan
if (Test-Path $PKG) { Remove-Item $PKG -Force }

Push-Location $ROOT
tar -czf $PKG `
  --exclude='.git' `
  --exclude='node_modules' `
  --exclude='.next' `
  --exclude='backend/dist' `
  --exclude='*.tsbuildinfo' `
  --exclude='*.log' `
  --exclude='*.zip' `
  --exclude='*.tar.gz' `
  --exclude='tsc-*.txt' `
  --exclude='build-*.txt' `
  --exclude='run-out.txt' `
  --exclude='admin-login.png' `
  --exclude='qr-*.png' `
  --exclude='backend/mptest.js' `
  --exclude='config.toml' `
  --exclude='backend/.env' `
  --exclude='frontend/.env' `
  --exclude='backend/model-registry.json' `
  --exclude='ssh-keys' `
  --exclude='docker-compose.override.yml' `
  --exclude='.run-state' `
  --exclude='.cursor' `
  --exclude='.claude' `
  --exclude='.vscode' `
  --exclude='kali-data' `
  .
if ($LASTEXITCODE -ne 0) { throw "tar failed to create the package" }
Pop-Location
Write-Host ("    Package: {0:N1} MB -> {1}" -f ((Get-Item $PKG).Length / 1MB), $PKG) -ForegroundColor Green

Write-Host "==> [2/4] Uploading to ${VPS}..." -ForegroundColor Cyan
scp $PKG "${VPS}:/tmp/vektorsec-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp upload failed" }

Write-Host "==> [3/4] Extracting + rebuilding on the VPS (first build takes ~30 min)..." -ForegroundColor Cyan
Write-Host "    Keep this window open while the build runs." -ForegroundColor Yellow
$exportCmd = "export MONGO_USER='$env:MONGO_USER' MONGO_PASSWORD='$env:MONGO_PASSWORD' REDIS_PASSWORD='$env:REDIS_PASSWORD';"
ssh $VPS "$exportCmd cd /opt/vektorsec && tar xzf /tmp/vektorsec-deploy.tar.gz && find backend frontend kali deploy -name '*.sh' -exec sed -i 's/\r$//' {} + && bash deploy/vps-update.sh"
if ($LASTEXITCODE -ne 0) { throw "Remote update failed (see error above)" }

Write-Host "==> [4/4] Reverse proxy reload (optional)..." -ForegroundColor Cyan
if ($env:PROXY_CONTAINER) {
  # ตัวอย่าง: ถ้า proxy วิ่งเป็น container (เช่น container nginx/caddy ของคุณ) ที่ต้องต่อ
  # network เดียวกับ stack ถึงจะเห็น http://localhost:3001 ได้ ให้ตั้ง
  # PROXY_CONTAINER=<container_name> ก่อนรันสคริปต์
  ssh $VPS "docker network connect vektorsec_default $env:PROXY_CONTAINER 2>/dev/null || true; docker exec $env:PROXY_CONTAINER nginx -t && docker exec $env:PROXY_CONTAINER nginx -s reload"
  if ($LASTEXITCODE -ne 0) { Write-Host "    (proxy reload issue - check manually)" -ForegroundColor Yellow }
} else {
  Write-Host "    Skipped (set PROXY_CONTAINER to auto-reload your nginx/caddy container)." -ForegroundColor DarkGray
  Write-Host "    If you run the proxy on the host, make sure it can reach http://localhost:3001" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "==> DONE! Verify: http://<YOUR_VPS_IP>:3001 (or your domain via the reverse proxy)" -ForegroundColor Green

# Deploy Yala Security Phase 2 backend to production (Windows PowerShell).
# Syncs auth/device/2FA/integrity/fraud/payment webhook files, rebuilds django,
# runs migrations, then verifies the six previous device-QA failures.
$ErrorActionPreference = "Stop"

$Remote = if ($env:YALA_PROD_HOST) { $env:YALA_PROD_HOST } else { "root@142.93.99.142" }
$AppDir = if ($env:YALA_PROD_APP_DIR) { $env:YALA_PROD_APP_DIR } else { "/opt/yala" }
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $RepoRoot "backend\taxi"

Write-Host "=== Phase 2 backend deploy → ${Remote}:${AppDir} ==="

ssh $Remote @"
mkdir -p \
  ${AppDir}/backend/taxi/admin_2fa/migrations \
  ${AppDir}/backend/taxi/authapp/migrations \
  ${AppDir}/backend/taxi/security/services \
  ${AppDir}/backend/taxi/payments \
  ${AppDir}/backend/taxi/deliveries/services \
  ${AppDir}/backend/taxi/taxi/rides \
  ${AppDir}/backend/taxi/taxi/security \
  ${AppDir}/scripts
"@

function Send-File([string]$LocalRel, [string]$RemoteRel) {
  $local = Join-Path $Backend ($LocalRel -replace "/", "\")
  if (-not (Test-Path $local)) { throw "Missing local file: $local" }
  Write-Host "scp $LocalRel"
  scp $local "${Remote}:${AppDir}/backend/taxi/${RemoteRel}"
}

# Auth / sessions
Send-File "authapp/views.py" "authapp/views.py"
Send-File "authapp/urls.py" "authapp/urls.py"
Send-File "authapp/models.py" "authapp/models.py"
Send-File "authapp/migrations/0018_devicesession.py" "authapp/migrations/0018_devicesession.py"

# Admin 2FA + integrity
Send-File "admin_2fa/__init__.py" "admin_2fa/__init__.py"
Send-File "admin_2fa/apps.py" "admin_2fa/apps.py"
Send-File "admin_2fa/models.py" "admin_2fa/models.py"
Send-File "admin_2fa/views.py" "admin_2fa/views.py"
Send-File "admin_2fa/urls.py" "admin_2fa/urls.py"
Send-File "admin_2fa/integrity.py" "admin_2fa/integrity.py"
Send-File "admin_2fa/integrity_urls.py" "admin_2fa/integrity_urls.py"
Send-File "admin_2fa/pending.py" "admin_2fa/pending.py"
Send-File "admin_2fa/migrations/__init__.py" "admin_2fa/migrations/__init__.py"
Send-File "admin_2fa/migrations/0001_initial.py" "admin_2fa/migrations/0001_initial.py"

# Settings / root URLs / deps
Send-File "taxi/settings.py" "taxi/settings.py"
Send-File "taxi/urls.py" "taxi/urls.py"
Send-File "requirements.txt" "requirements.txt"

# Fraud / PIN / payments
Send-File "security/services/fraud_service.py" "security/services/fraud_service.py"
Send-File "security/models.py" "security/models.py"
Send-File "deliveries/services/delivery_service.py" "deliveries/services/delivery_service.py"
Send-File "taxi/rides/views.py" "taxi/rides/views.py"
Send-File "taxi/security/abuse.py" "taxi/security/abuse.py"
Send-File "payments/webhooks.py" "payments/webhooks.py"
Send-File "payments/urls.py" "payments/urls.py"

Write-Host "=== Rebuild django + migrate + health ==="
ssh $Remote @'
set -euo pipefail
cd /opt/yala

ENV_FILE=/opt/yala/backend/taxi/.env.production
touch "$ENV_FILE"
grep -q '^PLAY_INTEGRITY_ENFORCE=' "$ENV_FILE" || echo 'PLAY_INTEGRITY_ENFORCE=false' >> "$ENV_FILE"
grep -q '^MAX_CONCURRENT_DEVICE_SESSIONS=' "$ENV_FILE" || echo 'MAX_CONCURRENT_DEVICE_SESSIONS=5' >> "$ENV_FILE"
grep -q '^ADMIN_2FA_ENABLED=' "$ENV_FILE" || echo 'ADMIN_2FA_ENABLED=true' >> "$ENV_FILE"

docker compose -p yala build django
docker compose -p yala up -d django

for _ in $(seq 1 50); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"

docker compose -p yala exec -T django python manage.py migrate authapp --noinput
docker compose -p yala exec -T django python manage.py migrate admin_2fa --noinput
docker compose -p yala exec -T django python manage.py migrate --noinput

curl -fsS https://api.yalataxi.live/health/
echo
'@

Write-Host "=== Verify Phase 2 endpoints ==="
$verify = Join-Path $RepoRoot "scripts\verify-phase2-prod.py"
python $verify
if ($LASTEXITCODE -ne 0) { throw "Phase 2 verify failed with exit $LASTEXITCODE" }

Write-Host "=== Phase 2 backend deploy complete ==="

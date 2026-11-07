<#
.SYNOPSIS
  Local verification for ONE coordinated release (Admin + backend + Moosyl). Does NOT deploy.

.EXAMPLE
  .\scripts\run-coordinated-verification.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$fe = Join-Path $root "frontend"
$be = Join-Path $root "backend\taxi"
$log = Join-Path $root "engineering\verification-runs"
New-Item -ItemType Directory -Force -Path $log | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $log "coordinated-$stamp.txt"

function Log($msg) { Add-Content -Path $out -Value $msg; Write-Host $msg }

Log "=== YALA coordinated verification $stamp ==="

Push-Location $be
Log "--- Django: Moosyl core ---"
python manage.py test payments.tests_moosyl_options payments.tests_moosyl_webhook payments.tests_provider_security --verbosity=1 2>&1 | Tee-Object -FilePath $out -Append
Log "--- Django: admin backend slice ---"
python manage.py test employees.tests.test_id_card_dashboard operations.tests_city_id_bridge locations.tests_operating_cities --verbosity=1 2>&1 | Tee-Object -FilePath $out -Append
Pop-Location

Push-Location $fe
$env:CI = "true"
Log "--- Frontend Jest (in-band) ---"
npm test -- --watchAll=false --runInBand 2>&1 | Tee-Object -FilePath $out -Append
Log "--- build:web (production SPA for coordinated deploy) ---"
npm run build:web 2>&1 | Tee-Object -FilePath $out -Append
Pop-Location

Log "=== Done. Log: $out ==="
Log "Next: serve build, run qa/admin-routes-auth-roles-mock.cjs with YALA_QA_CRITICAL_ONLY=1"
Log "Staging: Moosyl sandbox checklist in engineering/MOOSYL_INTEGRATION_STATUS.md"

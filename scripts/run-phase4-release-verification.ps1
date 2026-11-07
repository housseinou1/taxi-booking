<#
.SYNOPSIS
  Phase 4 verification for Employee ID Cards + Moosyl (local only; no deploy).

.EXAMPLE
  .\scripts\run-phase4-release-verification.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$be = Join-Path $root "backend\taxi"
$fe = Join-Path $root "frontend"
$logDir = Join-Path $root "engineering\verification-runs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $logDir "phase4-$stamp.txt"

function Log($msg) { Add-Content -Path $out -Value $msg; Write-Host $msg }

Log "=== Phase 4 release verification $stamp ==="

Push-Location $be
$env:YALA_UAT_LOCAL = "1"
Log "--- employees.tests (all) ---"
python manage.py test employees.tests --verbosity=1 2>&1 | Tee-Object -FilePath $out -Append
Log "--- Moosyl Django slice ---"
python manage.py test payments.tests_moosyl_options payments.tests_moosyl_webhook payments.tests_provider_security --verbosity=1 2>&1 | Tee-Object -FilePath $out -Append
Log "--- wallet_reference_inventory ---"
python manage.py wallet_reference_inventory 2>&1 | Tee-Object -FilePath $out -Append
Pop-Location

Push-Location $fe
$env:CI = "true"
Log "--- Frontend Jest (Employee + Moosyl, in-band) ---"
npm test -- --watchAll=false --runInBand --testPathPattern="Employee|Moosyl|employees" 2>&1 | Tee-Object -FilePath $out -Append
Log "--- build:web (default gates; prod legacy optional) ---"
if (-not $env:REACT_APP_PROD_LEGACY_BACKEND) { $env:REACT_APP_PROD_LEGACY_BACKEND = "1" }
npm run build:web 2>&1 | Tee-Object -FilePath $out -Append
& (Join-Path $root "scripts\verify-web-build.ps1") -BuildDir (Join-Path $fe "build") 2>&1 | Tee-Object -FilePath $out -Append
Pop-Location

Log "=== Done. Log: $out ==="

# Start Django API + Admin frontend for local / Cursor browser review.
# Does NOT deploy. Uses DEBUG=True so CORS allows http://localhost:3000.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $RepoRoot "backend\taxi"
$Frontend = Join-Path $RepoRoot "frontend"

$env:DJANGO_DEBUG = "True"
$env:DJANGO_SECRET_KEY = "dev-local-only-key"
$env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1"

Write-Host "=== YALA local admin review ===" -ForegroundColor Cyan
Write-Host "API:      http://127.0.0.1:8000"
Write-Host "Admin UI: http://localhost:3000/login?next=/admin"
Write-Host "Use a staff user (e.g. local-admin@yala.local) — not production credentials."
Write-Host ""

$apiListening = (netstat -ano | Select-String ":8000.*LISTENING")
if (-not $apiListening) {
  Write-Host "Starting Django on 127.0.0.1:8000 ..."
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$Backend'; `$env:DJANGO_DEBUG='True'; `$env:DJANGO_SECRET_KEY='dev-local-only-key'; `$env:DJANGO_ALLOWED_HOSTS='localhost,127.0.0.1'; python manage.py runserver 127.0.0.1:8000"
  )
} else {
  Write-Host "Port 8000 already in use — assuming Django is running."
}

$webListening = (netstat -ano | Select-String ":3000.*LISTENING")
if (-not $webListening) {
  Write-Host "Starting Admin frontend (npm run start:admin) ..."
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$Frontend'; npm run start:admin"
  )
} else {
  Write-Host "Port 3000 already in use — assuming React dev server is running."
  Write-Host "If login hits production, stop it and run: cd frontend; npm run start:admin"
}

Write-Host ""
Write-Host "Open Cursor browser: http://localhost:3000/login?next=/admin"

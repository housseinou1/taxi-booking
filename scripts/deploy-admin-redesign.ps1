<#
.SYNOPSIS
  Coordinated release — WEB build upload step (www.yalataxi.live static SPA).

.DESCRIPTION
  Swaps the static SPA only: /opt/yala/frontend/build -> /usr/share/nginx/html.
  MUST be produced with `npm run build:web` (not build:admin).

  Coordinated production also requires backend deploy + migrations + worker restart
  in the same release window. This script does NOT run Django, migrate, or Moosyl activation.

  Run scripts/verify-web-build.ps1 before this script.

.EXAMPLE
  .\scripts\deploy-admin-redesign.ps1 -BuildDir "C:\Users\Housseinou\Projects\Django\yala-release-74743e52\frontend\build"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BuildDir,
  [string]$Remote     = 'root@142.93.99.142',
  [string]$Live       = '/opt/yala/frontend/build',
  [string]$BackupRoot = '/home/yala'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) { throw "ABORT: $BuildDir\index.html not found" }

# ── 1. Release gates ─────────────────────────────────────────────────────────
$idx    = Get-Content (Join-Path $BuildDir 'index.html') -Raw
$m      = [regex]::Match($idx, 'main\.[a-f0-9]+\.js')
if (-not $m.Success) { throw 'ABORT: no content-hashed bundle referenced by index.html' }
$bundle = $m.Value
$jsPath = Join-Path $BuildDir ('static/js/' + $bundle)
$js     = Get-Content $jsPath -Raw

if ($js -notmatch 'REACT_APP_TYPE:"web"') { throw 'ABORT: bundle is not stamped REACT_APP_TYPE=web' }
if ($js -match 'REACT_APP_TYPE:"admin"')  { throw 'ABORT: ADMIN-stamped Capacitor artifact must never go to the public website' }
if ($js -notmatch 'yah-kpi')              { throw 'ABORT: redesigned Admin home not present in bundle' }

$jsDir = Join-Path $BuildDir 'static/js'
$moosylMarker = $false
Get-ChildItem $jsDir -Filter '*.js' -File | ForEach-Object {
  $chunk = Get-Content $_.FullName -Raw
  if ($chunk -match 'moosyl-panel|Moosyl payments') { $moosylMarker = $true }
}
if (-not $moosylMarker) {
  throw 'ABORT: Moosyl Finance Dashboard panel missing from web build (AdminPaymentDashboard moosyl tab)'
}

Write-Host 'Release gates PASS (web bundle + admin chrome + Moosyl finance panel)'
Write-Host ("  bundle        : {0}" -f $bundle)
Write-Host ("  index.html    : {0}" -f (Get-FileHash (Join-Path $BuildDir 'index.html') -Algorithm SHA256).Hash)
Write-Host ("  bundle sha256 : {0}" -f (Get-FileHash $jsPath -Algorithm SHA256).Hash)

# ── 2. Verified server-side backup of the live frontend ──────────────────────
$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = "$BackupRoot/pre-website-deploy-$stamp"
$backupCmd = 'set -e; DIR=' + $backupDir + '; mkdir -p $DIR; cp -a ' + $Live + ' $DIR/build;' +
             ' sha256sum ' + $Live + '/index.html > $DIR/live-index.sha256;' +
             ' sha256sum $DIR/build/index.html >> $DIR/live-index.sha256;' +
             ' A=$(head -1 $DIR/live-index.sha256 | cut -c1-64); B=$(tail -1 $DIR/live-index.sha256 | cut -c1-64);' +
             ' echo LIVE_INDEX_SHA=$A; echo BACKUP_INDEX_SHA=$B;' +
             ' if [ "$A" = "$B" ]; then echo BACKUP_VERIFY=OK; else echo BACKUP_VERIFY=MISMATCH; exit 1; fi;' +
             ' echo BACKUP_DIR=$DIR'
Write-Host "`n=== 2. Server-side backup ==="
ssh $Remote $backupCmd

# ── 3. Upload as an overlay (never --delete) ─────────────────────────────────
# Content-hashed bundles that are no longer referenced are deliberately kept:
# a client holding a cached index.html / service worker would otherwise 404.
$tar = Join-Path $env:TEMP "yala-frontend-$stamp.tgz"
Write-Host "`n=== 3. Pack + upload ==="
tar.exe -czf $tar -C $BuildDir .
scp -o BatchMode=yes $tar "${Remote}:/tmp/yala-frontend-$stamp.tgz"
ssh $Remote ('set -e; cd ' + $Live + ' && tar -xzf /tmp/yala-frontend-' + $stamp + '.tgz && rm -f /tmp/yala-frontend-' + $stamp + '.tgz && echo EXTRACTED')
Remove-Item -LiteralPath $tar -Force

# ── 4. Verify what is actually served ────────────────────────────────────────
Write-Host "`n=== 4. Live verification ==="
Start-Sleep -Seconds 2
$liveHtml = (Invoke-WebRequest -UseBasicParsing 'https://www.yalataxi.live/').Content
Write-Host ("live bundle now: {0}" -f ([regex]::Match($liveHtml, 'main\.[a-f0-9]+\.js')).Value)
Write-Host 'Deploy complete. Hard-refresh https://yalataxi.live/admin (Ctrl+Shift+R).'

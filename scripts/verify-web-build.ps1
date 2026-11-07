<#
.SYNOPSIS
  Pre-flight gates for coordinated release web artifact (npm run build:web). Does NOT deploy.

.EXAMPLE
  cd frontend; npm run build:web
  ..\scripts\verify-web-build.ps1 -BuildDir .\build
#>
param(
  [Parameter(Mandatory = $true)][string]$BuildDir
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) { throw "ABORT: index.html missing" }

$idx = Get-Content (Join-Path $BuildDir 'index.html') -Raw
$m = [regex]::Match($idx, 'main\.[a-f0-9]+\.js')
if (-not $m.Success) { throw 'ABORT: no hashed main bundle in index.html' }
$mainPath = Join-Path $BuildDir ('static/js/' + $m.Value)
$main = Get-Content $mainPath -Raw

if ($main -notmatch 'REACT_APP_TYPE:"web"') { throw 'ABORT: use npm run build:web (REACT_APP_TYPE=web)' }
if ($main -match 'REACT_APP_TYPE:"admin"') { throw 'ABORT: admin-only bundle must not ship to www' }
if ($main -notmatch 'yah-kpi') { throw 'ABORT: redesigned admin home markers missing' }

$jsFiles = Get-ChildItem (Join-Path $BuildDir 'static/js') -Filter '*.js' -File
$moosylFound = $false
foreach ($f in $jsFiles) {
  $chunk = Get-Content $f.FullName -Raw
  if ($chunk -match 'moosyl-panel|Moosyl payments') { $moosylFound = $true; break }
}
if (-not $moosylFound) {
  throw 'ABORT: Moosyl Finance panel not found in bundle (expected moosyl-tab on /admin/payments)'
}

Write-Host 'verify-web-build: PASS'
Write-Host ("  main bundle : {0}" -f $m.Value)
Write-Host ("  sha256      : {0}" -f (Get-FileHash $mainPath -Algorithm SHA256).Hash)
Write-Host '  Moosyl panel: present in JS chunks'

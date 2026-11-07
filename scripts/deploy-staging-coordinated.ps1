<#
.SYNOPSIS
  Upload coordinated build:web SPA to STAGING only (never defaults to production).

.PARAMETER Remote
  Required. Example: yala@STAGING_IP or root@NEW_DROPLET_IP — not 142.93.99.142.

.EXAMPLE
  $env:REACT_APP_API_URL='https://api-staging.yalataxi.live'
  cd frontend; npm run build:web
  ..\scripts\verify-web-build.ps1 -BuildDir .\build
  ..\scripts\deploy-staging-coordinated.ps1 -Remote 'yala@203.0.113.50' -BuildDir .\build
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Remote,
  [Parameter(Mandatory = $true)][string]$BuildDir,
  [string]$Live = '/opt/yala-staging/frontend/build',
  [string]$BackupRoot = '/home/yala-staging'
)

$ErrorActionPreference = 'Stop'

if ($Remote -match '142\.93\.99\.142') {
  throw 'ABORT: Remote is production. Use the staging droplet IP/host only.'
}

& (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'verify-web-build.ps1') -BuildDir $BuildDir

if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) { throw "ABORT: $BuildDir\index.html not found" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = "$BackupRoot/pre-website-deploy-$stamp"
$backupCmd = 'set -e; DIR=' + $backupDir + '; mkdir -p $DIR ' + $Live + '; if [ -f ' + $Live + '/index.html ]; then cp -a ' + $Live + ' $DIR/build; fi; echo BACKUP_DIR=$DIR'

Write-Host "=== Staging backup ($Remote) ==="
ssh $Remote $backupCmd

$tar = Join-Path $env:TEMP "yala-staging-frontend-$stamp.tgz"
tar.exe -czf $tar -C $BuildDir .
scp -o BatchMode=yes $tar "${Remote}:/tmp/yala-staging-frontend-$stamp.tgz"
ssh $Remote ('set -e; mkdir -p ' + $Live + ' && cd ' + $Live + ' && tar -xzf /tmp/yala-staging-frontend-' + $stamp + '.tgz && rm -f /tmp/yala-staging-frontend-' + $stamp + '.tgz && echo EXTRACTED')
Remove-Item -LiteralPath $tar -Force

Write-Host "Staging frontend upload complete. Reload nginx on staging if needed."

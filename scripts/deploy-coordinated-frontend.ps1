<#
.SYNOPSIS
  Coordinated release — verify and upload the WEB build only (one step of full coordinated deploy).

.DESCRIPTION
  Full production cut also requires backend deploy, migrate, workers, and staging sign-off (G1–G4).
  This script only validates build:web and runs the existing backup + overlay upload.

.EXAMPLE
  cd frontend; npm run build:web
  ..\scripts\verify-web-build.ps1 -BuildDir .\build
  ..\scripts\deploy-coordinated-frontend.ps1 -BuildDir .\build
#>
param(
  [Parameter(Mandatory = $true)][string]$BuildDir
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $root 'scripts\verify-web-build.ps1') -BuildDir $BuildDir
& (Join-Path $root 'scripts\deploy-admin-redesign.ps1') -BuildDir $BuildDir

#!/usr/bin/env pwsh
# build-step1-apk.ps1
# Build and sign Rider 1.2.7 (19) and Driver 1.2.7 (22) release AABs + APKs.
$ErrorActionPreference = "Stop"

$root       = Split-Path $PSScriptRoot -Parent
$credsFile  = Join-Path $root "signing\credentials.env"
$releaseDir = Join-Path $root "release\android"
$stamp      = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $credsFile)) {
    Write-Error "Signing credentials not found at: $credsFile"
    exit 1
}

# Load signing credentials
Get-Content $credsFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $pair = $_ -split '=', 2
    if ($pair.Count -eq 2) { Set-Item -Path "env:$($pair[0].Trim())" -Value $pair[1].Trim() }
}

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr" }
$env:PATH = "$($env:JAVA_HOME)\bin;$env:PATH"

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$apps = @(
    @{
        Label   = "Rider"
        Dir     = Join-Path $root "rider-app"
        Prefix  = "RIDER"
        OutName = "yala-rider"
    },
    @{
        Label   = "Driver"
        Dir     = Join-Path $root "driver-app"
        Prefix  = "DRIVER"
        OutName = "yala-driver"
    }
)

$built = @()

foreach ($app in $apps) {
    Write-Host ""
    Write-Host "=== Building $($app.Label) ===" -ForegroundColor Cyan

    $ks        = (Get-Item "env:YALA_$($app.Prefix)_KEYSTORE"       -ErrorAction SilentlyContinue)?.Value
    $storePass = (Get-Item "env:YALA_$($app.Prefix)_STORE_PASSWORD" -ErrorAction SilentlyContinue)?.Value
    $alias     = (Get-Item "env:YALA_$($app.Prefix)_KEY_ALIAS"      -ErrorAction SilentlyContinue)?.Value
    $keyPass   = (Get-Item "env:YALA_$($app.Prefix)_KEY_PASSWORD"   -ErrorAction SilentlyContinue)?.Value

    # Fallback to shared keys
    if (-not $ks)        { $ks        = $env:YALA_ANDROID_KEYSTORE }
    if (-not $storePass) { $storePass = $env:YALA_ANDROID_STORE_PASSWORD }
    if (-not $alias)     { $alias     = $env:YALA_ANDROID_KEY_ALIAS }
    if (-not $keyPass)   { $keyPass   = $env:YALA_ANDROID_KEY_PASSWORD }

    $env:YALA_ANDROID_KEYSTORE       = $ks
    $env:YALA_ANDROID_STORE_PASSWORD = $storePass
    $env:YALA_ANDROID_KEY_ALIAS      = $alias
    $env:YALA_ANDROID_KEY_PASSWORD   = $keyPass

    $androidDir = Join-Path $app.Dir "android"
    Push-Location $androidDir

    # Sync Capacitor web assets before build
    $capBin = Join-Path $app.Dir "node_modules\.bin\cap"
    if (Test-Path $capBin) {
        Write-Host "  Syncing Capacitor assets..." -ForegroundColor Gray
        & $capBin sync android 2>&1 | Out-Null
    }

    Write-Host "  Running Gradle bundleRelease + assembleRelease..." -ForegroundColor Gray
    & ".\gradlew.bat" bundleRelease assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Error "Gradle build failed for $($app.Label)"
        exit 1
    }
    Pop-Location

    # Read version from build.gradle
    $gradle  = Get-Content (Join-Path $androidDir "app\build.gradle") -Raw
    $code    = [regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
    $name    = [regex]::Match($gradle, 'versionName\s+"([^"]+)"').Groups[1].Value

    $srcAab  = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
    $srcApk  = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    $destAab = Join-Path $releaseDir "$($app.OutName)-$name-$code-$stamp.aab"
    $destApk = Join-Path $releaseDir "$($app.OutName)-$name-$code-$stamp.apk"

    Copy-Item $srcAab $destAab -Force
    Copy-Item $srcApk $destApk -Force -ErrorAction SilentlyContinue

    $built += [pscustomobject]@{
        App         = $app.Label
        VersionName = $name
        VersionCode = $code
        AAB         = $destAab
        APK         = $destApk
    }

    Write-Host "  Built $($app.Label) v$name ($code) → $destAab" -ForegroundColor Green
}

# Write report
$reportPath = Join-Path $releaseDir "build-report-step1-$stamp.json"
$built | ConvertTo-Json -Depth 4 | Set-Content $reportPath -Encoding UTF8

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
$built | Format-Table App, VersionName, VersionCode, AAB -AutoSize
Write-Host "Report: $reportPath" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan

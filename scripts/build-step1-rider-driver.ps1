$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$credsFile = Join-Path $root "signing\credentials.env"
$releaseDir = Join-Path $root "release\android"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Get-Content $credsFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $pair = $_ -split '=', 2
  if ($pair.Count -eq 2) { Set-Item -Path "env:$($pair[0].Trim())" -Value $pair[1].Trim() }
}

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr" }
$env:PATH = ($env:JAVA_HOME + "\bin;" + $env:PATH)
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$apps = @(
  @{ Label = "Rider"; Dir = Join-Path $root "rider-app"; Prefix = "RIDER"; OutName = "yala-rider" },
  @{ Label = "Driver"; Dir = Join-Path $root "driver-app"; Prefix = "DRIVER"; OutName = "yala-driver" }
)

$built = @()
foreach ($app in $apps) {
  Write-Host "=== Building $($app.Label) ===" -ForegroundColor Cyan
  $ks = (Get-Item ("env:YALA_" + $app.Prefix + "_KEYSTORE")).Value
  $storePass = (Get-Item ("env:YALA_" + $app.Prefix + "_STORE_PASSWORD")).Value
  $alias = (Get-Item ("env:YALA_" + $app.Prefix + "_KEY_ALIAS")).Value
  $keyPass = (Get-Item ("env:YALA_" + $app.Prefix + "_KEY_PASSWORD")).Value
  $env:YALA_ANDROID_KEYSTORE = $ks
  $env:YALA_ANDROID_STORE_PASSWORD = $storePass
  $env:YALA_ANDROID_KEY_ALIAS = $alias
  $env:YALA_ANDROID_KEY_PASSWORD = $keyPass

  Push-Location (Join-Path $app.Dir "android")
  .\gradlew.bat bundleRelease assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "gradle failed for $($app.Label)" }
  Pop-Location

  $gradle = Get-Content (Join-Path $app.Dir "android\app\build.gradle") -Raw
  $code = [regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
  $name = [regex]::Match($gradle, 'versionName\s+"([^"]+)"').Groups[1].Value
  $srcAab = Join-Path $app.Dir "android\app\build\outputs\bundle\release\app-release.aab"
  $srcApk = Join-Path $app.Dir "android\app\build\outputs\apk\release\app-release.apk"
  $destAab = Join-Path $releaseDir ($app.OutName + "-" + $name + "-" + $code + "-" + $stamp + ".aab")
  $destApk = Join-Path $releaseDir ($app.OutName + "-" + $name + "-" + $code + "-" + $stamp + ".apk")
  Copy-Item $srcAab $destAab -Force
  Copy-Item $srcApk $destApk -Force
  $built += [pscustomobject]@{ App = $app.Label; VersionName = $name; VersionCode = $code; AAB = $destAab; APK = $destApk }
  Write-Host "Built $($app.Label) -> $destAab" -ForegroundColor Green
}

$reportPath = Join-Path $releaseDir ("build-report-step1-" + $stamp + ".json")
$built | ConvertTo-Json -Depth 4 | Set-Content $reportPath -Encoding UTF8
$built | Format-Table App, VersionName, VersionCode, AAB -AutoSize

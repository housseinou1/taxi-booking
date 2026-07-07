$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$credsFile = Join-Path $root "signing\credentials.env"
$releaseDir = Join-Path $root "release\android"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not (Test-Path $credsFile)) {
  Write-Error "Missing signing/credentials.env - run scripts/generate-upload-keys.ps1 first."
}

Get-Content $credsFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $pair = $_ -split '=', 2
  if ($pair.Count -eq 2) {
    Set-Item -Path "env:$($pair[0].Trim())" -Value $pair[1].Trim()
  }
}

if (-not $env:JAVA_HOME) {
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = ($env:JAVA_HOME + "\bin;" + $env:PATH)

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

function Import-GradleVersion {
  param([string]$GradleFile)
  $content = Get-Content $GradleFile -Raw
  $codeMatch = [regex]::Match($content, 'versionCode\s+(\d+)')
  $nameMatch = [regex]::Match($content, 'versionName\s+"([^"]+)"')
  return @{ Code = $codeMatch.Groups[1].Value; Name = $nameMatch.Groups[1].Value }
}

function Get-CertSummary {
  param([string]$Keystore, [string]$StorePassword, [string]$Alias)
  $out = & keytool -list -v -keystore $Keystore -storepass $StorePassword -alias $Alias 2>&1 | Out-String
  $shaMatch = [regex]::Match($out, 'SHA256:\s*(.+)')
  $ownerMatch = [regex]::Match($out, 'Owner:\s*(.+)')
  return @{ SHA256 = $shaMatch.Groups[1].Value.Trim(); Owner = $ownerMatch.Groups[1].Value.Trim() }
}

$apps = @(
  @{ Label = "Rider"; Dir = Join-Path $root "rider-app"; Prefix = "RIDER"; OutName = "yala-rider" },
  @{ Label = "Driver"; Dir = Join-Path $root "driver-app"; Prefix = "DRIVER"; OutName = "yala-driver" },
  @{ Label = "Delivery"; Dir = Join-Path $root "delivery-app"; Prefix = "DELIVERY"; OutName = "yala-delivery" }
)

$report = @()

foreach ($app in $apps) {
  Write-Host ""
  Write-Host "=== Building Yala $($app.Label) ===" -ForegroundColor Cyan

  $ks = (Get-Item ("env:YALA_" + $app.Prefix + "_KEYSTORE")).Value
  $storePass = (Get-Item ("env:YALA_" + $app.Prefix + "_STORE_PASSWORD")).Value
  $alias = (Get-Item ("env:YALA_" + $app.Prefix + "_KEY_ALIAS")).Value
  $keyPass = (Get-Item ("env:YALA_" + $app.Prefix + "_KEY_PASSWORD")).Value

  $env:YALA_ANDROID_KEYSTORE = $ks
  $env:YALA_ANDROID_STORE_PASSWORD = $storePass
  $env:YALA_ANDROID_KEY_ALIAS = $alias
  $env:YALA_ANDROID_KEY_PASSWORD = $keyPass

  Push-Location $app.Dir
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build failed for $($app.Label)" }
  if (-not (Test-Path (Join-Path $app.Dir "www\index.html"))) {
    $www = Join-Path $app.Dir "www"
    if (Test-Path $www) { Remove-Item $www -Recurse -Force }
    Copy-Item (Join-Path $root "frontend\build") $www -Recurse -Force
    $stampType = $app.Label.ToLower()
    node (Join-Path $root "frontend\scripts\stamp-native-app-type.js") $stampType $www
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "stamp failed for $($app.Label)" }
  }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "cap sync failed for $($app.Label)" }
  Pop-Location

  $gradleFile = Join-Path $app.Dir "android\app\build.gradle"
  $version = Import-GradleVersion $gradleFile

  Push-Location (Join-Path $app.Dir "android")
  .\gradlew.bat bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "gradlew bundleRelease failed for $($app.Label)" }
  Pop-Location

  $srcAab = Join-Path $app.Dir "android\app\build\outputs\bundle\release\app-release.aab"
  if (-not (Test-Path $srcAab)) {
    Write-Error ("AAB not found for {0}: {1}" -f $app.Label, $srcAab)
  }

  $destAab = Join-Path $releaseDir ($app.OutName + "-" + $version.Name + "-" + $version.Code + "-" + $stamp + ".aab")
  Copy-Item $srcAab $destAab -Force

  $cert = Get-CertSummary -Keystore $ks -StorePassword $storePass -Alias $alias

  $report += [pscustomobject]@{
    App = ("Yala " + $app.Label)
    VersionCode = $version.Code
    VersionName = $version.Name
    Output = $destAab
    Keystore = $ks
    Alias = $alias
    SHA256 = $cert.SHA256
    Owner = $cert.Owner
  }

  Write-Host ("Built {0} -> {1}" -f $app.Label, $destAab) -ForegroundColor Green
}

$reportPath = Join-Path $releaseDir ("build-report-" + $stamp + ".json")
$report | ConvertTo-Json -Depth 4 | Set-Content $reportPath -Encoding UTF8

Write-Host ""
Write-Host "=== RELEASE BUILD REPORT ===" -ForegroundColor Yellow
$report | Format-Table App, VersionName, VersionCode, Output -AutoSize
Write-Host ("Full report: " + $reportPath)

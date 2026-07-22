$ErrorActionPreference = "Stop"

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$root = $PSScriptRoot
$apkDir = Join-Path $root "android\app\build\outputs\apk\debug"
$apkLatest = Join-Path $apkDir "app-debug-latest.apk"
$apkBase = Join-Path $apkDir "app-debug.apk"
$assetsSrc = Join-Path $root "android\app\src\main\assets\public"
$package = "com.yala.rider.mr"

if (-not (Test-Path $adb)) {
  Write-Error "adb not found. Install Android SDK platform-tools."
}

if (-not (Test-Path $assetsSrc)) {
  Write-Error "Web assets missing. Run: npm run build; npx cap sync android"
}

Write-Host "Waiting for Android device (USB debugging ON)..."
& $adb kill-server | Out-Null
& $adb start-server | Out-Null

$serial = $null
for ($i = 0; $i -lt 36; $i++) {
  $line = & $adb devices | Select-String "`tdevice$" | Select-Object -First 1
  if ($line) {
    $serial = $line.ToString().Split("`t")[0]
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $serial) {
  Write-Error "No Android device found. Plug in phone, enable USB debugging, tap Allow."
}

Write-Host "Using device $serial"

$gradleApk = Join-Path $apkDir "app-debug.apk"
if (-not (Test-Path $gradleApk)) {
  Write-Error "Gradle APK missing at $gradleApk. Run: npm run build; npx cap sync android; cd android; .\gradlew assembleDebug"
}

Write-Host "Installing fresh Gradle APK (avoids broken resource repack)..."
Write-Host "Installing to $serial ..."
& $adb -s $serial install -r $gradleApk 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Retry after uninstall..."
  & $adb -s $serial uninstall $package 2>&1
  & $adb -s $serial install $gradleApk 2>&1
}

if ($LASTEXITCODE -eq 0) {
  & $adb -s $serial shell monkey -p $package -c android.intent.category.LAUNCHER 1
  Write-Host "Done. Yala Rider installed on your phone."
} else {
  exit $LASTEXITCODE
}

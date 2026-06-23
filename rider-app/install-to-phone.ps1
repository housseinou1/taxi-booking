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

if (-not (Test-Path $apkBase)) {
  Write-Host "No local base APK - pulling installed Yala Rider from phone..."
  $pathLine = & $adb -s $serial shell pm path $package 2>&1 | Select-String "package:"
  if (-not $pathLine) {
    Write-Error "Yala Rider not on phone and no debug APK on PC. Build APK in Android Studio, then re-run this script."
  }

  $remoteApk = ($pathLine.ToString() -replace "^package:", "").Trim()
  New-Item -ItemType Directory -Path $apkDir -Force | Out-Null
  & $adb -s $serial pull $remoteApk $apkBase | Out-Null
  Write-Host "Pulled base APK to $apkBase"
}

Write-Host "Patching APK with latest rider UI..."
$patchFile = Join-Path $env:TEMP "yala-rider-patch.py"
@'
import zipfile, os, shutil, subprocess, sys
apk_src = sys.argv[1]
assets_src = sys.argv[2]
signed = sys.argv[3]
bt = os.path.join(os.environ["LOCALAPPDATA"], "Android", "Sdk", "build-tools", "34.0.0")
ks = os.path.join(os.environ["USERPROFILE"], ".android", "debug.keystore")
work = os.path.join(os.path.dirname(signed), "patch-work")
unsigned = os.path.join(work, "unsigned.apk")
aligned = os.path.join(work, "aligned.apk")
extracted = os.path.join(work, "extracted")
if os.path.exists(work):
    shutil.rmtree(work)
os.makedirs(extracted)
with zipfile.ZipFile(apk_src, "r") as z:
    z.extractall(extracted)
shutil.rmtree(os.path.join(extracted, "assets", "public"), ignore_errors=True)
shutil.copytree(assets_src, os.path.join(extracted, "assets", "public"))
with zipfile.ZipFile(unsigned, "w") as out:
    for root, _, files in os.walk(extracted):
        for name in files:
            full = os.path.join(root, name)
            arc = os.path.relpath(full, extracted).replace("\\\\", "/")
            lower = name.lower()
            if lower == "resources.arsc" or lower.endswith(".so"):
                out.write(full, arc, compress_type=zipfile.ZIP_STORED)
            else:
                out.write(full, arc, compress_type=zipfile.ZIP_DEFLATED)
subprocess.check_call([os.path.join(bt, "zipalign.exe"), "-f", "4", unsigned, aligned])
subprocess.check_call([
    os.path.join(bt, "apksigner.bat"), "sign",
    "--ks", ks, "--ks-pass", "pass:android", "--key-pass", "pass:android",
    "--out", signed, aligned,
])
print("SIGNED", signed)
'@ | Set-Content -Path $patchFile -Encoding UTF8

python $patchFile $apkBase $assetsSrc $apkLatest

Write-Host "Installing to $serial ..."
& $adb -s $serial install -r $apkLatest 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Retry after uninstall..."
  & $adb -s $serial uninstall $package 2>&1
  & $adb -s $serial install $apkLatest 2>&1
}

if ($LASTEXITCODE -eq 0) {
  & $adb -s $serial shell monkey -p $package -c android.intent.category.LAUNCHER 1
  Write-Host "Done. Yala Rider installed on your phone."
} else {
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$root = $PSScriptRoot
$apkDir = Join-Path $root "android\app\build\outputs\apk\debug"
$apkLatest = Join-Path $apkDir "app-debug-latest.apk"
$apkBase = Join-Path $apkDir "app-debug.apk"
$assetsRoot = Join-Path $root "android\app\src\main\assets"
$assetsSrc = Join-Path $assetsRoot "public"
$androidRes = Join-Path $root "android\app\src\main\res"
$package = "com.yala.delivery.mr"

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
  Write-Host "No local base APK - pulling installed Yala Delivery from phone..."
  $pathLine = & $adb -s $serial shell pm path $package 2>&1 | Select-String "package:"
  if (-not $pathLine) {
    Write-Error "Yala Delivery not on phone and no debug APK on PC. Open delivery-app\android in Android Studio, Build APK, then re-run this script."
  }

  $remoteApk = ($pathLine.ToString() -replace "^package:", "").Trim()
  New-Item -ItemType Directory -Path $apkDir -Force | Out-Null
  & $adb -s $serial pull $remoteApk $apkBase | Out-Null
  Write-Host "Pulled base APK to $apkBase"
}

Write-Host "Patching APK with latest delivery UI..."
$patchFile = Join-Path $env:TEMP "yala-delivery-patch.py"
@'
import zipfile, os, shutil, subprocess, sys
apk_src = sys.argv[1]
assets_root = sys.argv[2]
signed = sys.argv[3]
android_res = sys.argv[4] if len(sys.argv) > 4 else ""
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
shutil.copytree(os.path.join(assets_root, "public"), os.path.join(extracted, "assets", "public"))
for config_name in ("capacitor.config.json", "capacitor.plugins.json"):
    config_src = os.path.join(assets_root, config_name)
    if os.path.isfile(config_src):
        shutil.copy2(config_src, os.path.join(extracted, "assets", config_name))
plugins_path = os.path.join(extracted, "assets", "capacitor.plugins.json")
if os.path.isfile(plugins_path):
    import json
    dex_data = b"".join(
        open(os.path.join(extracted, name), "rb").read()
        for name in os.listdir(extracted)
        if name.endswith(".dex")
    )
    plugins = json.load(open(plugins_path, "r", encoding="utf-8"))
    filtered = []
    for plugin in plugins:
        classpath = plugin.get("classpath", "")
        class_name = classpath.rsplit(".", 1)[-1]
        if class_name and class_name.encode("utf-8") not in dex_data:
            continue
        filtered.append(plugin)
    with open(plugins_path, "w", encoding="utf-8") as handle:
        json.dump(filtered, handle, indent="\t")
        handle.write("\n")
if android_res and os.path.isdir(android_res):
    density_map = {
        "mipmap-mdpi": "mipmap-mdpi-v4",
        "mipmap-hdpi": "mipmap-hdpi-v4",
        "mipmap-xhdpi": "mipmap-xhdpi-v4",
        "mipmap-xxhdpi": "mipmap-xxhdpi-v4",
        "mipmap-xxxhdpi": "mipmap-xxxhdpi-v4",
    }
    icon_names = ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")
    for src_folder, dst_folder in density_map.items():
        src_dir = os.path.join(android_res, src_folder)
        dst_dir = os.path.join(extracted, "res", dst_folder)
        if not os.path.isdir(src_dir) or not os.path.isdir(dst_dir):
            continue
        for icon_name in icon_names:
            src = os.path.join(src_dir, icon_name)
            dst = os.path.join(dst_dir, icon_name)
            if os.path.isfile(src):
                shutil.copy2(src, dst)
with zipfile.ZipFile(unsigned, "w") as out:
    for root, _, files in os.walk(extracted):
        for name in files:
            full = os.path.join(root, name)
            arc = os.path.relpath(full, extracted).replace(os.sep, "/")
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

python $patchFile $apkBase $assetsRoot $apkLatest $androidRes

Write-Host "Installing to $serial ..."
& $adb -s $serial install -r $apkLatest 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Retry after uninstall..."
  & $adb -s $serial uninstall $package 2>&1
  & $adb -s $serial install $apkLatest 2>&1
}

if ($LASTEXITCODE -eq 0) {
  & $adb -s $serial shell monkey -p $package -c android.intent.category.LAUNCHER 1
  Write-Host "Done. Yala Delivery installed on your phone."
} else {
  exit $LASTEXITCODE
}

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$signingDir = Join-Path $root "signing"
$credsFile = Join-Path $signingDir "credentials.env"
$keytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"

if (-not (Test-Path $keytool)) {
  $studioJbr = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
  if (Test-Path $studioJbr) {
    $keytool = $studioJbr
    $env:JAVA_HOME = Split-Path (Split-Path $studioJbr -Parent) -Parent
  } else {
    Write-Error "keytool not found. Set JAVA_HOME or install Android Studio."
  }
}

New-Item -ItemType Directory -Path $signingDir -Force | Out-Null

function New-RandomPassword {
  param([int]$Length = 24)
  $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%_-"
  -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

$apps = @(
  @{ Name = "rider"; Keystore = "yala-rider-upload.jks"; Alias = "yala-rider-upload"; Dname = "CN=Yala Rider Upload, OU=Mobile, O=Yala Taxi MR, L=Nouakchott, ST=Nouakchott, C=MR" },
  @{ Name = "driver"; Keystore = "yala-driver-upload.jks"; Alias = "yala-driver-upload"; Dname = "CN=Yala Driver Upload, OU=Mobile, O=Yala Taxi MR, L=Nouakchott, ST=Nouakchott, C=MR" },
  @{ Name = "delivery"; Keystore = "yala-delivery-upload.jks"; Alias = "yala-delivery-upload"; Dname = "CN=Yala Delivery Upload, OU=Mobile, O=Yala Taxi MR, L=Nouakchott, ST=Nouakchott, C=MR" }
)

$lines = @(
  "# Yala Android upload keys - generated $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "# NEVER commit this file.",
  ""
)

foreach ($app in $apps) {
  $ksPath = Join-Path $signingDir $app.Keystore
  if (Test-Path $ksPath) {
    Write-Host "Skip $($app.Name): $($app.Keystore) already exists"
    continue
  }

  $storePass = New-RandomPassword
  $keyPass = New-RandomPassword

  & $keytool -genkeypair -v `
    -storetype PKCS12 `
    -keystore $ksPath `
    -alias $app.Alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $storePass `
    -keypass $keyPass `
    -dname $app.Dname

  $lines += "YALA_$($app.Name.ToUpper())_KEYSTORE=$ksPath"
  $lines += "YALA_$($app.Name.ToUpper())_STORE_PASSWORD=$storePass"
  $lines += "YALA_$($app.Name.ToUpper())_KEY_ALIAS=$($app.Alias)"
  $lines += "YALA_$($app.Name.ToUpper())_KEY_PASSWORD=$keyPass"
  $lines += ""

  Write-Host "Created $($app.Keystore)"
}

if (-not (Test-Path $credsFile)) {
  Set-Content -Path $credsFile -Value ($lines -join [Environment]::NewLine) -Encoding UTF8
  Write-Host "Wrote $credsFile"
} else {
  Write-Host "Kept existing $credsFile (new keys appended only if missing)."
}

Write-Host "Done. Store credentials.env in a password manager."

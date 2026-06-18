param(
  [string]$Apk = "",
  [ValidateSet("install", "logcat", "run", "all")]
  [string]$Action = "all",
  [string]$Arch = "",
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$Package = "com.twikiastudios.logicplate"
$Activity = "$Package/.MainActivity"
$Repo = Split-Path $PSScriptRoot -Parent
$Short = "C:\platebound"
$DefaultApk = Join-Path $Short "android\app\build\outputs\apk\release\app-release.apk"

function Ensure-Adb {
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adb) {
    $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
    if (-not (Test-Path $sdk)) { throw "adb not found. Install Android SDK platform-tools or add to PATH." }
    $env:PATH = (Split-Path $sdk) + ";" + $env:PATH
  }
}

function Get-DeviceAbi {
  $abi = (adb shell getprop ro.product.cpu.abi 2>$null).Trim()
  if (-not $abi) { return "arm64-v8a" }
  switch -Regex ($abi) {
    "^x86_64$" { return "x86_64" }
    "^x86$" { return "x86" }
    "^arm64" { return "arm64-v8a" }
    "^armeabi" { return "armeabi-v7a" }
    default { return "arm64-v8a" }
  }
}

function Build-Apk {
  param([string]$TargetArch)
  $env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

  Write-Host "Syncing repo -> $Short ..."
  robocopy $Repo $Short /E /XD "android\app\build" "android\app\.cxx" "android\build" "android\.gradle" ".expo" ".git" /NFL /NDL /NJH /NJS | Out-Null

  Push-Location $Repo
  npx expo prebuild --platform android --no-install
  Pop-Location

  robocopy (Join-Path $Repo "android") (Join-Path $Short "android") /E /XD "app\build" "app\.cxx" "build" ".gradle" /NFL /NDL /NJH /NJS | Out-Null

  Write-Host "Building release APK for $TargetArch (from $Short)..."
  Push-Location (Join-Path $Short "android")
  .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$TargetArch" --no-daemon
  Pop-Location
}

Ensure-Adb

$devices = @(adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" })
if ($devices.Count -eq 0) {
  throw "No Android device/emulator attached. Run 'adb devices' after enabling USB debugging or starting an emulator."
}

if (-not $Arch) { $Arch = Get-DeviceAbi }
Write-Host "Target device ABI: $Arch"

if ($Build) {
  Build-Apk -TargetArch $Arch
}

if (-not $Apk) { $Apk = $DefaultApk }
if (-not (Test-Path $Apk)) {
  throw "APK not found at $Apk. Pass -Apk or -Build."
}

if ($Action -in @("install", "all", "run")) {
  Write-Host "Installing $Apk ..."
  adb install -r $Apk
}

if ($Action -in @("run", "all")) {
  adb logcat -c | Out-Null
  adb shell am start -n $Activity | Out-Null
  Write-Host "Launched $Activity"
}

if ($Action -in @("logcat", "all", "run")) {
  Write-Host "Tailing logcat (Ctrl+C to stop). Filters: AndroidRuntime, ReactNativeJS, Expo, SoLoader"
  adb logcat -v time AndroidRuntime:E ReactNativeJS:E ReactNative:V ExpoModules:V SoLoader:W ReactNativeJNI:E *:S
}

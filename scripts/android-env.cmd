@echo off
REM =============================================================================
REM YALA - Android build environment [SESSION ONLY]
REM
REM Sets JAVA_HOME / ANDROID_SDK_ROOT / PATH for the CURRENT shell only.
REM It does NOT change machine or user environment variables and installs nothing.
REM
REM Discovered on this machine:
REM   JDK : Android Studio bundled JetBrains Runtime, OpenJDK 21.0.10
REM   SDK : %%LOCALAPPDATA%%\Android\Sdk  with platform-tools, platforms
REM         android-36, build-tools 36.1.0, emulator and licenses
REM   Required by all three apps: compileSdk 36 / targetSdk 36 / minSdk 24 - OK
REM
REM Usage:
REM   scripts\android-env.cmd                  sets the vars in this shell
REM   scripts\android-env.cmd bundleRelease    sets them, then runs gradlew
REM
REM Note: JDK 21 works with the current Android Gradle Plugin. If a build reports
REM a Java-version incompatibility, install JDK 17 and point YALA_JDK at it.
REM =============================================================================

set "YALA_JDK=C:\Program Files\Android\Android Studio\jbr"
set "YALA_SDK=%LOCALAPPDATA%\Android\Sdk"

if not exist "%YALA_JDK%\bin\java.exe" goto no_jdk
if not exist "%YALA_SDK%\platform-tools" goto no_sdk

set "JAVA_HOME=%YALA_JDK%"
set "ANDROID_HOME=%YALA_SDK%"
set "ANDROID_SDK_ROOT=%YALA_SDK%"
set "PATH=%YALA_JDK%\bin;%YALA_SDK%\platform-tools;%YALA_SDK%\cmdline-tools\latest\bin;%PATH%"

echo [yala] JAVA_HOME=%JAVA_HOME%
echo [yala] ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%
java -version
adb version

if "%~1"=="" goto ready

echo [yala] Running gradlew.bat %*
call gradlew.bat %*
exit /b %ERRORLEVEL%

:ready
echo [yala] Environment ready.
echo [yala] Next: cd into an app's android folder, then run gradlew.bat bundleRelease assembleRelease
exit /b 0

:no_jdk
echo [yala] ERROR: JDK not found at "%YALA_JDK%".
echo [yala] Install Android Studio or a JDK 17/21, then edit YALA_JDK in this script.
exit /b 1

:no_sdk
echo [yala] ERROR: Android SDK not found at "%YALA_SDK%".
echo [yala] Install the SDK with platform 36 and build-tools, then edit YALA_SDK here.
exit /b 1


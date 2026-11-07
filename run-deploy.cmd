@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Housseinou\Projects\Django\taxi-booking\scripts\deploy-admin-redesign.ps1" -BuildDir "C:\Users\Housseinou\Projects\Django\yala-release-74743e52\frontend\build" > "C:\Users\Housseinou\Projects\Django\taxi-booking\deploy.log" 2>&1
echo DEPLOY_EXIT=%ERRORLEVEL% > "C:\Users\Housseinou\Projects\Django\taxi-booking\deploy.exit"

@echo off
cd /d C:\Users\Housseinou\Projects\Django\taxi-booking\frontend\qa
node _regress-e2e.cjs http://127.0.0.1:5599 > C:\Users\Housseinou\Projects\Django\taxi-booking\e2e.log 2>&1
echo E2E_EXIT=%ERRORLEVEL% > C:\Users\Housseinou\Projects\Django\taxi-booking\e2e.exit

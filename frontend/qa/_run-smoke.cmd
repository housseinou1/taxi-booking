@echo off
cd /d C:\Users\Housseinou\Projects\Django\taxi-booking\frontend\qa
node _regress-smoke.cjs http://127.0.0.1:5599 > C:\Users\Housseinou\Projects\Django\taxi-booking\smoke.log 2>&1
echo SMOKE_EXIT=%ERRORLEVEL% > C:\Users\Housseinou\Projects\Django\taxi-booking\smoke.exit

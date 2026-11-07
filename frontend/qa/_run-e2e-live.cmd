@echo off
cd /d C:\Users\Housseinou\Projects\Django\taxi-booking\frontend\qa
node _regress-e2e.cjs https://www.yalataxi.live > C:\Users\Housseinou\Projects\Django\taxi-booking\e2e-live.log 2>&1
echo E2E_LIVE_EXIT=%ERRORLEVEL% > C:\Users\Housseinou\Projects\Django\taxi-booking\e2e-live.exit

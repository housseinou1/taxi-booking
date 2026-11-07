@echo off
cd /d C:\Users\Housseinou\Projects\Django\taxi-booking\frontend\qa
node _regress-smoke-live.cjs https://www.yalataxi.live > C:\Users\Housseinou\Projects\Django\taxi-booking\smoke-prod.log 2>&1
echo SMOKE_PROD_EXIT=%ERRORLEVEL% > C:\Users\Housseinou\Projects\Django\taxi-booking\smoke-prod.exit

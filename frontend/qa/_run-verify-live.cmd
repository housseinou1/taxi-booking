@echo off
cd /d C:\Users\Housseinou\Projects\Django\taxi-booking\frontend\qa
node _regress-e2e-verify.cjs https://www.yalataxi.live > C:\Users\Housseinou\Projects\Django\taxi-booking\verify-live.log 2>&1
echo VERIFY_EXIT=%ERRORLEVEL% > C:\Users\Housseinou\Projects\Django\taxi-booking\verify-live.exit

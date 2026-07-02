@echo off
echo Building Yala Delivery...

cd /d "%~dp0\..\frontend"
copy .env.delivery .env.local
call npm run build

rd /s /q "..\delivery-app\www" 2>nul
xcopy /s /e /i build "..\delivery-app\www"

cd /d "%~dp0\..\delivery-app"
node ..\frontend\scripts\stamp-native-app-type.js delivery www
call npx cap sync

echo Yala Delivery build complete!

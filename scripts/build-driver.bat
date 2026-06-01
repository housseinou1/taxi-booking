@echo off
echo Building Yala Driver...

cd /d "%~dp0\..\frontend"
copy .env.driver .env.local
call npm run build

rd /s /q "..\driver-app\www" 2>nul
xcopy /s /e /i build "..\driver-app\www"

cd /d "%~dp0\..\driver-app"
call npx cap sync

echo Yala Driver build complete!

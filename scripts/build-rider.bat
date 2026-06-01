@echo off
echo Building Yala Rider...

cd /d "%~dp0\..\frontend"
copy .env.rider .env.local
call npm run build

rd /s /q "..\rider-app\www" 2>nul
xcopy /s /e /i build "..\rider-app\www"

cd /d "%~dp0\..\rider-app"
call npx cap sync

echo Yala Rider build complete!

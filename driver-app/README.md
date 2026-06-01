# Yala Driver — Native Mobile App

## Prerequisites
- Node.js 18+
- For iOS: macOS with Xcode 15+
- For Android: Android Studio with SDK 24+

## Build
```bash
# From project root
./scripts/build-driver.sh

# Or on Windows
scripts\build-driver.bat
```

## Run
```bash
cd driver-app
npx cap open ios      # Opens in Xcode
npx cap open android  # Opens in Android Studio
```

## First Time Setup
```bash
cd driver-app
npm install
npx cap add ios
npx cap add android
```

## Development Workflow

1. Make changes in `../frontend/src/`
2. Run the build script to rebuild and sync
3. Use Xcode or Android Studio to run on device/simulator

## Environment

The driver app uses `frontend/.env.driver` which sets:
- `REACT_APP_TYPE=driver` — enables driver-specific routes and UI
- `REACT_APP_API_URL=https://api.yala.mr` — production API endpoint
- `REACT_APP_WS_URL=wss://api.yala.mr/ws/rides/` — WebSocket endpoint

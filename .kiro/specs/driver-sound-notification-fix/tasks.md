# Implementation Plan: Driver Sound Notification Fix

## Overview

Replace broken Web Audio / HTML5 Audio with Capacitor-native plugins for reliable sound and vibration on Android.

## Tasks

- [ ] 1. Install native audio and haptics plugins
  - Run `npm install @capacitor-community/native-audio @capacitor/haptics` in `frontend/`
  - Run `npm install @capacitor-community/native-audio @capacitor/haptics` in `driver-app/`
  - Run `npx cap sync android` in `driver-app/`
  - Verify plugins appear in `capacitor.config.ts` plugin list on sync
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 2. Create native sound module (`frontend/src/native/sound.js`)
  - Create `frontend/src/native/sound.js` with:
    - `preloadNotificationSound()` — calls `NativeAudio.preload({ assetId: 'notification', assetPath: 'public/notification.wav', isUrl: false })` when native
    - `playNativeSound()` — calls `NativeAudio.play({ assetId: 'notification' })` when native, returns Promise
    - `vibrateNative()` — calls `Haptics.vibrate()` when native, falls back to `navigator.vibrate()` for web
    - `isNativeSoundReady()` — returns true after successful preload
  - Import `isNative` from `./platform.js` for conditional logic
  - Wrap all plugin calls in try/catch with console.log fallback
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_

- [ ] 3. Update DriverApp.js to use native sound module
  - Import `{ preloadNotificationSound, playNativeSound, vibrateNative }` from `../native/sound`
  - In the audio init `useEffect` (line ~263): add `preloadNotificationSound()` call
  - In `unlockNotificationSound`: always set `soundEnabled=true` (native doesn't need unlock)
  - In `playNotificationSound`: 
    - If `isNative()`: call `playNativeSound()` + `vibrateNative()`
    - Else: keep existing Web Audio / HTML5 Audio path unchanged
  - In `ringForNewRequest`: keep the 3x delay pattern, replace `navigator.vibrate()` with `vibrateNative()`
  - _Requirements: 2.1, 2.3, 2.4, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Build and test driver APK
  - Build frontend with `.env.driver`
  - Copy to `driver-app/www/`
  - Run `npx cap sync android`
  - Build APK with `gradlew assembleDebug`
  - Install on device and test:
    - Go online as driver
    - Request a ride from rider
    - Verify sound plays
    - Verify vibration occurs
  - _Requirements: 2.1, 2.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```

## Notes

- The `notification.wav` file already exists in `driver-app/www/` and gets copied to Android assets via `cap sync`
- `@capacitor-community/native-audio` uses the Android MediaPlayer which bypasses WebView audio policies
- `@capacitor/haptics` uses the Android Vibrator service directly
- Web browser path remains completely unchanged (gated by `isNative()` check)
- No backend changes required

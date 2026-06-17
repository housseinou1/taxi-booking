# Design Document: Driver Sound Notification Fix

## Overview

This fix replaces the broken Web Audio API / HTML5 Audio approach with Capacitor-native plugins for sound playback and haptic feedback. The solution uses `@capacitor-community/native-audio` for reliable sound playback on Android and `@capacitor/haptics` for vibration, while preserving the existing Web Audio fallback for browser usage.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  DriverApp.js                        │
│                                                     │
│   ringForNewRequest()                               │
│        │                                            │
│        ▼                                            │
│   playNotificationSound()                           │
│        │                                            │
│        ▼                                            │
│   ┌─────────────────────┐                           │
│   │  isNative() check   │                           │
│   └──────┬──────┬───────┘                           │
│          │      │                                   │
│   Native │      │ Web                               │
│          ▼      ▼                                   │
│   ┌────────┐  ┌──────────────┐                      │
│   │ native │  │ Web Audio /  │                      │
│   │ sound  │  │ HTML5 Audio  │                      │
│   │ module │  │ (existing)   │                      │
│   └────────┘  └──────────────┘                      │
│                                                     │
└─────────────────────────────────────────────────────┘

Native Sound Module (frontend/src/native/sound.js):
┌─────────────────────────────────────────────────────┐
│  - preloadSound(id, path)                           │
│  - playSound(id)                                    │
│  - vibrate()                                        │
│  - isReady()                                        │
│                                                     │
│  Uses:                                              │
│  - @capacitor-community/native-audio (sound)        │
│  - @capacitor/haptics (vibration)                   │
│  - Graceful fallback if plugins unavailable         │
└─────────────────────────────────────────────────────┘
```

## Implementation Plan

### New File: `frontend/src/native/sound.js`

A thin abstraction over native plugins that:
1. Preloads the notification sound on app start
2. Plays it on demand (bypasses WebView restrictions)
3. Triggers native haptic vibration
4. Falls back gracefully if plugins aren't available (web mode)

### Changes to `frontend/src/driver/DriverApp.js`

1. Import the native sound module
2. In `useEffect` (init): call `preloadSound()` instead of `new Audio()`
3. In `unlockNotificationSound`: mark sound as ready (no unlock needed for native)
4. In `playNotificationSound`: call native `playSound()` + `vibrate()` when native, keep existing Web Audio path for browser
5. Remove the muted-play hack for Capacitor (not needed with native plugins)

### Dependencies to Install

- `@capacitor-community/native-audio` — Plays audio files natively on Android/iOS
- `@capacitor/haptics` — Native vibration/haptic feedback

### Audio File Placement

The `notification.wav` file must be placed in:
- `driver-app/android/app/src/main/assets/public/notification.wav` (already there via cap sync)
- Referenced as `notification.wav` (relative) for the native audio plugin

## Correctness Properties

1. **Native sound plays on Android**: When `isNative()=true` and a ride request arrives, `NativeAudio.play()` is called and the device plays the sound
2. **Native vibration works**: When `isNative()=true`, `Haptics.vibrate()` is called instead of `navigator.vibrate()`
3. **Web fallback preserved**: When `isNative()=false`, existing Web Audio / HTML5 Audio path is used unchanged
4. **Triple alert pattern preserved**: Sound still fires 3 times (0ms, 850ms, 1700ms)
5. **soundEnabled gate preserved**: No sound plays when `soundEnabled=false`

## Error Handling

- If native plugin fails to load (missing install): fall back to Web Audio silently
- If `NativeAudio.play()` rejects: log error, don't crash the app
- If `Haptics.vibrate()` rejects: log error, continue without vibration

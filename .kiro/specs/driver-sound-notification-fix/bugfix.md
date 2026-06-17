# Bugfix Requirements Document

## Introduction

The Yala Driver App (React + Capacitor for Android) fails to play sound notifications and vibrate when a new ride request arrives, even though the driver is online and the ride request is visually displayed. The root cause is that the current implementation relies on Web Audio API (`AudioContext` oscillator), HTML5 `Audio` element, and `navigator.vibrate()` — all of which are blocked or unsupported in Android's Capacitor WebView due to autoplay policies and missing native plugin support. This leaves drivers unaware of incoming ride requests unless they are actively looking at the screen.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the driver is online in the Capacitor Android app and a new ride request arrives THEN the system does not play any audible sound notification despite `playNotificationSound()` being called

1.2 WHEN `unlockNotificationSound()` is called during "Go Online" in the Capacitor WebView THEN the `audio.play()` call fails silently (caught and ignored), and the AudioContext may remain in "suspended" state, but `soundEnabled` is still set to `true` regardless of actual unlock success

1.3 WHEN `playNotificationSound()` attempts to play the HTML5 Audio element (`/notification.wav`) in the Capacitor WebView THEN the playback fails due to Android WebView autoplay restrictions, and the fallback `playBeep()` using AudioContext oscillator also fails because the context was never properly resumed

1.4 WHEN `navigator.vibrate()` is called in the Capacitor WebView THEN no vibration occurs because the Web Vibration API is not supported in Android WebView and no native Capacitor Haptics plugin is installed

1.5 WHEN the notification.wav file is referenced as `/notification.wav` in the Capacitor WebView THEN the file may not resolve correctly because Capacitor serves from a local server with a different base path than expected

### Expected Behavior (Correct)

2.1 WHEN the driver is online in the Capacitor Android app and a new ride request arrives THEN the system SHALL play an audible sound notification that is clearly heard by the driver

2.2 WHEN `unlockNotificationSound()` is called during "Go Online" THEN the system SHALL use a Capacitor-native audio mechanism (e.g., `@capacitor-community/native-audio` plugin or equivalent) to ensure sound playback is properly initialized and available on the device

2.3 WHEN `playNotificationSound()` is invoked THEN the system SHALL use a native audio plugin to play the notification sound, bypassing WebView autoplay restrictions entirely

2.4 WHEN a new ride request notification fires THEN the system SHALL trigger device vibration using the Capacitor Haptics plugin (`@capacitor/haptics`) to provide tactile feedback to the driver

2.5 WHEN the notification sound asset is loaded THEN the system SHALL reference the audio file from a location accessible by the native plugin (e.g., bundled in the `public/` assets or the native `assets` folder) rather than relying on WebView URL resolution

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the driver is online in a standard web browser (non-Capacitor) THEN the system SHALL CONTINUE TO use the existing Web Audio API and HTML5 Audio fallback for notification sounds

3.2 WHEN the driver taps "Go Online" THEN the system SHALL CONTINUE TO set `soundEnabled` to `true` and display "Sound alerts are enabled."

3.3 WHEN new ride IDs appear in `availableRides` and `soundEnabled` is `true` THEN the system SHALL CONTINUE TO call `ringForNewRequest()` which plays the notification sound 3 times with delays (at 0ms, 850ms, and 1700ms)

3.4 WHEN `soundEnabled` is `false` or the driver is offline THEN the system SHALL CONTINUE TO suppress sound notifications and not trigger audio playback

3.5 WHEN a ride request arrives THEN the system SHALL CONTINUE TO show the visual notification (ride card) and update `driverNotice` regardless of whether sound playback succeeds or fails

3.6 WHEN the app is running in the web browser THEN the system SHALL CONTINUE TO request Notification permission and show Web Notification API push notifications for new rides
